from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased
from typing import Optional, Union
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail, BookingExtraCharge
from app.models.partner import Partner
from app.models.review import Review
from app.models.service import Service
from app.models.user import User
from app.routers.partner_service import resolve_partner
from app.routers.payment import calculate_split


# =========================================================
# BOOKING SYNC
# The live booking flow runs in Firebase. Each device calls this
# endpoint whenever the order changes, so Supabase keeps a permanent
# record of the booking, its extra parts costs, payment and rating.
# Safe to call repeatedly: it creates the booking once, then updates it.
# =========================================================

router = APIRouter(
    prefix="/bookings",
    tags=["Booking Sync"]
)


Timestamp = Optional[Union[int, float, str]]


class ExtraChargeSync(BaseModel):
    firebase_charge_id: str
    item: str
    amount: float
    status: str = "PENDING"
    created_at: Timestamp = None
    responded_at: Timestamp = None


class BookingSync(BaseModel):
    firebase_order_id: str

    customer_id: Optional[str] = None
    partner_id: Optional[str] = None
    service_id: Optional[str] = None

    booking_status: Optional[str] = None
    current_step: Optional[int] = None

    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    total_amount: Optional[float] = None
    safety_pin: Optional[str] = None

    payment_status: Optional[str] = None
    amount_paid: Optional[float] = None
    razorpay_payment_id: Optional[str] = None

    # The date and time slot the customer chose for the visit
    scheduled_at: Timestamp = None

    created_at: Timestamp = None
    accepted_at: Timestamp = None
    completed_at: Timestamp = None
    paid_at: Timestamp = None

    extra_charges: list[ExtraChargeSync] = []

    rating: Optional[int] = None
    feedback: Optional[str] = None


def parse_timestamp(value: Timestamp) -> Optional[datetime]:
    # Firebase orders use both epoch milliseconds and ISO strings
    if value is None or value == "":
        return None

    try:
        if isinstance(value, (int, float)):
            return datetime.utcfromtimestamp(value / 1000)

        parsed = datetime.fromisoformat(
            str(value).replace("Z", "+00:00")
        )
        return parsed.replace(tzinfo=None)
    except (ValueError, OverflowError, OSError):
        return None


def parse_uuid(value: Optional[str]) -> Optional[UUID]:
    try:
        return UUID(str(value)) if value else None
    except ValueError:
        return None


def resolve_customer(db: Session, identifier: Optional[str]) -> Optional[User]:
    # The order stores either the Supabase user ID or the Firebase UID
    if not identifier:
        return None

    user_uuid = parse_uuid(identifier)

    if user_uuid:
        user = db.query(User).filter(User.id == user_uuid).first()
        if user:
            return user

    return db.query(User).filter(
        User.firebase_uid == identifier
    ).first()


def booking_status_for(data: BookingSync) -> str:
    status = (data.booking_status or "PENDING").upper()

    if status == "ACCEPTED" and (data.current_step or 0) >= 4:
        return "IN_PROGRESS"

    return status


def create_booking_record(db: Session, data: BookingSync):
    user = resolve_customer(db, data.customer_id)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Customer not found"
        )

    partner = db.query(Partner).filter(
        Partner.id == parse_uuid(data.partner_id)
    ).first()

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner not found"
        )

    service = db.query(Service).filter(
        Service.id == parse_uuid(data.service_id)
    ).first()

    if not service:
        raise HTTPException(
            status_code=404,
            detail="Service not found"
        )

    booking = Booking(
        user_id=user.id,
        partner_id=partner.id,
        service_id=service.id,
        booking_time=(
            parse_timestamp(data.scheduled_at)
            or parse_timestamp(data.created_at)
            or datetime.utcnow()
        ),
        status=booking_status_for(data),
        address=data.address,
        latitude=data.latitude,
        longitude=data.longitude,
        total_amount=data.total_amount or 0.0,
        safety_pin=data.safety_pin
    )

    db.add(booking)
    db.flush()

    detail = BookingDetail(
        booking_id=booking.id,
        firebase_order_id=data.firebase_order_id,
        base_amount=data.total_amount or 0.0
    )

    db.add(detail)

    return booking, detail


def sync_extra_charges(db: Session, booking: Booking, data: BookingSync) -> float:
    for charge in data.extra_charges:
        record = db.query(BookingExtraCharge).filter(
            BookingExtraCharge.booking_id == booking.id,
            BookingExtraCharge.firebase_charge_id == charge.firebase_charge_id
        ).first()

        if not record:
            record = BookingExtraCharge(
                booking_id=booking.id,
                firebase_charge_id=charge.firebase_charge_id
            )
            db.add(record)

        record.item = charge.item
        record.amount = charge.amount
        record.status = charge.status
        record.created_at = parse_timestamp(charge.created_at)
        record.responded_at = parse_timestamp(charge.responded_at)

    # Total from every stored charge, not just the ones in this request
    db.flush()

    approved = db.query(BookingExtraCharge).filter(
        BookingExtraCharge.booking_id == booking.id,
        BookingExtraCharge.status == "APPROVED"
    ).all()

    return sum(charge.amount for charge in approved)


def sync_review(db: Session, booking: Booking, data: BookingSync):
    # Same rules as POST /reviews: completed bookings only, one review each
    if not data.rating or not 1 <= data.rating <= 5:
        return

    if booking.status != "COMPLETED":
        return

    existing_review = db.query(Review).filter(
        Review.booking_id == booking.id
    ).first()

    if existing_review:
        return

    db.add(Review(
        booking_id=booking.id,
        user_id=booking.user_id,
        partner_id=booking.partner_id,
        rating=data.rating,
        feedback=data.feedback or None
    ))

    # Keep the partner's average rating current, as POST /reviews does
    partner = db.query(Partner).filter(
        Partner.id == booking.partner_id
    ).first()

    if partner:
        reviews_count = partner.reviews_count or 0
        total_reviews = reviews_count + 1

        partner.rating = (
            (partner.rating or 0.0) * reviews_count + data.rating
        ) / total_reviews
        partner.reviews_count = total_reviews


def apply_sync(db: Session, data: BookingSync) -> Booking:
    detail = db.query(BookingDetail).filter(
        BookingDetail.firebase_order_id == data.firebase_order_id
    ).first()

    if detail:
        booking = db.query(Booking).filter(
            Booking.id == detail.booking_id
        ).first()
    else:
        booking, detail = create_booking_record(db, data)

    booking.status = booking_status_for(data)

    scheduled_at = parse_timestamp(data.scheduled_at)

    if scheduled_at:
        booking.booking_time = scheduled_at

    # A paid bill is final; its total can't be changed afterwards
    if data.total_amount is not None and detail.payment_status != "PAID":
        booking.total_amount = data.total_amount

    if data.address:
        booking.address = data.address

    if data.latitude is not None and data.longitude is not None:
        booking.latitude = data.latitude
        booking.longitude = data.longitude

    detail.current_step = data.current_step
    detail.extra_amount = sync_extra_charges(db, booking, data)
    detail.base_amount = (booking.total_amount or 0.0) - detail.extra_amount

    # Payment is recorded only by POST /payments/verify after Razorpay
    # confirms it. The app can't mark a booking PAID (or undo one) here.
    if (
        data.payment_status
        and data.payment_status != "PAID"
        and detail.payment_status != "PAID"
    ):
        detail.payment_status = data.payment_status

    detail.accepted_at = parse_timestamp(data.accepted_at) or detail.accepted_at
    detail.completed_at = parse_timestamp(data.completed_at) or detail.completed_at

    sync_review(db, booking, data)

    return booking


def to_iso_utc(value: Optional[datetime]) -> Optional[str]:
    # Stored times are naive UTC; mark them so the browser converts correctly
    return f"{value.isoformat()}Z" if value else None


# =========================================================
# BILLING HISTORY
# Every booking a customer made, with its bill: service charge, the extra
# parts the partner added, what was paid and the payment reference.
# =========================================================

# Declined, expired and unanswered requests never produced a bill
BILLABLE_STATUSES = ("ACCEPTED", "IN_PROGRESS", "COMPLETED")


