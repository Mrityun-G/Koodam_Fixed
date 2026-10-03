from sqlalchemy import Column, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.database import Base


class Complaint(Base):
    """
    A customer's problem with a job. One per booking.

    OPEN          waiting for the partner's reply (until respond_by)
    RESPONDED     the partner replied; the customer can accept or escalate
    RESOLVED      the customer is satisfied
    ESCALATED     the partner didn't reply in time (they were penalized)
    NEEDS_REVIEW  the customer escalated it; an admin decides
    UPHELD        an admin agreed with the customer (partner penalized)
    DISMISSED     an admin sided with the partner
    """
    __tablename__ = "complaints"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    booking_id = Column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id"),
        unique=True,
        nullable=False
    )

    partner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("partners.id"),
        nullable=False,
        index=True
    )

    customer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False
    )

    # NO_SHOW, LATE, POOR_WORK, OVERCHARGED, BEHAVIOUR, OTHER
    reason = Column(String, nullable=False)

    description = Column(Text, nullable=True)

    status = Column(String, nullable=False, default="OPEN", index=True)

    partner_response = Column(Text, nullable=True)

    admin_note = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    respond_by = Column(DateTime, nullable=False)

    responded_at = Column(DateTime, nullable=True)

    closed_at = Column(DateTime, nullable=True)


class PartnerEscalation(Base):
    """
    A penalty on a partner's record: a WARNING or a STRIKE.

    source says why:
      COMPLAINT_UNANSWERED  didn't reply to a complaint in time
      COMPLAINT_UPHELD      an admin upheld a customer's complaint
      JOB_NOT_STARTED       accepted job not started after the grace period
      JOB_NOT_FINISHED      started job not finished after the grace period
      ADMIN                 escalated by KOODAM staff

    An admin can overturn one; overturned escalations don't count.
    """
    __tablename__ = "partner_escalations"

    # The automatic checks can't escalate the same job twice for the
    # same reason (manual ones have no booking, and NULLs never clash)
    __table_args__ = (
        UniqueConstraint("booking_id", "source", name="uq_escalation_booking_source"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    partner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("partners.id"),
        nullable=False,
        index=True
    )

    booking_id = Column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id"),
        nullable=True
    )

    complaint_id = Column(
        UUID(as_uuid=True),
        ForeignKey("complaints.id"),
        nullable=True
    )

    source = Column(String, nullable=False)

    severity = Column(String, nullable=False)

    reason = Column(Text, nullable=False)

    # ACTIVE or OVERTURNED
    status = Column(String, nullable=False, default="ACTIVE")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    overturned_at = Column(DateTime, nullable=True)

    overturn_note = Column(Text, nullable=True)
