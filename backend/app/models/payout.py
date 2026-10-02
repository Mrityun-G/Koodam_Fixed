from sqlalchemy import Column, String, DateTime, ForeignKey
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