@router.get("/billing/{customer_identifier}")
def get_billing_history(
    customer_identifier: str,
    partner_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    user = resolve_customer(db, customer_identifier)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Customer not found"
        )

    filters = [Booking.user_id == user.id]

    # Only the work done by one partner, e.g. from the chat with them
    if partner_id:
        partner_uuid = parse_uuid(partner_id)

        if not partner_uuid:
            return []

        filters.append(Booking.partner_id == partner_uuid)

    return build_bills(db, filters)


@router.get("/partner-billing/{partner_identifier}")
def get_partner_billing(
    partner_identifier: str,
    customer_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    A partner's jobs with what they earned from each one. Pass customer_id
    to show only the jobs done for one customer (from the chat with them).
    """
    partner_uuid = parse_uuid(partner_identifier)
    partner = resolve_partner(db, partner_uuid) if partner_uuid else None

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner not found"
        )

    filters = [Booking.partner_id == partner.id]

    if customer_id:
        customer = resolve_customer(db, customer_id)

        if not customer:
            return []

        filters.append(Booking.user_id == customer.id)

    return build_bills(db, filters)


def build_bills(db: Session, filters: list) -> list:
    PartnerUser = aliased(User)
    CustomerUser = aliased(User)

    rows = (
        db.query(
            Booking, BookingDetail, Service, Partner, PartnerUser, CustomerUser
        )
        .outerjoin(BookingDetail, BookingDetail.booking_id == Booking.id)
        .join(Service, Service.id == Booking.service_id)
        .join(Partner, Partner.id == Booking.partner_id)
        .join(PartnerUser, PartnerUser.id == Partner.user_id)
        .join(CustomerUser, CustomerUser.id == Booking.user_id)
        .filter(Booking.status.in_(BILLABLE_STATUSES), *filters)
        .order_by(Booking.booking_time.desc())
        .all()
    )

    booking_ids = [booking.id for booking, *_ in rows]

    charges_by_booking = {}

    if booking_ids:
        charges = (
            db.query(BookingExtraCharge)
            .filter(BookingExtraCharge.booking_id.in_(booking_ids))
            .order_by(BookingExtraCharge.created_at.asc())
            .all()
        )

        for charge in charges:
            charges_by_booking.setdefault(charge.booking_id, []).append({
                "item": charge.item,
                "amount": charge.amount,
                "status": charge.status
            })

    bills = []

    for booking, detail, service, partner, partner_user, customer in rows:
        total = booking.total_amount or 0.0
        extra = detail.extra_amount if detail else 0.0

        # Paid bills use the split saved when the payment was verified;
        # others show what the split will be
        split = calculate_split(total, extra)

        if detail and detail.partner_payout is not None:
            split.update({
                "trust_fee": detail.trust_fee,
                "commission": detail.commission_amount,
                "partner_payout": detail.partner_payout
            })

        bills.append({
            "booking_id": booking.id,
            "service_title": service.title,
            "partner_id": partner.id,
            "partner_name": partner_user.name,
            "partner_avatar": partner_user.avatar,
            "customer_name": customer.name,
            "customer_avatar": customer.avatar,
            "status": booking.status,
            "booking_time": to_iso_utc(booking.booking_time),
            "completed_at": to_iso_utc(detail.completed_at if detail else None),
            "service_price": split["service_price"],
            "trust_fee": split["trust_fee"],
            "commission_percent": split["commission_percent"],
            "commission": split["commission"],
            "partner_payout": split["partner_payout"],
            "extra_amount": extra,
            "extra_charges": charges_by_booking.get(booking.id, []),
            "total_amount": total,
            "payment_status": detail.payment_status if detail else "PENDING",
            "amount_paid": detail.amount_paid if detail else 0.0,
            "razorpay_payment_id": detail.razorpay_payment_id if detail else None,
            "paid_at": to_iso_utc(detail.paid_at if detail else None)
        })

    return bills


@router.post("/sync")
def sync_booking(
    data: BookingSync,
    db: Session = Depends(get_db)
):
    try:
        booking = apply_sync(db, data)
        db.commit()
    except IntegrityError:
        # Both devices synced a new order at the same moment; the other
        # request created it, so apply this update to that record
        db.rollback()
        booking = apply_sync(db, data)
        db.commit()

    return {
        "booking_id": booking.id,
        "status": booking.status
    }
