from sqlalchemy import Column, String, Float, Integer, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database import Base


class Service(Base):
    __tablename__ = "services"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    title = Column(String, nullable=False)

    description = Column(Text, nullable=True)

    category = Column(String, nullable=False)

    price = Column(Float, nullable=False, default=0.0)

    duration_minutes = Column(Integer, nullable=True)

    tag = Column(String, nullable=True)

    is_active = Column(Boolean, default=True)