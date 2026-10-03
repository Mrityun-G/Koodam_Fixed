import logging
import re
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import current_firebase_uid
from app.config import ROUTE_BUSINESS_CATEGORY, ROUTE_BUSINESS_SUBCATEGORY
from app.database import get_db
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail
from app.models.partner import Partner
from app.models.payout import BookingPayout, PartnerPayoutAccount
from app.models.service import Service
from app.models.user import User
from app.razorpay_client import razorpay_request, to_paise


# =========================================================
# PARTNER PAYOUTS (Razorpay Route)
# Each partner gets a Route "linked account" tied to their bank account.
# When a customer's payment is verified, the partner's share is
# transferred to that linked account straight away, and Razorpay pays it
# into their bank on its settlement schedule. KOODAM keeps the trust fee
# and commission; there is no balance for the partner to withdraw.
# =========================================================

router = APIRouter(
    prefix="/payouts",
    tags=["Payouts"]
)

logger = logging.getLogger(__name__)

# Payout states stored on booking_payouts.status
WAITING_FOR_ACCOUNT = "WAITING_FOR_ACCOUNT"
SENT = "SENT"
SETTLED = "SETTLED"
FAILED = "FAILED"
# Phone bookings: the customer paid the partner in cash, so nothing is
# transferred; the partner owes KOODAM its trust fee and commission
CASH_COLLECTED = "CASH_COLLECTED"

# How many in-transit transfers one payouts request re-checks with Razorpay
MAX_REFRESH_PER_REQUEST = 10


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def from_unix(value) -> Optional[datetime]:
    try:
        return datetime.utcfromtimestamp(int(value)) if value else None
    except (TypeError, ValueError):
        return None


def to_iso_utc(value: Optional[datetime]) -> Optional[str]:
    return f"{value.isoformat()}Z" if value else None


