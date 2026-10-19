from datetime import datetime
import uuid

from sqlalchemy import (
    Column, String, Integer, DateTime, LargeBinary, Boolean, Text, JSON
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Diagnosis(Base):
    """
    A photo a member sent to GigEzee AI, and what it worked out.

    Kept so the partner who takes the job can see the same photo and the
    causes to check, and so staff can tell later whether the AI pointed
    at the right trade.
    """
    __tablename__ = "diagnoses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Firebase uid of the member who sent it
    created_by = Column(String, nullable=False, index=True)

    photo = Column(LargeBinary, nullable=False)

    photo_type = Column(String, nullable=False)

    photo_size_bytes = Column(Integer, nullable=False)

    # What the member typed or spoke about the problem, in their language
    member_note = Column(Text, nullable=True)

    # App language the answer was written in (en / ta / kn)
    language = Column(String, nullable=False, default="en")

    # The whole result, as returned (see RESULT_SCHEMA in ai_diagnosis)
    result = Column(JSON, nullable=False)

    # Pulled out of the result for routing and for staff reports
    service_title = Column(String, nullable=True)

    urgency = Column(String, nullable=True)

    has_safety_warning = Column(Boolean, nullable=False, default=False)

    # Set once the member books off the back of this diagnosis, so the
    # partner's job can show it
    firebase_order_id = Column(String, nullable=True, index=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
