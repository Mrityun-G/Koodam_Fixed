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

    latitude = Column(Float, nullable=True)

    longitude = Column(Float, nullable=True)