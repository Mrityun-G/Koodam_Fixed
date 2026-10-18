from datetime import datetime
import uuid

from sqlalchemy import Column, String, Integer, DateTime, LargeBinary
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Photo(Base):
    """
    A photo a partner takes during a job: the finished repair, or a part
    they want the customer to approve. Kept in the database so it stays
    with the booking's record.
    """
    __tablename__ = "photos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # The live order (Firebase key) it belongs to
    firebase_order_id = Column(String, nullable=False, index=True)

    # "repair" or "part"
    label = Column(String, nullable=False)

    content_type = Column(String, nullable=False)

    data = Column(LargeBinary, nullable=False)

    size_bytes = Column(Integer, nullable=False)

    # Firebase uid of whoever uploaded it
    uploaded_by = Column(String, nullable=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
