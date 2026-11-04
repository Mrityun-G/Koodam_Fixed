from datetime import datetime, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.auth import current_firebase_uid
from app.config import JOB_FINISH_GRACE_HOURS
from app.database import get_db
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail
from app.models.notification import Notification
from app.models.user import User
from app.routers.escalations import signed_in_user


# =========================================================
# THE SIGNED-IN USER'S OWN DATA
# Their settings, bell-icon notifications and the booking they still
# have to follow or pay, so all three follow them to any device and
# survive a reload.
# =========================================================

router = APIRouter(
    prefix="/me",
    tags=["Me"]
)

# How many notifications the bell list keeps per user
KEEP_NOTIFICATIONS = 50


def to_iso_utc(value: Optional[datetime]) -> Optional[str]:
    return f"{value.isoformat()}Z" if value else None


# ---------------------------------------------------------
# Settings
# ---------------------------------------------------------

class SettingsUpdate(BaseModel):
    language: Optional[Literal["en", "ta", "kn"]] = None
    notifications_enabled: Optional[bool] = None


def settings_response(user: User) -> dict:
    return {
        "language": user.language or "en",
        "notifications_enabled": user.notifications_enabled is not False,
    }


@router.get("/settings")
def get_settings(
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    return settings_response(signed_in_user(db, firebase_uid))


@router.put("/settings")
def update_settings(
    data: SettingsUpdate,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    user = signed_in_user(db, firebase_uid)

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)

    db.commit()

    return settings_response(user)


# ---------------------------------------------------------
# Notifications
# ---------------------------------------------------------

class NotificationCreate(BaseModel):
    target: Literal["member", "partner"]
    title: str = Field(min_length=1, max_length=200)
    desc: Optional[str] = Field(default=None, max_length=500)
    screen: Optional[str] = Field(default=None, max_length=50)
    tab: Optional[str] = Field(default=None, max_length=50)


class MarkRead(BaseModel):
    target: Literal["member", "partner"]


def notification_response(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "target": notification.target,
        "title": notification.title,
        "desc": notification.description,
        "screen": notification.screen,
        "tab": notification.tab,
        "unread": notification.unread,
        "created_at": to_iso_utc(notification.created_at),
    }


@router.get("/notifications")
def list_notifications(
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    user = signed_in_user(db, firebase_uid)

    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(KEEP_NOTIFICATIONS)
        .all()
    )

    return [notification_response(row) for row in rows]


@router.post("/notifications")
def add_notification(
    data: NotificationCreate,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    user = signed_in_user(db, firebase_uid)

    notification = Notification(
        user_id=user.id,
        target=data.target,
        title=data.title,
        description=data.desc,
        screen=data.screen,
        tab=data.tab,
    )
    db.add(notification)
    db.flush()

    # Keep the list short: drop the oldest beyond the limit
    stale = (
        db.query(Notification.id)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .offset(KEEP_NOTIFICATIONS)
        .all()
    )

    if stale:
        db.query(Notification).filter(
            Notification.id.in_([row.id for row in stale])
        ).delete(synchronize_session=False)

    db.commit()

    return notification_response(notification)


@router.post("/notifications/read")
def mark_read(
    data: MarkRead,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    user = signed_in_user(db, firebase_uid)

    db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.target == data.target,
        Notification.unread.is_(True)
    ).update({Notification.unread: False}, synchronize_session=False)
    db.commit()

    return {"ok": True}


# ---------------------------------------------------------
# Open booking
# ---------------------------------------------------------

@router.get("/open-booking")
def get_open_booking(
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    """
    The member's booking that still needs them, or null: a finished job
    that isn't paid yet, or one under way. The app remembers its booking
    only on the device, so after a logout, a cleared browser or on
    another phone it asks here - otherwise a completed job could no
    longer be paid once that memory was gone.

    An unpaid bill always counts. A job under way counts until
    JOB_FINISH_GRACE_HOURS after its booked time; past that it's overdue
    and escalated (app/escalations.py), not reopened on every login.
    The newest one wins when there are several.
    """
    user = signed_in_user(db, firebase_uid)

    overdue_before = datetime.utcnow() - timedelta(hours=JOB_FINISH_GRACE_HOURS)

    row = (
        db.query(Booking, BookingDetail)
        .join(BookingDetail, BookingDetail.booking_id == Booking.id)
        .filter(
            Booking.user_id == user.id,
            BookingDetail.firebase_order_id.isnot(None),
            # Phone bookings are settled on the call, not in the app
            or_(BookingDetail.source.is_(None), BookingDetail.source != "PHONE"),
            or_(
                and_(
                    Booking.status == "COMPLETED",
                    BookingDetail.payment_status != "PAID"
                ),
                and_(
                    Booking.status.in_(("ACCEPTED", "IN_PROGRESS")),
                    Booking.booking_time > overdue_before
                )
            )
        )
        .order_by(Booking.created_at.desc())
        .first()
    )

    if not row:
        return None

    booking, detail = row

    return {
        "firebase_order_id": detail.firebase_order_id,
        "status": booking.status,
        "payment_status": detail.payment_status
    }
