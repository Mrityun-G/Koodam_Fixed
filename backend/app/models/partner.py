from sqlalchemy import (
    Column, String, Float, Boolean, Integer, ForeignKey,
    select, func, cast, case
)
from sqlalchemy.orm import column_property
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database import Base
from app.models.booking import Booking
from app.models.review import Review


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


# Rating, review count and completion rate are worked out from the
# reviews and bookings tables in the same SELECT that loads the partner,
# so they can never drift from the real data
def _partner_reviews(*columns):
    return (
        select(*columns)
        .select_from(Review)
        .join(Booking, Booking.id == Review.booking_id)
        .where(Booking.partner_id == Partner.id)
        .correlate_except(Review, Booking)
        .scalar_subquery()
    )


Partner.rating = column_property(
    _partner_reviews(cast(func.coalesce(func.avg(Review.rating), 0), Float))
)

Partner.reviews_count = column_property(
    _partner_reviews(func.count(Review.id))
)

# Completed jobs as a percentage of jobs that reached a final outcome
_finished = Booking.status.in_(("COMPLETED", "DECLINED", "CANCELLED"))

Partner.completion_rate = column_property(
    select(
        func.coalesce(
            func.round(
                100.0
                * func.count(case((Booking.status == "COMPLETED", 1)))
                / func.nullif(func.count(), 0)
            ),
            0
        ).cast(Float)
    )
    .where(Booking.partner_id == Partner.id, _finished)
    .correlate_except(Booking)
    .scalar_subquery()
)
