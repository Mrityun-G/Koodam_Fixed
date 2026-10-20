"""
Who is allowed to see or change what.

app.auth proves *which Firebase account* made a request. This module turns
that into a KOODAM user and answers the next question: is this their own
data? Every router depends on something here, so a new endpoint can't
quietly ship without an owner check.
"""

from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import current_firebase_uid
from app.config import ADMIN_EMAILS
from app.database import get_db
from app.models.partner import Partner
from app.models.user import User


# =========================================================
# THE SIGNED-IN USER
# =========================================================

def signed_in_user(db: Session, firebase_uid: str) -> User:
    user = db.query(User).filter(User.firebase_uid == firebase_uid).first()

    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    return user


def require_user(
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
) -> User:
    """FastAPI dependency: the KOODAM user behind the request."""
    return signed_in_user(db, firebase_uid)


# =========================================================
# KOODAM STAFF
# =========================================================

def is_admin(user: User) -> bool:
    return (user.email or "").strip().lower() in ADMIN_EMAILS


def require_admin(user: User = Depends(require_user)) -> User:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="KOODAM staff only")

    return user


# =========================================================
# PARTNERS
# =========================================================

def resolve_partner(db: Session, identifier: UUID):
    """The partner named by either partners.id or their users.id."""
    return db.query(Partner).filter(
        or_(Partner.id == identifier, Partner.user_id == identifier)
    ).first()


def partner_or_404(db: Session, identifier: UUID) -> Partner:
    partner = resolve_partner(db, identifier)

    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    return partner


def owns_partner(user: User, partner: Partner) -> bool:
    return partner.user_id == user.id


def require_own_partner(
    db: Session,
    user: User,
    identifier: UUID
) -> Partner:
    """
    The partner record at `identifier`, but only if the caller is that
    partner (or KOODAM staff). Used for everything that changes a
    partner's own settings, money or documents.
    """
    partner = partner_or_404(db, identifier)

    if not owns_partner(user, partner) and not is_admin(user):
        raise HTTPException(
            status_code=403,
            detail="You can only change your own partner profile."
        )

    return partner


# =========================================================
# RECORDS BELONGING TO EITHER SIDE OF A BOOKING
# =========================================================

def require_booking_party(db: Session, user: User, booking) -> None:
    """
    Bookings are private to the customer, the assigned partner and
    KOODAM staff. Anyone else gets a 403.
    """
    if is_admin(user):
        return

    if booking.user_id == user.id:
        return

    partner = db.query(Partner).filter(Partner.user_id == user.id).first()

    if partner and booking.partner_id == partner.id:
        return

    raise HTTPException(
        status_code=403,
        detail="This booking isn't yours."
    )


def require_self(user: User, user_id: UUID) -> None:
    """A profile is readable and writable by its owner and staff only."""
    if user.id != user_id and not is_admin(user):
        raise HTTPException(
            status_code=403,
            detail="You can only view or change your own profile."
        )
