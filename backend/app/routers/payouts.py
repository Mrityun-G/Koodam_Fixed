import logging
import re
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import current_firebase_uid
from app.config import (
    RAZORPAY_TEST_MODE,
    RAZORPAYX_ACCOUNT_NUMBER,
    ROUTE_BUSINESS_CATEGORY,
    ROUTE_BUSINESS_SUBCATEGORY,
)
from app.database import get_db
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail
from app.models.partner import Partner
from app.models.payout import BookingPayout, PartnerPayoutAccount, PartnerWithdrawal
from app.models.service import Service
from app.models.user import User
from app.app_config import setting
from app.razorpay_client import razorpay_request, to_paise
from app.routers.escalations import require_admin


# =========================================================
# PARTNER PAYOUTS
# The partner's share of each paid job joins their balance (KOODAM keeps
# the trust fee and commission) and they withdraw it when they choose:
# - With an active Route "linked account" (their verified bank account),
#   each job's share is transferred from its payment to that account and
#   Razorpay pays it into their bank on its settlement schedule.
# - Otherwise to a UPI ID or bank account, paid by RazorpayX when it's set
#   up, or by KOODAM staff by hand.
# Each job is linked to the withdrawal that covers it, so it's paid once.
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

# Withdrawal states stored on partner_withdrawals.status (and FAILED)
REQUESTED = "REQUESTED"
PROCESSING = "PROCESSING"
PAID = "PAID"
REJECTED = "REJECTED"
# Not yet paid or given back: the partner can't withdraw again meanwhile
OPEN_WITHDRAWAL = (REQUESTED, PROCESSING)

# RazorpayX payout states that mean the money won't arrive
PAYOUT_FAILED_STATES = ("reversed", "rejected", "failed", "cancelled")



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

    # Razorpay's own explanation, e.g. "Max retry exceeded for bank
    # account details.", reads better than the field names
    reasons = list(dict.fromkeys(
        item.get("description")
        for item in product.get("requirements") or []
        if item.get("description")
    ))

    if reasons:
        return "Razorpay: " + " ".join(reasons)

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