def get_own_partner(db: Session, identifier: UUID, firebase_uid: str):
    """
    The partner, their user and their payout account (None if not set up),
    only if the signed-in caller is that partner. One query for all three.
    """
    row = (
        db.query(Partner, User, PartnerPayoutAccount)
        .join(User, User.id == Partner.user_id)
        .outerjoin(
            PartnerPayoutAccount,
            PartnerPayoutAccount.partner_id == Partner.id
        )
        .filter(or_(Partner.id == identifier, Partner.user_id == identifier))
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Partner not found")

    partner, user, account = row

    if user.firebase_uid != firebase_uid:
        raise HTTPException(
            status_code=403,
            detail="You can only manage your own payouts."
        )

    return partner, user, account


def account_status_from(activation_status: Optional[str]) -> str:
    return {
        "activated": "ACTIVATED",
        "needs_clarification": "NEEDS_CLARIFICATION",
        "suspended": "SUSPENDED",
    }.get(activation_status or "", "UNDER_REVIEW")


def requirements_note(product: dict) -> Optional[str]:
    fields = [
        item.get("field_reference")
        for item in product.get("requirements") or []
        if item.get("field_reference")
    ]

    if not fields:
        return None

    return "Razorpay needs: " + ", ".join(fields)


def apply_product_status(account: PartnerPayoutAccount, product: dict):
    account.status = account_status_from(product.get("activation_status"))
    account.note = requirements_note(product)


def account_response(account: Optional[PartnerPayoutAccount]) -> dict:
    if not account:
        account = PartnerPayoutAccount(status="NOT_SET")

    return {
        "status": account.status or "NOT_SET",
        "note": account.note,
        "bank_last4": account.bank_last4,
        "ifsc": account.ifsc,
        "beneficiary_name": account.beneficiary_name,
    }


# ---------------------------------------------------------
# Transfers
# ---------------------------------------------------------

def partner_share(detail: BookingDetail) -> float:
    if detail.partner_payout is not None:
        return detail.partner_payout

    # Paid before the split was stored
    from app.routers.payment import calculate_split

    return calculate_split(
        detail.amount_paid or 0.0,
        detail.extra_amount or 0.0
    )["partner_payout"]


def apply_transfer(payout: BookingPayout, transfer: dict):
    payout.razorpay_transfer_id = transfer.get("id") or payout.razorpay_transfer_id
    payout.sent_at = (
        payout.sent_at
        or from_unix(transfer.get("processed_at"))
        or from_unix(transfer.get("created_at"))
        or datetime.utcnow()
    )

    if transfer.get("status") in ("failed", "reversed"):
        error = transfer.get("error") or {}
        payout.status = FAILED
        payout.error = (
            error.get("description")
            or f"Transfer {transfer.get('status')}"
        )
        return

    payout.error = None

    if transfer.get("settlement_status") == "settled":
        settlement = transfer.get("recipient_settlement") or {}
        payout.status = SETTLED
        payout.settled_at = (
            from_unix(settlement.get("created_at"))
            or payout.settled_at
            or datetime.utcnow()
        )
        payout.utr = settlement.get("utr") or payout.utr
    else:
        payout.status = SENT


def transfer_partner_payout(db: Session, booking: Booking, detail: BookingDetail):
    """
    Send the partner's share of a verified payment to their linked account.
    Never raises: a failed transfer is recorded on the booking and the
    customer's payment still counts as paid.
    """
    # Lock the row so a retried payment check can't transfer twice
    detail = (
        db.query(BookingDetail)
        .filter(BookingDetail.booking_id == detail.booking_id)
        .with_for_update()
        .populate_existing()
        .first()
    )

    if (
        not detail
        or detail.payment_status != "PAID"
        or not detail.razorpay_payment_id
    ):
        db.commit()
        return

    payout = db.get(BookingPayout, detail.booking_id)

    if payout and payout.razorpay_transfer_id:
        db.commit()
        return

    if not payout:
        payout = BookingPayout(
            booking_id=detail.booking_id,
            status=WAITING_FOR_ACCOUNT
        )
        db.add(payout)

    account = db.get(PartnerPayoutAccount, booking.partner_id)

    if (
        not account
        or not account.razorpay_account_id
        or account.status != "ACTIVATED"
    ):
        payout.status = WAITING_FOR_ACCOUNT
        db.commit()
        return

    amount = to_paise(partner_share(detail))

    if amount <= 0:
        payout.status = SETTLED
        db.commit()
        return

    try:
        response = razorpay_request(
            "POST",
            f"/payments/{detail.razorpay_payment_id}/transfers",
            {
                "transfers": [{
                    "account": account.razorpay_account_id,
                    "amount": amount,
                    "currency": "INR",
                    "notes": {
                        "booking_id": str(booking.id),
                        "firebase_order_id": detail.firebase_order_id
                    },
                    "linked_account_notes": ["booking_id"],
                    "on_hold": False
                }]
            }
        )
    except HTTPException as error:
        payout.status = FAILED
        payout.error = str(error.detail)
        db.commit()
        return

    items = response.get("items") or [response]
    apply_transfer(payout, items[0])
    db.commit()


def safely_transfer(db: Session, booking: Booking, detail: BookingDetail):
    try:
        transfer_partner_payout(db, booking, detail)
    except Exception:
        db.rollback()
        logger.exception("Partner payout transfer failed for %s", booking.id)


def release_waiting_payouts(
    db: Session,
    partner: Partner,
    account: Optional[PartnerPayoutAccount]
):
    """Transfer paid jobs that were waiting for the partner's bank account."""
    if not account or account.status != "ACTIVATED":
        return

    rows = (
        db.query(Booking, BookingDetail)
        .join(BookingDetail, BookingDetail.booking_id == Booking.id)
        .outerjoin(BookingPayout, BookingPayout.booking_id == Booking.id)
        .filter(
            Booking.partner_id == partner.id,
            BookingDetail.payment_status == "PAID",
            BookingPayout.razorpay_transfer_id.is_(None),
            # Paid before payouts existed (no row) or waiting for the account
            (BookingPayout.booking_id.is_(None))
            | (BookingPayout.status == WAITING_FOR_ACCOUNT)
        )
        .all()
    )

    for booking, detail in rows:
        safely_transfer(db, booking, detail)


def refresh_transfer(db: Session, payout: BookingPayout):
    try:
        transfer = razorpay_request(
            "GET",
            f"/transfers/{payout.razorpay_transfer_id}",
            params={"expand[]": "recipient_settlement"}
        )
    except HTTPException:
        # Keep showing the last known state
        return

    apply_transfer(payout, transfer)
    db.commit()


def refresh_account_status(
    db: Session,
    account: Optional[PartnerPayoutAccount]
):
    if (
        not account
        or not account.razorpay_account_id
        or not account.razorpay_product_id
        or account.status == "ACTIVATED"
    ):
        return

    try:
        product = razorpay_request(
            "GET",
            f"/accounts/{account.razorpay_account_id}/products/{account.razorpay_product_id}",
            version="v2"
        )
    except HTTPException:
        return

    apply_product_status(account, product)
    db.commit()


# ---------------------------------------------------------
# Bank account (linked account onboarding)
# ---------------------------------------------------------

class PayoutAccountRequest(BaseModel):
    beneficiary_name: str
    account_number: str
    ifsc: str
    pan: str
    phone: str
    street1: str
    street2: Optional[str] = None
    city: str
    state: str
    postal_code: str

    @field_validator("beneficiary_name")
    @classmethod
    def check_name(cls, value):
        value = " ".join(value.split())
        if len(value) < 4:
            raise ValueError("Enter the full name as on your bank account")
        return value

    @field_validator("account_number")
    @classmethod
    def check_account(cls, value):
        value = re.sub(r"\s", "", value)
        if not re.fullmatch(r"\d{9,18}", value):
            raise ValueError("Bank account number must be 9–18 digits")
        return value

    @field_validator("ifsc")
    @classmethod
    def check_ifsc(cls, value):
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", value):
            raise ValueError("Enter a valid 11-character IFSC code")
        return value

    @field_validator("pan")
    @classmethod
    def check_pan(cls, value):
        value = value.strip().upper()
        # The 4th letter is P for an individual's PAN
        if not re.fullmatch(r"[A-Z]{3}P[A-Z]\d{4}[A-Z]", value):
            raise ValueError("Enter your personal PAN (e.g. ABCPD1234E)")
        return value

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value):
        digits = re.sub(r"\D", "", value)[-10:]
        if not re.fullmatch(r"[6-9]\d{9}", digits):
            raise ValueError("Enter a valid 10-digit mobile number")
        return digits

    @field_validator("postal_code")
    @classmethod
    def check_pin(cls, value):
        value = value.strip()
        if not re.fullmatch(r"\d{6}", value):
            raise ValueError("Enter a valid 6-digit PIN code")
        return value

    @field_validator("street1", "city", "state")
    @classmethod
    def check_required(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value


@router.get("/partners/{identifier}/account")
def get_payout_account(
    identifier: UUID,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    partner, _, account = get_own_partner(db, identifier, firebase_uid)

    refresh_account_status(db, account)
    release_waiting_payouts(db, partner, account)

    return account_response(account)


@router.put("/partners/{identifier}/account")
def save_payout_account(
    data: PayoutAccountRequest,
    identifier: UUID,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    partner, user, account = get_own_partner(db, identifier, firebase_uid)

    if not account:
        account = PartnerPayoutAccount(partner_id=partner.id)
        db.add(account)

    # Each step's ID is saved as soon as Razorpay returns it, so if a later
    # step fails, saving again picks up where it stopped

    # 1. The linked account
    if not account.razorpay_account_id:
        linked_account = razorpay_request("POST", "/accounts", {
            "email": user.email,
            "phone": data.phone,
            "type": "route",
            "legal_business_name": data.beneficiary_name,
            "business_type": "individual",
            "contact_name": data.beneficiary_name,
            "profile": {
                "category": ROUTE_BUSINESS_CATEGORY,
                "subcategory": ROUTE_BUSINESS_SUBCATEGORY,
                "addresses": {
                    "registered": {
                        "street1": data.street1,
                        "street2": data.street2 or data.city,
                        "city": data.city,
                        "state": data.state.upper(),
                        "postal_code": data.postal_code,
                        "country": "IN"
                    }
                }
            }
        }, version="v2")

        account.razorpay_account_id = linked_account["id"]
        db.commit()

    account_id = account.razorpay_account_id

    # 2. The person behind it (Route allows exactly one)
    if not account.razorpay_stakeholder_id:
        stakeholder = razorpay_request(
            "POST",
            f"/accounts/{account_id}/stakeholders",
            {
                "name": data.beneficiary_name,
                "email": user.email,
                "kyc": {"pan": data.pan}
            },
            version="v2"
        )

        account.razorpay_stakeholder_id = stakeholder["id"]
        db.commit()

    # 3. Turn on Route for the account
    if not account.razorpay_product_id:
        product = razorpay_request(
            "POST",
            f"/accounts/{account_id}/products",
            {"product_name": "route", "tnc_accepted": True},
            version="v2"
        )

        account.razorpay_product_id = product["id"]
        db.commit()

    # 4. The bank account Razorpay settles into
    product = razorpay_request(
        "PATCH",
        f"/accounts/{account_id}/products/{account.razorpay_product_id}",
        {
            "settlements": {
                "account_number": data.account_number,
                "ifsc_code": data.ifsc,
                "beneficiary_name": data.beneficiary_name
            },
            "tnc_accepted": True
        },
        version="v2"
    )

    apply_product_status(account, product)
    account.bank_last4 = data.account_number[-4:]
    account.ifsc = data.ifsc
    account.beneficiary_name = data.beneficiary_name

    if not user.phone:
        user.phone = data.phone

    db.commit()

    # Jobs already paid start moving now; failed ones get another try,
    # since a bad bank account is the usual cause
    if account.status == "ACTIVATED":
        db.query(BookingPayout).filter(
            BookingPayout.booking_id.in_(
                db.query(Booking.id).filter(Booking.partner_id == partner.id)
            ),
            BookingPayout.status == FAILED,
            BookingPayout.razorpay_transfer_id.is_(None)
        ).update(
            {BookingPayout.status: WAITING_FOR_ACCOUNT},
            synchronize_session=False
        )
        db.commit()

        release_waiting_payouts(db, partner, account)

    return account_response(account)


# ---------------------------------------------------------
# Payouts list
# ---------------------------------------------------------

@router.get("/partners/{identifier}")
def get_partner_payouts(
    identifier: UUID,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    partner, _, account = get_own_partner(db, identifier, firebase_uid)

    refresh_account_status(db, account)
    release_waiting_payouts(db, partner, account)

    rows = (
        db.query(Booking, BookingDetail, BookingPayout, Service, User)
        .join(BookingDetail, BookingDetail.booking_id == Booking.id)
        .outerjoin(BookingPayout, BookingPayout.booking_id == Booking.id)
        .join(Service, Service.id == Booking.service_id)
        .join(User, User.id == Booking.user_id)
        .filter(
            Booking.partner_id == partner.id,
            BookingDetail.payment_status == "PAID"
        )
        .order_by(BookingDetail.paid_at.desc().nullslast())
        .limit(50)
        .all()
    )

    # Ask Razorpay about money still on its way to the bank
    refreshed = 0

    for _, _, payout, _, _ in rows:
        if (
            payout
            and payout.status == SENT
            and payout.razorpay_transfer_id
            and refreshed < MAX_REFRESH_PER_REQUEST
        ):
            refresh_transfer(db, payout)
            refreshed += 1

    payouts = []
    totals = {SETTLED: 0.0, SENT: 0.0, WAITING_FOR_ACCOUNT: 0.0, FAILED: 0.0, CASH_COLLECTED: 0.0}
    koodam_share_due = 0.0

    for booking, detail, payout, service, customer in rows:
        payout = payout or BookingPayout()
        status = payout.status or WAITING_FOR_ACCOUNT
        amount = round(partner_share(detail), 2)
        totals[status] = totals.get(status, 0.0) + amount

        # What the partner kept beyond their own share
        cash_due = (
            round((detail.amount_paid or 0.0) - amount, 2)
            if status == CASH_COLLECTED else 0.0
        )
        koodam_share_due += cash_due

        payouts.append({
            "booking_id": booking.id,
            "service_title": service.title,
            "customer_name": customer.name,
            "amount": amount,
            "status": status,
            "paid_at": to_iso_utc(detail.paid_at),
            "sent_at": to_iso_utc(payout.sent_at),
            "settled_at": to_iso_utc(payout.settled_at),
            "utr": payout.utr,
            "transfer_id": payout.razorpay_transfer_id,
            "error": payout.error,
            "koodam_share_due": cash_due,
        })

    return {
        "account": account_response(account),
        "totals": {
            "settled": round(totals[SETTLED], 2),
            "in_transit": round(totals[SENT], 2),
            "waiting": round(totals[WAITING_FOR_ACCOUNT], 2),
            "failed": round(totals[FAILED], 2),
            "cash_collected": round(totals[CASH_COLLECTED], 2),
            "koodam_share_due": round(koodam_share_due, 2),
        },
        "payouts": payouts,
    }
