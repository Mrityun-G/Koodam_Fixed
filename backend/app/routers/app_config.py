from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.app_config import CONTENT, SETTINGS, content, save_value, setting
from app.config import IVR_PHONE_NUMBER
from app.database import get_db
from app.models.user import User
from app.routers.escalations import require_admin


# =========================================================
# APP SETTINGS AND CONTENT
# Anyone can read them (the app shows them before sign-in too);
# only KOODAM staff can change them.
# =========================================================

router = APIRouter(tags=["App settings"])


# Prices the app shows, so they always match what the backend charges
@router.get("/config")
def public_config():
    return {
        "trust_fee": setting("trust_fee"),
        "platform_commission_percent": setting("platform_commission_percent"),
        "min_withdrawal": setting("min_withdrawal"),
        # The number customers without a smartphone call to book
        "phone_booking_number": IVR_PHONE_NUMBER,
    }


@router.get("/content")
def app_content():
    return {key: content(key) for key in CONTENT}


# ---------------------------------------------------------
# KOODAM staff
# ---------------------------------------------------------

class SettingsUpdate(BaseModel):
    trust_fee: Optional[float] = None
    platform_commission_percent: Optional[float] = None
    min_withdrawal: Optional[float] = None


@router.put("/admin/settings")
def update_settings(
    data: SettingsUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    for key, value in data.model_dump(exclude_none=True).items():
        spec = SETTINGS[key]

        if not spec["min"] <= value <= spec["max"]:
            raise HTTPException(
                status_code=400,
                detail=f"{key.replace('_', ' ')} must be between {spec['min']} and {spec['max']}"
            )

        save_value(db, key, round(value, 2), admin.email)

    return public_config()


class FaqItem(BaseModel):
    q: str = Field(min_length=3, max_length=300)
    a: str = Field(min_length=3, max_length=2000)


class TermsSection(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    points: list[str] = Field(min_length=1, max_length=30)


class OfflineStep(BaseModel):
    icon: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=2, max_length=120)
    desc: str = Field(min_length=2, max_length=400)


class ComplaintReason(BaseModel):
    value: str = Field(pattern=r"^[A-Z][A-Z_]{1,29}$")
    label: str = Field(min_length=2, max_length=80)


CONTENT_ITEM = {
    "faq": FaqItem,
    "terms": TermsSection,
    "offline_steps": OfflineStep,
    "complaint_reasons": ComplaintReason,
}


@router.put("/admin/content/{key}")
def update_content(
    key: str,
    items: list[dict],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    model = CONTENT_ITEM.get(key)

    if not model:
        raise HTTPException(status_code=404, detail="Unknown content")

    if not 1 <= len(items) <= 50:
        raise HTTPException(status_code=400, detail="Add between 1 and 50 entries")

    try:
        cleaned = [model(**item).model_dump() for item in items]
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Check the entries: {error}")

    if key == "complaint_reasons":
        values = [item["value"] for item in cleaned]
        missing = {item["value"] for item in CONTENT[key]} - set(values)

        if len(set(values)) != len(values):
            raise HTTPException(status_code=400, detail="Each reason needs its own code")

        # Older complaints and phone callers use these
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"These reasons can be renamed but not removed: {', '.join(sorted(missing))}"
            )

    save_value(db, key, cleaned, admin.email)

    return content(key)
