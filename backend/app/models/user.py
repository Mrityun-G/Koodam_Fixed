from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    firebase_uid = Column(String, unique=True, nullable=False)

    name = Column(String, nullable=False)

    email = Column(String, unique=True, nullable=False)

    phone = Column(String, nullable=True)

    avatar = Column(String, nullable=True)

    role = Column(String, nullable=False, default="MEMBER")

    created_at = Column(DateTime, default=datetime.utcnow)

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )