import hashlib
import hmac
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import (
    PLATFORM_COMMISSION_PERCENT,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    TRUST_FEE,
)
from app.database import get_db
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail, BookingExtraCharge
from app.models.payout import BookingPayout
from app.razorpay_client import razorpay_request, to_paise
from app.routers.payouts import safely_transfer


# =========================================================
# PAYMENTS
# The backend creates every Razorpay order from its own copy of the bill,
# and only marks a booking PAID after checking the payment with Razorpay.
# The customer's browser can no longer decide what was paid.
# =========================================================

router = APIRouter(
    prefix="/payments",
    tags=["Payments"]
)


class CreateOrderRequest(BaseModel):
    firebase_order_id: str
    # The total the customer sees; must match the backend's bill
    amount: float


class VerifyPaymentRequest(BaseModel):
    firebase_order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def get_booking_for_order(db: Session, firebase_order_id: str):
    detail = db.query(BookingDetail).filter(
        BookingDetail.firebase_order_id == firebase_order_id
    ).first()

    booking = (
        db.query(Booking).filter(Booking.id == detail.booking_id).first()
        if detail else None
    )

    if not detail or not booking:
        raise HTTPException(
            status_code=404,
            detail="This booking hasn't reached the server yet. Please try again in a moment."
        )

    return booking, detail


def approved_extras_total(db: Session, booking_id) -> float:
    charges = db.query(BookingExtraCharge).filter(
        BookingExtraCharge.booking_id == booking_id,
        BookingExtraCharge.status == "APPROVED"
    ).all()

    return sum(charge.amount or 0.0 for charge in charges)


def calculate_split(total: float, extras: float) -> dict:
    """
    total  = service price + trust fee + approved extra parts
    KOODAM keeps the trust fee and a commission on the service price.
    The partner gets the rest of the service price plus every extra part,
    since parts are their own cost.
    """
    trust_fee = min(TRUST_FEE, max(total - extras, 0.0))
    service_price = max(total - extras - trust_fee, 0.0)
    commission = round(service_price * PLATFORM_COMMISSION_PERCENT / 100, 2)
    partner_payout = round(service_price - commission + extras, 2)

    return {
        "total": round(total, 2),
        "service_price": round(service_price, 2),
        "extras": round(extras, 2),
        "trust_fee": round(trust_fee, 2),
        "commission_percent": PLATFORM_COMMISSION_PERCENT,
        "commission": commission,
        "koodam_share": round(trust_fee + commission, 2),
        "partner_payout": partner_payout
    }


@router.post("/create-order")
def create_payment_order(
    data: CreateOrderRequest,
    db: Session = Depends(get_db)
):
    booking, detail = get_booking_for_order(db, data.firebase_order_id)

    if detail.payment_status == "PAID":
        raise HTTPException(
            status_code=409,
            detail="This booking is already paid."
        )

    if booking.status != "COMPLETED":
        raise HTTPException(
            status_code=409,
            detail="Payment opens once the partner's work is verified as complete."
        )

    # Every extra part must be approved or declined before the bill is final
    has_pending_extras = db.query(BookingExtraCharge).filter(
        BookingExtraCharge.booking_id == booking.id,
        BookingExtraCharge.status == "PENDING"
    ).first()

    if has_pending_extras:
        raise HTTPException(
            status_code=409,
            detail="Approve or decline the extra parts cost before paying."
        )

    total = booking.total_amount or 0.0

    if total <= 0:
        raise HTTPException(
            status_code=409,
            detail="This booking has no amount to pay."
        )

    # The bill on the customer's screen must match the server's copy,
    # e.g. an extra part approved a moment ago may still be syncing
    if abs(to_paise(total) - to_paise(data.amount)) > 0:
        raise HTTPException(
            status_code=409,
            detail="Your bill is still updating. Please wait a moment and try again."
        )

    order = razorpay_request("POST", "/orders", {
        "amount": to_paise(total),
        "currency": "INR",
        "receipt": data.firebase_order_id[:40],
        "notes": {
            "booking_id": str(booking.id),
            "firebase_order_id": data.firebase_order_id
        }
    })

    detail.razorpay_order_id = order["id"]
    db.commit()

    return {
        "razorpay_order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "key_id": RAZORPAY_KEY_ID
    }


@router.post("/verify")
def verify_payment(
    data: VerifyPaymentRequest,
    db: Session = Depends(get_db)
):
    booking, detail = get_booking_for_order(db, data.firebase_order_id)

    # Already confirmed (e.g. the app retried): report the same result
    if (
        detail.payment_status == "PAID"
        and detail.razorpay_payment_id == data.razorpay_payment_id
    ):
        # The first check may have stopped before the partner's transfer
        if not db.get(BookingPayout, detail.booking_id):
            safely_transfer(db, booking, detail)

        return payment_result(detail)

    if data.razorpay_order_id != detail.razorpay_order_id:
        raise HTTPException(
            status_code=400,
            detail="This payment doesn't belong to this booking."
        )

    # 1. Razorpay signs order_id|payment_id with our secret; a forged or
    #    altered response fails this check
    expected_signature = hmac.new(
        (RAZORPAY_KEY_SECRET or "").encode(),
        f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, data.razorpay_signature):
        raise HTTPException(
            status_code=400,
            detail="Payment signature is invalid."
        )

    # 2. Ask Razorpay directly what was actually paid
    payment = razorpay_request("GET", f"/payments/{data.razorpay_payment_id}")
    expected_paise = to_paise(booking.total_amount)

    if (
        payment.get("order_id") != data.razorpay_order_id
        or payment.get("amount") != expected_paise
        or payment.get("currency") != "INR"
    ):
        raise HTTPException(
            status_code=400,
            detail="Payment amount doesn't match the bill."
        )

    # Accounts without auto-capture leave the money "authorized"; capture it
    if payment.get("status") == "authorized":
        payment = razorpay_request(
            "POST",
            f"/payments/{data.razorpay_payment_id}/capture",
            {"amount": expected_paise, "currency": "INR"}
        )

    if payment.get("status") != "captured":
        raise HTTPException(
            status_code=400,
            detail=f"Payment is {payment.get('status')}, not completed."
        )

    # 3. Record it, with how the money is split
    extras = approved_extras_total(db, booking.id)
    split = calculate_split(booking.total_amount or 0.0, extras)

    detail.payment_status = "PAID"
    detail.amount_paid = payment["amount"] / 100
    detail.razorpay_payment_id = data.razorpay_payment_id
    detail.paid_at = datetime.utcnow()
    detail.trust_fee = split["trust_fee"]
    detail.commission_amount = split["commission"]
    detail.partner_payout = split["partner_payout"]

    booking.status = "COMPLETED"

    db.commit()

    # 4. Send the partner's share to their bank via Razorpay Route.
    #    If their bank account isn't set up yet, it waits until it is.
    safely_transfer(db, booking, detail)

    return payment_result(detail, split)


def payment_result(detail: BookingDetail, split: dict = None) -> dict:
    return {
        "payment_status": detail.payment_status,
        "razorpay_payment_id": detail.razorpay_payment_id,
        "amount_paid": detail.amount_paid,
        "paid_at": f"{detail.paid_at.isoformat()}Z" if detail.paid_at else None,
        "trust_fee": detail.trust_fee,
        "commission": detail.commission_amount,
        "partner_payout": detail.partner_payout,
        **({"split": split} if split else {})
    }
