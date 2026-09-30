from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.database import Base


class BookingDetail(Base):
    """
    Extra details for a booking, kept in their own table so the existing
    bookings table is left unchanged. One row per booking.
    """
    __tablename__ = "booking_details"

    booking_id = Column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id"),
        primary_key=True
    )

    # The live order in Firebase that this booking mirrors
    firebase_order_id = Column(
        String,
        unique=True,
        nullable=False
    )

    current_step = Column(Integer, nullable=True)

    # Service price before any approved extra parts cost
    base_amount = Column(Float, nullable=True)

    extra_amount = Column(Float, nullable=False, default=0.0)

    payment_status = Column(String, nullable=False, default="PENDING")

    amount_paid = Column(Float, nullable=False, default=0.0)

    razorpay_payment_id = Column(String, nullable=True)

    accepted_at = Column(DateTime, nullable=True)

    completed_at = Column(DateTime, nullable=True)

    paid_at = Column(DateTime, nullable=True)

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )


class BookingExtraCharge(Base):
    """
    Extra parts cost a partner requested during the work, and whether
    the customer approved it.
    """
    __tablename__ = "booking_extra_charges"

    __table_args__ = (
        UniqueConstraint(
            "booking_id",
            "firebase_charge_id",
            name="uq_booking_extra_charge"
        ),
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    booking_id = Column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id"),
        nullable=False
    )

    firebase_charge_id = Column(String, nullable=False)

    item = Column(String, nullable=False)

    amount = Column(Float, nullable=False)

    # PENDING / APPROVED / DECLINED
    status = Column(String, nullable=False, default="PENDING")

    created_at = Column(DateTime, nullable=True)

    responded_at = Column(DateTime, nullable=True)
