from datetime import datetime, timedelta
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, aliased

from app.auth import current_firebase_uid
from app.config import (
    ADMIN_EMAILS,
    COMPLAINT_RESPONSE_HOURS,
    STRIKES_TO_SUSPEND,
    STRIKE_WINDOW_DAYS,
    SUSPENSION_DAYS,
)
from app.database import get_db
from app.escalations import (
    is_deactivated,
    is_suspended,
    penalize,
    refresh_suspension,
    safe_sweep,
)
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail
from app.models.escalation import Complaint, PartnerEscalation
from app.models.partner import Partner
from app.models.service import Service
from app.models.user import User


# =========================================================
# COMPLAINTS AND ESCALATIONS
# Customers raise complaints, partners reply, and KOODAM staff
# (KOODAM_ADMIN_EMAILS) review escalations and can overturn them.
# =========================================================

router = APIRouter(tags=["Escalations"])

REASONS = {
    "NO_SHOW": "Partner didn't turn up",
    "LATE": "Partner was very late",
    "POOR_WORK": "Work was poor or unfinished",
    "OVERCHARGED": "Charged more than agreed",
    "BEHAVIOUR": "Rude or unsafe behaviour",
    "OTHER": "Something else",
}

SOURCE_LABELS = {
    "COMPLAINT_UNANSWERED": "Didn't reply to a complaint in time",
    "COMPLAINT_UPHELD": "Customer complaint upheld by KOODAM",
    "JOB_NOT_STARTED": "Accepted job not started on time",
    "JOB_NOT_FINISHED": "Started job not finished on time",
    "ADMIN": "Escalated by KOODAM",
}

# Bookings a customer can complain about: a partner had taken the job
COMPLAINABLE_STATUSES = ("ACCEPTED", "IN_PROGRESS", "COMPLETED", "CANCELLED")


def to_iso_utc(value: Optional[datetime]) -> Optional[str]:
    return f"{value.isoformat()}Z" if value else None


def complaint_response(complaint: Complaint) -> dict:
    return {
        "id": complaint.id,
        "booking_id": complaint.booking_id,
        "reason": complaint.reason,
        "reason_label": REASONS.get(complaint.reason, complaint.reason),
        "description": complaint.description,
        "status": complaint.status,
        "partner_response": complaint.partner_response,
        "admin_note": complaint.admin_note,
        "created_at": to_iso_utc(complaint.created_at),
        "respond_by": to_iso_utc(complaint.respond_by),
        "responded_at": to_iso_utc(complaint.responded_at),
        "closed_at": to_iso_utc(complaint.closed_at),
    }


def escalation_response(escalation: PartnerEscalation) -> dict:
    return {
        "id": escalation.id,
        "booking_id": escalation.booking_id,
        "complaint_id": escalation.complaint_id,
        "source": escalation.source,
        "source_label": SOURCE_LABELS.get(escalation.source, escalation.source),
        "severity": escalation.severity,
        "reason": escalation.reason,
        "status": escalation.status,
        "created_at": to_iso_utc(escalation.created_at),
        "overturned_at": to_iso_utc(escalation.overturned_at),
        "overturn_note": escalation.overturn_note,
    }


def complaints_by_booking(db: Session, booking_ids: list) -> dict:
    """Each booking's complaint, for showing on bills."""
    if not booking_ids:
        return {}

    return {
        complaint.booking_id: complaint_response(complaint)
        for complaint in db.query(Complaint).filter(
            Complaint.booking_id.in_(booking_ids)
        )
    }


def signed_in_user(db: Session, firebase_uid: str) -> User:
    user = db.query(User).filter(User.firebase_uid == firebase_uid).first()

    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    return user


def is_admin(user: User) -> bool:
    return (user.email or "").strip().lower() in ADMIN_EMAILS


def require_admin(
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
) -> User:
    user = signed_in_user(db, firebase_uid)

    if not is_admin(user):
        raise HTTPException(status_code=403, detail="KOODAM staff only")

    return user


def get_complaint(db: Session, complaint_id: UUID) -> Complaint:
    complaint = db.get(Complaint, complaint_id)

    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    return complaint


# ---------------------------------------------------------
# Customers
# ---------------------------------------------------------

class ComplaintCreate(BaseModel):
    booking_id: UUID
    reason: Literal[tuple(REASONS)]
    description: str = Field(default="", max_length=1000)


@router.post("/complaints")
def create_complaint(
    data: ComplaintCreate,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    customer = signed_in_user(db, firebase_uid)
    booking = db.get(Booking, data.booking_id)

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Usually another tab signed this browser in as someone else (e.g. the
    # partner): Firebase keeps one sign-in per browser
    if booking.user_id != customer.id:
        raise HTTPException(
            status_code=403,
            detail=(
                f"You're signed in as {customer.name}, but this job belongs to "
                "another account. Sign in again with the customer's account."
            )
        )

    if booking.status not in COMPLAINABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="You can report a problem once a partner has taken the job."
        )

    if db.query(Complaint).filter(Complaint.booking_id == booking.id).first():
        raise HTTPException(
            status_code=409,
            detail="You've already reported a problem with this job."
        )

    now = datetime.utcnow()

    complaint = Complaint(
        booking_id=booking.id,
        partner_id=booking.partner_id,
        customer_id=customer.id,
        reason=data.reason,
        description=data.description.strip() or None,
        created_at=now,
        respond_by=now + timedelta(hours=COMPLAINT_RESPONSE_HOURS)
    )

    db.add(complaint)
    db.commit()

    return complaint_response(complaint)


def own_customer_complaint(db: Session, complaint_id: UUID, firebase_uid: str):
    complaint = get_complaint(db, complaint_id)

    if complaint.customer_id != signed_in_user(db, firebase_uid).id:
        raise HTTPException(status_code=404, detail="Complaint not found")

    return complaint


@router.post("/complaints/{complaint_id}/resolve")
def resolve_complaint(
    complaint_id: UUID,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    """The customer is happy; the complaint closes with no penalty."""
    complaint = own_customer_complaint(db, complaint_id, firebase_uid)

    if complaint.status not in ("OPEN", "RESPONDED"):
        raise HTTPException(status_code=409, detail="This complaint is already closed.")

    complaint.status = "RESOLVED"
    complaint.closed_at = datetime.utcnow()
    db.commit()

    return complaint_response(complaint)


@router.post("/complaints/{complaint_id}/escalate")
def escalate_complaint(
    complaint_id: UUID,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    """The customer isn't satisfied with the reply; KOODAM staff decide."""
    complaint = own_customer_complaint(db, complaint_id, firebase_uid)

    if complaint.status != "RESPONDED":
        raise HTTPException(
            status_code=409,
            detail="You can escalate once the partner has replied."
        )

    complaint.status = "NEEDS_REVIEW"
    db.commit()

    return complaint_response(complaint)


# ---------------------------------------------------------
# Partners
# ---------------------------------------------------------

def own_partner(db: Session, identifier: UUID, firebase_uid: str) -> Partner:
    row = (
        db.query(Partner, User)
        .join(User, User.id == Partner.user_id)
        .filter(or_(Partner.id == identifier, Partner.user_id == identifier))
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Partner not found")

    partner, user = row

    if user.firebase_uid != firebase_uid:
        raise HTTPException(
            status_code=403,
            detail="You can only see your own record."
        )

    return partner


class ComplaintReply(BaseModel):
    response: str = Field(min_length=3, max_length=1000)


@router.post("/complaints/{complaint_id}/respond")
def respond_to_complaint(
    complaint_id: UUID,
    data: ComplaintReply,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    complaint = get_complaint(db, complaint_id)
    own_partner(db, complaint.partner_id, firebase_uid)

    if complaint.status != "OPEN":
        raise HTTPException(
            status_code=409,
            detail="This complaint can't be answered any more."
        )

    if complaint.respond_by < datetime.utcnow():
        raise HTTPException(
            status_code=409,
            detail="The time to reply has passed; this complaint was escalated."
        )

    complaint.partner_response = data.response.strip()
    complaint.responded_at = datetime.utcnow()

    # A phone customer has no app to read the reply and accept or
    # escalate it, so KOODAM decides straight away
    detail = db.get(BookingDetail, complaint.booking_id)
    complaint.status = (
        "NEEDS_REVIEW"
        if detail and detail.source == "PHONE"
        else "RESPONDED"
    )
    db.commit()

    return complaint_response(complaint)


@router.get("/partners/{identifier}/reliability")
def get_partner_reliability(
    identifier: UUID,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    """The partner's own record: score, suspension, complaints, history."""
    partner = own_partner(db, identifier, firebase_uid)

    # Make sure anything overdue is on the record before showing it
    safe_sweep(db)
    db.refresh(partner)

    since = datetime.utcnow() - timedelta(days=STRIKE_WINDOW_DAYS)

    escalations = (
        db.query(PartnerEscalation)
        .filter(PartnerEscalation.partner_id == partner.id)
        .order_by(PartnerEscalation.created_at.desc())
        .limit(50)
        .all()
    )

    complaints = (
        db.query(Complaint, Service.title)
        .join(Booking, Booking.id == Complaint.booking_id)
        .join(Service, Service.id == Booking.service_id)
        .filter(Complaint.partner_id == partner.id)
        .order_by(Complaint.created_at.desc())
        .limit(50)
        .all()
    )

    recent_strikes = sum(
        1 for escalation in escalations
        if escalation.status == "ACTIVE"
        and escalation.severity == "STRIKE"
        and escalation.created_at > since
    )

    return {
        "reliability_score": partner.reliability_score,
        "suspended": is_suspended(partner),
        "suspended_until": to_iso_utc(partner.suspended_until),
        "deactivated": is_deactivated(partner),
        "deactivation_reason": partner.deactivation_reason,
        "recent_strikes": recent_strikes,
        "strikes_to_suspend": STRIKES_TO_SUSPEND,
        "strike_window_days": STRIKE_WINDOW_DAYS,
        "suspension_days": SUSPENSION_DAYS,
        "complaints": [
            {**complaint_response(complaint), "service_title": title}
            for complaint, title in complaints
        ],
        "escalations": [escalation_response(e) for e in escalations],
    }


# ---------------------------------------------------------
# KOODAM staff
# ---------------------------------------------------------

@router.get("/admin/me")
def admin_me(
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    return {"is_admin": is_admin(signed_in_user(db, firebase_uid))}


@router.get("/admin/escalations")
def admin_overview(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    safe_sweep(db)

    CustomerUser = aliased(User)
    PartnerUser = aliased(User)

    complaints = (
        db.query(Complaint, Service.title, CustomerUser.name, PartnerUser.name)
        .join(Booking, Booking.id == Complaint.booking_id)
        .join(Service, Service.id == Booking.service_id)
        .join(CustomerUser, CustomerUser.id == Complaint.customer_id)
        .join(Partner, Partner.id == Complaint.partner_id)
        .join(PartnerUser, PartnerUser.id == Partner.user_id)
        .filter(Complaint.status.in_(("NEEDS_REVIEW", "OPEN", "RESPONDED")))
        .order_by(Complaint.created_at.asc())
        .all()
    )

    escalations = (
        db.query(PartnerEscalation, PartnerUser.name)
        .join(Partner, Partner.id == PartnerEscalation.partner_id)
        .join(PartnerUser, PartnerUser.id == Partner.user_id)
        .order_by(PartnerEscalation.created_at.desc())
        .limit(100)
        .all()
    )

    partners = (
        db.query(Partner, PartnerUser.name)
        .join(PartnerUser, PartnerUser.id == Partner.user_id)
        .order_by(PartnerUser.name.asc())
        .all()
    )

    return {
        "complaints": [
            {
                **complaint_response(complaint),
                "service_title": title,
                "customer_name": customer_name,
                "partner_id": complaint.partner_id,
                "partner_name": partner_name,
            }
            for complaint, title, customer_name, partner_name in complaints
        ],
        "escalations": [
            {
                **escalation_response(escalation),
                "partner_id": escalation.partner_id,
                "partner_name": name,
            }
            for escalation, name in escalations
        ],
        "partners": [
            {
                "id": partner.id,
                "name": name,
                "reliability_score": partner.reliability_score,
                "suspended": is_suspended(partner),
                "suspended_until": to_iso_utc(partner.suspended_until),
                "deactivated": is_deactivated(partner),
                "deactivated_at": to_iso_utc(partner.deactivated_at),
                "deactivation_reason": partner.deactivation_reason,
            }
            for partner, name in partners
        ],
    }


class ComplaintDecision(BaseModel):
    decision: Literal["UPHOLD", "DISMISS"]
    # Leave empty to apply the usual rule (first one is a warning)
    severity: Optional[Literal["WARNING", "STRIKE"]] = None
    note: str = Field(default="", max_length=1000)


@router.post("/admin/complaints/{complaint_id}/decide")
def decide_complaint(
    complaint_id: UUID,
    data: ComplaintDecision,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    complaint = get_complaint(db, complaint_id)

    if complaint.status in ("RESOLVED", "UPHELD", "DISMISSED", "ESCALATED"):
        raise HTTPException(status_code=409, detail="This complaint is already closed.")

    complaint.admin_note = data.note.strip() or None
    complaint.closed_at = datetime.utcnow()

    if data.decision == "DISMISS":
        complaint.status = "DISMISSED"
    else:
        complaint.status = "UPHELD"
        penalize(
            db,
            db.get(Partner, complaint.partner_id),
            "COMPLAINT_UPHELD",
            f"Complaint upheld: {REASONS.get(complaint.reason, complaint.reason)}."
            + (f" {complaint.admin_note}" if complaint.admin_note else ""),
            booking_id=complaint.booking_id,
            complaint_id=complaint.id,
            severity=data.severity
        )

    db.commit()

    return complaint_response(complaint)


class ManualEscalation(BaseModel):
    partner_id: UUID
    booking_id: Optional[UUID] = None
    reason: str = Field(min_length=3, max_length=1000)
    severity: Optional[Literal["WARNING", "STRIKE"]] = None


@router.post("/admin/escalations")
def create_manual_escalation(
    data: ManualEscalation,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    partner = db.get(Partner, data.partner_id)

    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    if data.booking_id:
        booking = db.get(Booking, data.booking_id)

        if not booking or booking.partner_id != partner.id:
            raise HTTPException(
                status_code=404,
                detail="That booking isn't one of this partner's jobs."
            )

    escalation = penalize(
        db, partner, "ADMIN", data.reason.strip(),
        booking_id=data.booking_id,
        severity=data.severity
    )

    if not escalation:
        raise HTTPException(
            status_code=409,
            detail="This job has already been escalated by KOODAM."
        )

    db.commit()

    return escalation_response(escalation)


class Overturn(BaseModel):
    note: str = Field(min_length=3, max_length=1000)


@router.post("/admin/escalations/{escalation_id}/overturn")
def overturn_escalation(
    escalation_id: UUID,
    data: Overturn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    escalation = db.get(PartnerEscalation, escalation_id)

    if not escalation:
        raise HTTPException(status_code=404, detail="Escalation not found")

    if escalation.status != "ACTIVE":
        raise HTTPException(status_code=409, detail="Already overturned.")

    escalation.status = "OVERTURNED"
    escalation.overturned_at = datetime.utcnow()
    escalation.overturn_note = data.note.strip()

    db.flush()
    refresh_suspension(db, db.get(Partner, escalation.partner_id), new_strike=False)
    db.commit()

    return escalation_response(escalation)


# ---------------------------------------------------------
# Removing a partner. Unlike a suspension this has no end date and
# leaves no strike on their record; it lasts until KOODAM reactivates
# them. Jobs they already accepted can still be finished.
# ---------------------------------------------------------

class Deactivation(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


def admin_partner_response(partner: Partner) -> dict:
    return {
        "id": partner.id,
        "deactivated": is_deactivated(partner),
        "deactivated_at": to_iso_utc(partner.deactivated_at),
        "deactivation_reason": partner.deactivation_reason,
    }


@router.post("/admin/partners/{partner_id}/deactivate")
def deactivate_partner(
    partner_id: UUID,
    data: Deactivation,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    partner = db.get(Partner, partner_id)

    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    if is_deactivated(partner):
        raise HTTPException(status_code=409, detail="This partner is already deactivated.")

    partner.deactivated_at = datetime.utcnow()
    partner.deactivation_reason = data.reason.strip()
    # Stop new requests reaching them straight away
    partner.is_online = False

    db.commit()

    return admin_partner_response(partner)


@router.post("/admin/partners/{partner_id}/reactivate")
def reactivate_partner(
    partner_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    partner = db.get(Partner, partner_id)

    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    if not is_deactivated(partner):
        raise HTTPException(status_code=409, detail="This partner is already active.")

    partner.deactivated_at = None
    partner.deactivation_reason = None

    db.commit()

    return admin_partner_response(partner)
