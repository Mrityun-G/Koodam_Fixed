from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.database import Base


class EmergencyRequest(Base):
    __tablename__ = "emergency_requests"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False
    )

    service_type = Column(
        String,
        nullable=False
    )

    description = Column(
        Text,
        nullable=True
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

    status = Column(
        String,
        nullable=False,
        default="PENDING"
    )

    priority = Column(
        String,
        nullable=False,
        default="HIGH"
    )

    assigned_partner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("partners.id"),
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )