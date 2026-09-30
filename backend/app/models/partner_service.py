from sqlalchemy import Column, Boolean, Float, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database import Base


class PartnerService(Base):
    __tablename__ = "partner_services"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
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

    experience_years = Column(
        Integer,
        default=0
    )

    price_override = Column(
        Float,
        nullable=True
    )

    is_active = Column(
        Boolean,
        default=True
    )