from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from pydantic import BaseModel
from datetime import datetime, timedelta

from app.auth import current_firebase_uid
from app.database import get_db
from app.escalations import is_deactivated, is_suspended
from app.models.partner import Partner
from app.models.user import User
from app.models.partner_document import PartnerDocument
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail
from app.models.service import Service
from app.routers.partner_service import resolve_partner
from app.routers.payment import calculate_split
from app.schemas.partner import PartnerCreate, PartnerResponse


router = APIRouter(
    prefix="/partners",
    tags=["Partners"]
)


@router.post("/", response_model=PartnerResponse)
def create_partner(
    partner_data: PartnerCreate,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == partner_data.user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    existing_partner = db.query(Partner).filter(
        Partner.user_id == partner_data.user_id
    ).first()

    if existing_partner:
        raise HTTPException(
            status_code=400,
            detail="This user is already a partner"
        )

    new_partner = Partner(
        user_id=partner_data.user_id,
        experience_years=partner_data.experience_years,
        hourly_rate=partner_data.hourly_rate,
        vehicle=partner_data.vehicle,
        vehicle_number=partner_data.vehicle_number,
        latitude=partner_data.latitude,
        longitude=partner_data.longitude
    )

    db.add(new_partner)
    db.commit()
    db.refresh(new_partner)

    return new_partner


@router.get("/", response_model=list[PartnerResponse])
def get_partners(
    db: Session = Depends(get_db)
):
    return db.query(Partner).all()


@router.get("/{partner_id}", response_model=PartnerResponse)
def get_partner(
    partner_id: UUID,
    db: Session = Depends(get_db)
):
    # Accepts either partners.id or the partner's users.id
    return get_partner_or_404(db, partner_id)

# =========================================================
# POLICE VERIFICATION
# Partner uploads a police clearance certificate; an admin then sets
# partners.police_verification_status to VERIFIED or REJECTED
# (e.g. in the Supabase table editor).
# =========================================================

POLICE_CERTIFICATE = "POLICE_CERTIFICATE"

ALLOWED_CERTIFICATE_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
}

MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024


def get_partner_or_404(db: Session, identifier: UUID) -> Partner:
    # Accepts either partners.id or users.id
    partner = resolve_partner(db, identifier)

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner not found"
        )

    return partner


def police_verification_response(partner: Partner, document):
    return {
        "partner_id": partner.id,
        "status": partner.police_verification_status,
        "rejection_reason": partner.police_rejection_reason,
        "file_name": document.file_name if document else None,
        "uploaded_at": document.uploaded_at if document else None
    }


@router.get("/{identifier}/police-verification")
def get_police_verification(
    identifier: UUID,
    db: Session = Depends(get_db)
):
    partner = get_partner_or_404(db, identifier)

    document = db.query(PartnerDocument).filter(
        PartnerDocument.partner_id == partner.id,
        PartnerDocument.document_type == POLICE_CERTIFICATE
    ).first()

    return police_verification_response(partner, document)


@router.post("/{identifier}/police-verification")
async def upload_police_certificate(
    identifier: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    partner = get_partner_or_404(db, identifier)

    if file.content_type not in ALLOWED_CERTIFICATE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Upload a PDF, JPG or PNG file"
        )

    data = await file.read()

    if not data:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is empty"
        )

    if len(data) > MAX_CERTIFICATE_BYTES:
        raise HTTPException(
            status_code=400,
            detail="File must be 5 MB or smaller"
        )

    # One certificate per partner; a new upload replaces the old one
    document = db.query(PartnerDocument).filter(
        PartnerDocument.partner_id == partner.id,
        PartnerDocument.document_type == POLICE_CERTIFICATE
    ).first()

    if not document:
        document = PartnerDocument(
            partner_id=partner.id,
            document_type=POLICE_CERTIFICATE
        )
        db.add(document)

    document.file_name = file.filename or "police-certificate"
    document.content_type = file.content_type
    document.data = data
    document.uploaded_at = datetime.utcnow()

    # Every new upload needs a fresh review
    partner.police_verification_status = "UNDER_REVIEW"
    partner.police_rejection_reason = None

    db.commit()
    db.refresh(partner)
    db.refresh(document)

    return police_verification_response(partner, document)


@router.get("/{identifier}/police-certificate")
def download_police_certificate(
    identifier: UUID,
    db: Session = Depends(get_db)
):
    # For admins reviewing the certificate before approving it
    partner = get_partner_or_404(db, identifier)

    document = db.query(PartnerDocument).filter(
        PartnerDocument.partner_id == partner.id,
        PartnerDocument.document_type == POLICE_CERTIFICATE
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="No police certificate uploaded"
        )

    return Response(
        content=document.data,
        media_type=document.content_type,
        headers={
            "Content-Disposition":
                f'inline; filename="{document.file_name}"'
        }
    )


# =========================================================
# PARTNER OVERVIEW
# Live dashboard numbers, calculated from the bookings stored in Supabase
# =========================================================

UPCOMING_STATUSES = ("ACCEPTED", "IN_PROGRESS")

# Used when a service has no duration set
DEFAULT_JOB_MINUTES = 60

ALLOWED_SERVICE_RADII_KM = (3, 5, 10, 15)


class ServiceRadiusUpdate(BaseModel):
    service_radius_km: int


@router.patch("/{identifier}/service-radius")
def update_service_radius(
    identifier: UUID,
    data: ServiceRadiusUpdate,
    db: Session = Depends(get_db)
):
    if data.service_radius_km not in ALLOWED_SERVICE_RADII_KM:
        raise HTTPException(
            status_code=400,
            detail="Service radius must be 3, 5, 10 or 15 km"
        )

    partner = get_partner_or_404(db, identifier)
    partner.service_radius_km = data.service_radius_km

    db.commit()

    return {
        "partner_id": partner.id,
        "service_radius_km": partner.service_radius_km
    }


