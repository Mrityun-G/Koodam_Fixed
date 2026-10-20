"""
Where front-end crashes get reported.

The app had no error tracking at all: a bad render showed a white screen
and nobody found out. The browser posts here instead, the row lands in
Postgres, and a line goes to stdout so it also shows up in the Render
logs next to the request that caused it.

Reporting does not require a sign-in - the most important crashes are the
ones that happen before the user gets logged in - so the payload is
treated as untrusted: every field is length-capped, and the rate limiter
gives this path the strict allowance.
"""

import hashlib
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import verify_firebase_token
from app.authz import require_admin
from app.database import get_db
from app.models.client_error import ClientError
from app.models.user import User

logger = logging.getLogger("koodam.client")

router = APIRouter(tags=["Diagnostics"])

MAX_STACK = 8000


class ErrorReport(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    stack: Optional[str] = Field(default=None, max_length=MAX_STACK)
    source: str = Field(default="window", max_length=20)
    screen: Optional[str] = Field(default=None, max_length=60)
    app_version: Optional[str] = Field(default=None, max_length=40)


def fingerprint_of(report: ErrorReport) -> str:
    """Same message and same top stack frame means the same fault."""
    first_frame = ""

    if report.stack:
        for line in report.stack.splitlines():
            if line.strip().startswith("at "):
                first_frame = line.strip()
                break

    raw = f"{report.source}|{report.message}|{first_frame}"

    return hashlib.sha256(raw.encode()).hexdigest()[:32]


@router.post("/client-errors")
def report_client_error(
    report: ErrorReport,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    user_agent: Optional[str] = Header(default=None)
):
    # Attach the user when the request happens to carry a valid token,
    # but never fail the report over a bad one: we want the crash either way.
    user_id = None

    if authorization and authorization.lower().startswith("bearer "):
        try:
            claims = verify_firebase_token(authorization.split(" ", 1)[1].strip())
            user = db.query(User).filter(
                User.firebase_uid == claims.get("sub")
            ).first()
            user_id = user.id if user else None
        except Exception:
            user_id = None

    fingerprint = fingerprint_of(report)

    logger.error(
        "client error [%s] on %s: %s",
        report.source,
        report.screen or "unknown",
        report.message
    )

    existing = db.query(ClientError).filter(
        ClientError.fingerprint == fingerprint
    ).first()

    if existing:
        existing.times_seen = (existing.times_seen or 1) + 1
        existing.last_seen = datetime.utcnow()

        if user_id:
            existing.user_id = user_id
    else:
        db.add(ClientError(
            fingerprint=fingerprint,
            message=report.message,
            stack=(report.stack or "")[:MAX_STACK] or None,
            source=report.source,
            screen=report.screen,
            user_id=user_id,
            user_agent=(user_agent or "")[:400] or None,
            app_version=report.app_version
        ))

    db.commit()

    # The browser does not need anything back, and should not learn
    # whether this fault was already known.
    return {"received": True}


@router.get("/admin/client-errors")
def list_client_errors(
    limit: int = 50,
    db: Session = Depends(get_db),
    caller: User = Depends(require_admin)
):
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be 1-200")

    rows = (
        db.query(ClientError)
        .order_by(ClientError.last_seen.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": row.id,
            "message": row.message,
            "source": row.source,
            "screen": row.screen,
            "times_seen": row.times_seen,
            "stack": row.stack,
            "user_agent": row.user_agent,
            "app_version": row.app_version,
            "first_seen": f"{row.first_seen.isoformat()}Z" if row.first_seen else None,
            "last_seen": f"{row.last_seen.isoformat()}Z" if row.last_seen else None,
        }
        for row in rows
    ]
