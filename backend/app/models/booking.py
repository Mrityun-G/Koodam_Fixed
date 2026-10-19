from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.database import Base


class Booking(Base):
    __tablename__ = "bookings"

    __table_args__ = (
        # A partner's jobs by status (dashboard, earnings, job checks)
        Index("ix_bookings_partner_id_status", "partner_id", "status"),
        # The escalation sweep: overdue jobs in a status
        Index("ix_bookings_status_booking_time", "status", "booking_time"),
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True
    )

    partner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("partners.id"),
        nullable=False
    )

    service_id = Column(
        UUID(as_uuid=True),
        ForeignKey("services.id"),
        nullable=False
    )

    booking_time = Column(
        DateTime,
        nullable=False
    )

    status = Column(
        String,
        nullable=False,
        default="PENDING"
    )

    address = Column(
        Text,
        nullable=True
    )

    latitude = Column(
        Float,
        nullable=True
    )

    longitude = Column(
        Float,
        nullable=True
    )

    total_amount = Column(
        Float,
        nullable=False,
        default=0.0
    )

    safety_pin = Column(
        String,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )