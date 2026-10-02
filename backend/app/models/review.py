from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class Review(Base):
    __tablename__ = "reviews"

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

    rating = Column(
        Integer,
        nullable=False
    )

    feedback = Column(
        Text,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    # The customer and partner are the booking's, loaded in the same query
    booking = relationship("Booking", lazy="joined")

    @property
    def user_id(self):
        return self.booking.user_id

    @property
    def partner_id(self):
        return self.booking.partner_id