class OnlineStatusUpdate(BaseModel):
    is_online: bool
    # Where the partner is when going online; customers see the distance
    latitude: Optional[float] = None
    longitude: Optional[float] = None


# Partners only receive bookings while online; only the partner can switch
@router.patch("/{identifier}/online")
def update_online_status(
    identifier: UUID,
    data: OnlineStatusUpdate,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    partner = get_partner_or_404(db, identifier)
    owner = db.get(User, partner.user_id)

    if not owner or owner.firebase_uid != firebase_uid:
        raise HTTPException(
            status_code=403,
            detail="You can only change your own status"
        )

    if data.is_online and is_deactivated(partner):
        raise HTTPException(
            status_code=403,
            detail="Your account has been deactivated by KOODAM, so you can't go online"
        )

    if data.is_online and is_suspended(partner):
        raise HTTPException(
            status_code=403,
            detail="Your account is suspended, so you can't go online yet"
        )

    partner.is_online = data.is_online

    if data.latitude is not None and data.longitude is not None:
        partner.latitude = data.latitude
        partner.longitude = data.longitude

    db.commit()

    return {
        "partner_id": partner.id,
        "is_online": partner.is_online
    }


def to_iso_utc(value: Optional[datetime]) -> Optional[str]:
    # Stored times are naive UTC; mark them so the browser converts correctly
    return f"{value.isoformat()}Z" if value else None


@router.get("/{identifier}/overview")
def get_partner_overview(
    identifier: UUID,
    tz_offset_minutes: int = 0,
    db: Session = Depends(get_db)
):
    """
    tz_offset_minutes is the browser's Date.getTimezoneOffset()
    (e.g. -330 for India), so "today" matches the partner's local day.
    """
    partner = get_partner_or_404(db, identifier)

    offset = timedelta(minutes=tz_offset_minutes)

    def local_date(value: Optional[datetime]):
        return (value - offset).date() if value else None

    today = local_date(datetime.utcnow())
    week_start = today - timedelta(days=6)

    rows = (
        db.query(Booking, BookingDetail)
        .outerjoin(BookingDetail, BookingDetail.booking_id == Booking.id)
        .filter(Booking.partner_id == partner.id)
        .all()
    )

    today_earnings = 0.0
    week_earnings = 0.0
    total_earnings = 0.0
    today_completed = 0
    total_completed = 0

    for booking, detail in rows:
        if detail and detail.payment_status == "PAID":
            # The partner's share after KOODAM's trust fee and commission,
            # not the full amount the customer paid
            paid = (
                detail.partner_payout
                if detail.partner_payout is not None
                else calculate_split(
                    detail.amount_paid or 0.0,
                    detail.extra_amount or 0.0
                )["partner_payout"]
            )
            paid_on = local_date(detail.paid_at)

            total_earnings += paid

            if paid_on == today:
                today_earnings += paid

            if paid_on and week_start <= paid_on <= today:
                week_earnings += paid

        if booking.status == "COMPLETED":
            total_completed += 1

            if detail and local_date(detail.completed_at) == today:
                today_completed += 1

    # Enough to fill the partner's calendar, not just the dashboard list
    upcoming = (
        db.query(Booking, Service, User)
        .join(Service, Service.id == Booking.service_id)
        .join(User, User.id == Booking.user_id)
        .filter(
            Booking.partner_id == partner.id,
            Booking.status.in_(UPCOMING_STATUSES)
        )
        .order_by(Booking.booking_time.asc())
        .limit(100)
        .all()
    )

    return {
        "partner_id": partner.id,
        "today_earnings": round(today_earnings, 2),
        "week_earnings": round(week_earnings, 2),
        "total_earnings": round(total_earnings, 2),
        "today_completed_jobs": today_completed,
        "total_completed_jobs": total_completed,
        "rating": round(partner.rating or 0.0, 2),
        "reviews_count": partner.reviews_count or 0,
        "service_radius_km": partner.service_radius_km or 5,
        "is_online": bool(partner.is_online),
        "upcoming_jobs": [
            {
                "booking_id": booking.id,
                "title": service.title,
                "category": service.category,
                "customer_name": user.name,
                "address": booking.address,
                "amount": booking.total_amount,
                "status": booking.status,
                "booking_time": to_iso_utc(booking.booking_time),
                "duration_minutes": (
                    service.duration_minutes or DEFAULT_JOB_MINUTES
                )
            }
            for booking, service, user in upcoming
        ]
    }


# =========================================================
# PARTNER BUSY SLOTS
# Times the partner is already booked, so customers can't pick them.
# Only start and end times are returned, never customer details.
# =========================================================

@router.get("/{identifier}/busy-slots")
def get_partner_busy_slots(
    identifier: UUID,
    db: Session = Depends(get_db)
):
    partner = get_partner_or_404(db, identifier)

    rows = (
        db.query(Booking, Service)
        .join(Service, Service.id == Booking.service_id)
        .filter(
            Booking.partner_id == partner.id,
            Booking.status.in_(UPCOMING_STATUSES),
            Booking.booking_time >= datetime.utcnow() - timedelta(days=1)
        )
        .order_by(Booking.booking_time.asc())
        .all()
    )

    return [
        {
            "start": to_iso_utc(booking.booking_time),
            "end": to_iso_utc(
                booking.booking_time + timedelta(
                    minutes=service.duration_minutes or DEFAULT_JOB_MINUTES
                )
            )
        }
        for booking, service in rows
    ]
