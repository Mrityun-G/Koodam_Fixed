from datetime import datetime
import uuid

from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class PartnerPayoutAccount(Base):
    """
    A partner's Razorpay Route linked account, kept out of the partners
    table since only partners who add a bank account have one.
    The IDs of each onboarding step are stored so a retry resumes.
    """
    __tablename__ = "partner_payout_accounts"

    partner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("partners.id"),
        primary_key=True
    )

    razorpay_account_id = Column(String, nullable=True)

    razorpay_stakeholder_id = Column(String, nullable=True)

    razorpay_product_id = Column(String, nullable=True)

    # NOT_SET -> UNDER_REVIEW -> ACTIVATED, or NEEDS_CLARIFICATION
    status = Column(
        String,
        nullable=False,
        default="NOT_SET",
        server_default="NOT_SET"
    )

    # What Razorpay still needs, when it asks for clarification
    note = Column(String, nullable=True)

    # Shown back to the partner; the full account number is not stored
    bank_last4 = Column(String, nullable=True)

    ifsc = Column(String, nullable=True)

    beneficiary_name = Column(String, nullable=True)


class BookingPayout(Base):
    """
    Razorpay Route transfer of the partner's share of a paid booking.
    A row exists once the booking is paid.
    WAITING_FOR_ACCOUNT -> SENT -> SETTLED, or FAILED
    """
    __tablename__ = "booking_payouts"

    booking_id = Column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id"),
        primary_key=True
    )

    status = Column(String, nullable=False)

    razorpay_transfer_id = Column(String, nullable=True)

    error = Column(String, nullable=True)

    sent_at = Column(DateTime, nullable=True)

    # When Razorpay paid it into the partner's bank, and the bank reference
    settled_at = Column(DateTime, nullable=True)

    utr = Column(String, nullable=True)

    # Set when the partner withdrew this job's money instead of waiting
    # for a Route transfer; Route never transfers a job that has one
    withdrawal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("partner_withdrawals.id"),
        nullable=True,
        index=True
    )


class PartnerWithdrawal(Base):
    """
    A partner asking for their available balance, paid to their UPI ID or
    bank account by RazorpayX, or by KOODAM staff by hand when RazorpayX
    isn't set up. Covers every job linked to it through
    booking_payouts.withdrawal_id.
    RazorpayX: PROCESSING -> PAID, or FAILED (the jobs go back to the balance)
    By hand:   REQUESTED  -> PAID, or REJECTED (the jobs go back to the balance)
    """
    __tablename__ = "partner_withdrawals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    partner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("partners.id"),
        nullable=False,
        index=True
    )

    amount = Column(Float, nullable=False)

    # UPI or BANK
    method = Column(String, nullable=False)

    upi_id = Column(String, nullable=True)

    account_holder = Column(String, nullable=True)

    # Kept only while staff need it to pay; cleared once decided
    account_number = Column(String, nullable=True)

    account_last4 = Column(String, nullable=True)

    ifsc = Column(String, nullable=True)

    status = Column(String, nullable=False, default="REQUESTED", index=True)

    # RazorpayX payout, when it was paid that way
    razorpay_payout_id = Column(String, nullable=True)

    # Bank reference, from RazorpayX or entered by staff after paying
    utr = Column(String, nullable=True)

    # Why staff rejected it, or why RazorpayX couldn't pay it
    rejection_reason = Column(String, nullable=True)

    requested_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    decided_at = Column(DateTime, nullable=True)