def transfer_job(
    db: Session,
    detail: BookingDetail,
    account: PartnerPayoutAccount,
    withdrawal_id: UUID,
    amount: float
) -> BookingPayout:
    """
    Send part of one job's payment (amount, in rupees) to the partner's
    linked account, for the withdrawal the job is linked to. Never raises:
    a failed transfer is recorded on the job's payout row.
    """
    # Lock the row so two requests can't transfer the same payment twice
    detail = (
        db.query(BookingDetail)
        .filter(BookingDetail.booking_id == detail.booking_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    payout = db.get(BookingPayout, detail.booking_id)

    if (
        payout.razorpay_transfer_id
        or payout.withdrawal_id != withdrawal_id
        or not detail.razorpay_payment_id
    ):
        db.commit()
        return payout

    try:
        response = razorpay_request(
            "POST",
            f"/payments/{detail.razorpay_payment_id}/transfers",
            {
                "transfers": [{
                    "account": account.razorpay_account_id,
                    "amount": to_paise(amount),
                    "currency": "INR",
                    "notes": {
                        "booking_id": str(detail.booking_id),
                        "withdrawal_id": str(withdrawal_id)
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
        return payout

    items = response.get("items") or [response]
    apply_transfer(payout, items[0])
    db.commit()
    return payout


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
    _, _, account = get_own_partner(db, identifier, firebase_uid)

    refresh_account_status(db, account)

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

    return account_response(account)


# ---------------------------------------------------------
# Payouts list
# ---------------------------------------------------------

def withdrawable_jobs(db: Session, partner_id: UUID, lock: bool = False):
    """
    Paid jobs whose money is still with KOODAM and not yet withdrawn, and
    the balance they add up to: the partner's share of each online job,
    minus KOODAM's share of each job the partner was paid for in cash.
    lock holds the jobs' payment rows so a Route transfer can't run at
    the same time.
    """
    query = (
        db.query(BookingDetail, BookingPayout)
        .join(Booking, Booking.id == BookingDetail.booking_id)
        .outerjoin(BookingPayout, BookingPayout.booking_id == Booking.id)
        .filter(
            Booking.partner_id == partner_id,
            BookingDetail.payment_status == "PAID",
            BookingPayout.razorpay_transfer_id.is_(None),
            BookingPayout.withdrawal_id.is_(None),
            # Paid before payouts existed (no row), waiting, failed or cash
            (BookingPayout.booking_id.is_(None))
            | (BookingPayout.status.in_(
                [WAITING_FOR_ACCOUNT, FAILED, CASH_COLLECTED]
            ))
        )
    )

    if lock:
        query = query.with_for_update(of=BookingDetail)

    rows = query.all()
    balance = 0.0

    for detail, payout in rows:
        share = partner_share(detail)

        if payout and payout.status == CASH_COLLECTED:
            balance -= (detail.amount_paid or 0.0) - share
        else:
            balance += share

    return rows, round(balance, 2)


def withdrawal_response(withdrawal: PartnerWithdrawal) -> dict:
    return {
        "id": withdrawal.id,
        "amount": withdrawal.amount,
        "method": withdrawal.method,
        "upi_id": withdrawal.upi_id,
        "account_holder": withdrawal.account_holder,
        "account_last4": withdrawal.account_last4,
        "ifsc": withdrawal.ifsc,
        "status": withdrawal.status,
        "utr": withdrawal.utr,
        "rejection_reason": withdrawal.rejection_reason,
        "requested_at": to_iso_utc(withdrawal.requested_at),
        "decided_at": to_iso_utc(withdrawal.decided_at),
    }


def close_withdrawal(withdrawal: PartnerWithdrawal, status: str):
    withdrawal.status = status
    withdrawal.decided_at = datetime.utcnow()
    # Only needed while it's being paid
    withdrawal.account_number = None


def give_back_jobs(db: Session, withdrawal: PartnerWithdrawal):
    """The withdrawal won't be paid: its jobs go back to the balance."""
    db.query(BookingPayout).filter(
        BookingPayout.withdrawal_id == withdrawal.id
    ).update(
        {BookingPayout.withdrawal_id: None},
        synchronize_session=False
    )


def apply_payout(db: Session, withdrawal: PartnerWithdrawal, payout: dict):
    withdrawal.razorpay_payout_id = payout.get("id")
    status = payout.get("status")

    if status == "processed":
        close_withdrawal(withdrawal, PAID)
        withdrawal.utr = payout.get("utr")
    elif status in PAYOUT_FAILED_STATES:
        details = payout.get("status_details") or {}
        close_withdrawal(withdrawal, FAILED)
        withdrawal.rejection_reason = (
            details.get("description")
            or payout.get("failure_reason")
            or f"Payout {status}"
        )
        give_back_jobs(db, withdrawal)

    # queued / pending / processing: still on its way
    db.commit()


def razorpay_name(name: Optional[str]) -> str:
    """Razorpay rejects names with symbols such as "[25.] Nithin.L"."""
    cleaned = " ".join(re.sub(r"[^A-Za-z0-9 ]", " ", name or "").split())
    return cleaned if len(cleaned) >= 3 else "KOODAM partner"


def send_payout(db: Session, withdrawal: PartnerWithdrawal, user: User):
    """
    Pay a PROCESSING withdrawal through RazorpayX. Safe to call again:
    Razorpay returns the same contact and fund account for the same
    details, and the idempotency key stops a second payout. If Razorpay
    can't be reached it stays PROCESSING and the next refresh retries.
    """
    try:
        contact = razorpay_request("POST", "/contacts", {
            "name": razorpay_name(user.name or withdrawal.account_holder),
            "type": "vendor",
            "reference_id": str(withdrawal.partner_id),
            **({"contact": user.phone} if user.phone else {}),
        })

        if withdrawal.method == "UPI":
            destination = {
                "account_type": "vpa",
                "vpa": {"address": withdrawal.upi_id},
            }
        else:
            destination = {
                "account_type": "bank_account",
                "bank_account": {
                    "name": withdrawal.account_holder,
                    "ifsc": withdrawal.ifsc,
                    "account_number": withdrawal.account_number,
                },
            }

        fund_account = razorpay_request("POST", "/fund_accounts", {
            "contact_id": contact["id"],
            **destination,
        })

        payout = razorpay_request(
            "POST",
            "/payouts",
            {
                "account_number": RAZORPAYX_ACCOUNT_NUMBER,
                "fund_account_id": fund_account["id"],
                "amount": to_paise(withdrawal.amount),
                "currency": "INR",
                "mode": "UPI" if withdrawal.method == "UPI" else "IMPS",
                "purpose": "payout",
                # Waits for KOODAM to top up instead of failing
                "queue_if_low_balance": True,
                "reference_id": str(withdrawal.id),
                "narration": "KOODAM earnings",
                "notes": {"withdrawal_id": str(withdrawal.id)},
            },
            headers={"X-Payout-Idempotency": str(withdrawal.id)},
        )
    except HTTPException as error:
        if error.status_code == 504:
            logger.warning("RazorpayX unreachable for withdrawal %s", withdrawal.id)
            return

        close_withdrawal(withdrawal, FAILED)
        withdrawal.rejection_reason = str(error.detail)
        give_back_jobs(db, withdrawal)
        db.commit()
        return

    apply_payout(db, withdrawal, payout)


def route_ready(account: Optional[PartnerPayoutAccount]) -> bool:
    if not account or not account.razorpay_account_id:
        return False

    if account.status == "ACTIVATED":
        return True

    # Test mode accepts transfers to a linked account Razorpay hasn't
    # finished verifying (only its bank settlement waits), so withdrawals
    # can be tried end to end before activation
    return RAZORPAY_TEST_MODE and account.status in (
        "UNDER_REVIEW", "NEEDS_CLARIFICATION"
    )


def send_route_withdrawal(
    db: Session,
    withdrawal: PartnerWithdrawal,
    account: PartnerPayoutAccount
):
    """
    Pay a PROCESSING withdrawal into the partner's linked account: each
    online job's share is transferred from its own payment, less KOODAM's
    share of the cash jobs in the withdrawal. Safe to run again after a
    crash: jobs already transferred are skipped, and the amounts come out
    the same because the jobs are taken in the same order.
    """
    jobs = (
        db.query(BookingDetail, BookingPayout)
        .join(BookingPayout, BookingPayout.booking_id == BookingDetail.booking_id)
        .filter(BookingPayout.withdrawal_id == withdrawal.id)
        .order_by(BookingDetail.paid_at, BookingDetail.booking_id)
        .all()
    )

    cash_due = sum(
        (detail.amount_paid or 0.0) - partner_share(detail)
        for detail, payout in jobs
        if payout.status == CASH_COLLECTED
    )
    sent = 0.0
    failed = []

    for detail, payout in jobs:
        if payout.status == CASH_COLLECTED:
            continue

        share = partner_share(detail)
        covers = min(cash_due, share)
        amount = round(share - covers, 2)

        if amount <= 0:
            # The whole share goes to KOODAM's share of the cash jobs
            cash_due -= covers
            continue

        if not payout.razorpay_transfer_id:
            payout = transfer_job(db, detail, account, withdrawal.id, amount)

        if payout.razorpay_transfer_id and payout.status != FAILED:
            cash_due -= covers
            sent += amount
        else:
            failed.append(payout)

    if sent <= 0:
        close_withdrawal(withdrawal, FAILED)
        withdrawal.rejection_reason = (
            (failed[0].error if failed else None)
            or "Razorpay couldn't transfer it"
        )
        give_back_jobs(db, withdrawal)
        db.commit()
        return

    # Jobs that couldn't be transferred go back to the balance. Any of
    # KOODAM's cash share they were meant to cover is waived, not charged
    # twice.
    for payout in failed:
        payout.withdrawal_id = None

    if cash_due > 0:
        logger.warning(
            "Withdrawal %s left Rs %.2f of KOODAM's cash share uncovered",
            withdrawal.id,
            cash_due
        )

    withdrawal.amount = round(sent, 2)
    close_withdrawal(withdrawal, PAID)
    db.commit()


def refresh_withdrawal(db: Session, withdrawal: PartnerWithdrawal):
    """Finish a withdrawal still PROCESSING: ask RazorpayX, or retry Route."""
    if withdrawal.status != PROCESSING:
        return

    if withdrawal.method == "ROUTE":
        # Stopped part-way (e.g. the server restarted while sending)
        try:
            account = db.get(PartnerPayoutAccount, withdrawal.partner_id)
            if route_ready(account):
                send_route_withdrawal(db, withdrawal, account)
        except Exception:
            db.rollback()
            logger.exception("Couldn't finish withdrawal %s", withdrawal.id)
        return

    if not RAZORPAYX_ACCOUNT_NUMBER:
        return

    try:
        if withdrawal.razorpay_payout_id:
            apply_payout(
                db,
                withdrawal,
                razorpay_request("GET", f"/payouts/{withdrawal.razorpay_payout_id}")
            )
        else:
            # Razorpay couldn't be reached when it was sent
            user = (
                db.query(User)
                .join(Partner, Partner.user_id == User.id)
                .filter(Partner.id == withdrawal.partner_id)
                .first()
            )
            send_payout(db, withdrawal, user)
    except Exception:
        db.rollback()
        logger.exception("Couldn't refresh withdrawal %s", withdrawal.id)


@router.get("/partners/{identifier}")
def get_partner_payouts(
    identifier: UUID,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    partner, _, account = get_own_partner(db, identifier, firebase_uid)

    refresh_account_status(db, account)

    withdrawals = (
        db.query(PartnerWithdrawal)
        .filter(PartnerWithdrawal.partner_id == partner.id)
        .order_by(PartnerWithdrawal.requested_at.desc())
        .limit(20)
        .all()
    )

    # Withdrawals RazorpayX is still paying
    for withdrawal in withdrawals:
        refresh_withdrawal(db, withdrawal)

    rows = (
        db.query(Booking, BookingDetail, BookingPayout, PartnerWithdrawal, Service, User)
        .join(BookingDetail, BookingDetail.booking_id == Booking.id)
        .outerjoin(BookingPayout, BookingPayout.booking_id == Booking.id)
        .outerjoin(
            PartnerWithdrawal,
            PartnerWithdrawal.id == BookingPayout.withdrawal_id
        )
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

    for _, _, payout, _, _, _ in rows:
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

    for booking, detail, payout, withdrawal, service, customer in rows:
        payout = payout or BookingPayout()
        status = payout.status or WAITING_FOR_ACCOUNT
        amount = round(partner_share(detail), 2)

        # What the partner kept beyond their own share
        cash_due = (
            round((detail.amount_paid or 0.0) - amount, 2)
            if status == CASH_COLLECTED else 0.0
        )

        if status == CASH_COLLECTED:
            totals[CASH_COLLECTED] += amount
            # Already deducted from a withdrawal otherwise
            if not withdrawal:
                koodam_share_due += cash_due
        elif withdrawal and not payout.razorpay_transfer_id:
            # Withdrawn to a UPI ID or bank account (or it settled
            # KOODAM's share of cash jobs)
            status = "WITHDRAWN" if withdrawal.status == PAID else "WITHDRAWAL_REQUESTED"
        else:
            # Route transfers show how far the money has got
            totals[status] = totals.get(status, 0.0) + amount

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
            "withdrawal_status": withdrawal.status if withdrawal else None,
        })

    _, available = withdrawable_jobs(db, partner.id)

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
        "withdrawal": {
            "available": available,
            "minimum": setting("min_withdrawal"),
            "allowed": True,
            # Paid to their verified bank account through Route
            "route": route_ready(account),
            "pending": any(w.status in OPEN_WITHDRAWAL for w in withdrawals),
            # RazorpayX pays straight away; otherwise KOODAM staff do
            "instant": bool(RAZORPAYX_ACCOUNT_NUMBER),
        },
        "withdrawals": [withdrawal_response(w) for w in withdrawals],
        "payouts": payouts,
    }


# ---------------------------------------------------------
# Withdrawals
# ---------------------------------------------------------

class WithdrawalRequest(BaseModel):
    # ROUTE: to the partner's verified bank account (no details needed)
    method: Literal["ROUTE", "UPI", "BANK"]
    upi_id: Optional[str] = None
    account_holder: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None

    @field_validator("upi_id")
    @classmethod
    def check_upi(cls, value):
        if not value:
            return None
        value = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9._-]{2,256}@[a-z][a-z0-9.]{1,63}", value):
            raise ValueError("Enter a valid UPI ID (e.g. name@okaxis)")
        return value

    @field_validator("account_holder")
    @classmethod
    def check_holder(cls, value):
        if not value:
            return None
        value = " ".join(value.split())
        if len(value) < 4:
            raise ValueError("Enter the full name as on your bank account")
        return value

    @field_validator("account_number")
    @classmethod
    def check_account(cls, value):
        if not value:
            return None
        value = re.sub(r"\s", "", value)
        if not re.fullmatch(r"\d{9,18}", value):
            raise ValueError("Bank account number must be 9–18 digits")
        return value

    @field_validator("ifsc")
    @classmethod
    def check_ifsc(cls, value):
        if not value:
            return None
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", value):
            raise ValueError("Enter a valid 11-character IFSC code")
        return value


@router.post("/partners/{identifier}/withdrawals")
def request_withdrawal(
    data: WithdrawalRequest,
    identifier: UUID,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    partner, user, account = get_own_partner(db, identifier, firebase_uid)

    # A verified bank account is always paid through Route
    method = "ROUTE" if route_ready(account) else data.method

    if method == "ROUTE" and not route_ready(account):
        raise HTTPException(
            status_code=400,
            detail="Add your bank account and wait for Razorpay to verify it first."
        )

    if method == "UPI" and not data.upi_id:
        raise HTTPException(status_code=400, detail="Enter your UPI ID")

    if method == "BANK" and not (
        data.account_holder and data.account_number and data.ifsc
    ):
        raise HTTPException(
            status_code=400,
            detail="Enter the account holder, account number and IFSC"
        )

    # Lock the partner so a double tap can't withdraw the same balance twice
    db.query(Partner).filter(Partner.id == partner.id).with_for_update().first()

    pending = (
        db.query(PartnerWithdrawal)
        .filter(
            PartnerWithdrawal.partner_id == partner.id,
            PartnerWithdrawal.status.in_(OPEN_WITHDRAWAL)
        )
        .first()
    )

    if pending:
        raise HTTPException(
            status_code=400,
            detail="You already have a withdrawal waiting to be paid."
        )

    rows, available = withdrawable_jobs(db, partner.id, lock=True)

    minimum = setting("min_withdrawal")

    if available < minimum:
        raise HTTPException(
            status_code=400,
            detail=f"You can withdraw once your balance reaches ₹{minimum:.0f}."
        )

    if method == "ROUTE":
        withdrawal = PartnerWithdrawal(
            account_holder=account.beneficiary_name,
            account_last4=account.bank_last4,
            ifsc=account.ifsc,
            status=PROCESSING,
        )
    elif method == "BANK":
        withdrawal = PartnerWithdrawal(
            account_holder=data.account_holder,
            account_number=data.account_number,
            account_last4=data.account_number[-4:],
            ifsc=data.ifsc,
            status=PROCESSING if RAZORPAYX_ACCOUNT_NUMBER else REQUESTED,
        )
    else:
        withdrawal = PartnerWithdrawal(
            upi_id=data.upi_id,
            status=PROCESSING if RAZORPAYX_ACCOUNT_NUMBER else REQUESTED,
        )

    withdrawal.partner_id = partner.id
    withdrawal.amount = available
    withdrawal.method = method
    db.add(withdrawal)
    db.flush()

    # Link every job the balance came from, so none is paid twice
    for detail, payout in rows:
        if not payout:
            payout = BookingPayout(
                booking_id=detail.booking_id,
                status=WAITING_FOR_ACCOUNT
            )
            db.add(payout)

        payout.withdrawal_id = withdrawal.id

    # Saved before paying, so the jobs are never paid twice
    db.commit()

    if withdrawal.status == PROCESSING:
        if method == "ROUTE":
            send_route_withdrawal(db, withdrawal, account)
        else:
            send_payout(db, withdrawal, user)

        if withdrawal.status == FAILED:
            raise HTTPException(
                status_code=400,
                detail=f"Razorpay couldn't pay this: {withdrawal.rejection_reason}"
            )

    return withdrawal_response(withdrawal)


# ---------------------------------------------------------
# Withdrawals: KOODAM staff
# ---------------------------------------------------------

class PaidRequest(BaseModel):
    utr: str = Field(min_length=6, max_length=40)


class RejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


def pending_withdrawal(db: Session, withdrawal_id: UUID) -> PartnerWithdrawal:
    withdrawal = (
        db.query(PartnerWithdrawal)
        .filter(PartnerWithdrawal.id == withdrawal_id)
        .with_for_update()
        .first()
    )

    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")

    if withdrawal.status != REQUESTED:
        raise HTTPException(status_code=400, detail="This withdrawal isn't waiting for staff to pay it")

    return withdrawal


@router.get("/admin/withdrawals")
def admin_withdrawals(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    rows = (
        db.query(PartnerWithdrawal, User)
        .join(Partner, Partner.id == PartnerWithdrawal.partner_id)
        .join(User, User.id == Partner.user_id)
        # Waiting ones first, then the latest decisions
        .order_by(
            PartnerWithdrawal.status.notin_(OPEN_WITHDRAWAL),
            PartnerWithdrawal.requested_at.desc()
        )
        .limit(50)
        .all()
    )

    for withdrawal, _ in rows:
        refresh_withdrawal(db, withdrawal)

    return [
        {
            **withdrawal_response(withdrawal),
            # Staff need the full number to pay; it's cleared once decided
            "account_number": withdrawal.account_number,
            "partner_name": user.name,
            "partner_phone": user.phone,
        }
        for withdrawal, user in rows
    ]


@router.post("/admin/withdrawals/{withdrawal_id}/paid")
def mark_withdrawal_paid(
    data: PaidRequest,
    withdrawal_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    withdrawal = pending_withdrawal(db, withdrawal_id)

    close_withdrawal(withdrawal, PAID)
    withdrawal.utr = data.utr.strip().upper()
    db.commit()

    return withdrawal_response(withdrawal)


@router.post("/admin/withdrawals/{withdrawal_id}/reject")
def reject_withdrawal(
    data: RejectRequest,
    withdrawal_id: UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    withdrawal = pending_withdrawal(db, withdrawal_id)

    close_withdrawal(withdrawal, REJECTED)
    withdrawal.rejection_reason = data.reason.strip()
    give_back_jobs(db, withdrawal)
    db.commit()

    return withdrawal_response(withdrawal)
