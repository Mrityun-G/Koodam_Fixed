from sqlalchemy import Column, String, Float, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database import Base


class Partner(Base):
    __tablename__ = "partners"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        unique=True,
        nullable=False
    )

    experience_years = Column(Integer, default=0)

    rating = Column(Float, default=0.0)

    reviews_count = Column(Integer, default=0)

    completion_rate = Column(Float, default=0.0)

    hourly_rate = Column(Float, default=0.0)

    vehicle = Column(String, nullable=True)

    vehicle_number = Column(String, nullable=True)

    is_online = Column(Boolean, default=False)

    is_verified = Column(Boolean, default=False)

    # NOT_SUBMITTED -> UNDER_REVIEW -> VERIFIED / REJECTED
    # Set to VERIFIED or REJECTED by an admin (e.g. in the Supabase table editor)
    police_verification_status = Column(
        String,
        nullable=False,
        default="NOT_SUBMITTED",
        server_default="NOT_SUBMITTED"
    )

    police_rejection_reason = Column(String, nullable=True)

    # How far the partner is willing to travel for a job
    service_radius_km = Column(Integer, nullable=False, default=5)

    latitude = Column(Float, nullable=True)

    longitude = Column(Float, nullable=True)

    # Razorpay Route linked account that receives the partner's share of
    # each payment, and the IDs of each onboarding step so a retry resumes
    razorpay_account_id = Column(String, nullable=True)

    razorpay_stakeholder_id = Column(String, nullable=True)

    razorpay_product_id = Column(String, nullable=True)

    # NOT_SET -> UNDER_REVIEW -> ACTIVATED, or NEEDS_CLARIFICATION
    payout_account_status = Column(
        String,
        nullable=False,
        default="NOT_SET",
        server_default="NOT_SET"
    )

    # What Razorpay still needs, when it asks for clarification
    payout_account_note = Column(String, nullable=True)

    # Shown back to the partner; the full account number is not stored
    payout_bank_last4 = Column(String, nullable=True)

    payout_ifsc = Column(String, nullable=True)

    payout_beneficiary_name = Column(String, nullable=True)
