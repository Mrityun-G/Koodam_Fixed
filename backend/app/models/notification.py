from datetime import datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class Notification(Base):
    """An entry in a user's bell-icon list, kept so it survives a reload."""
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True
    )

    # Which side of the app it's for: "member" or "partner"
    target = Column(String, nullable=False)

    title = Column(String, nullable=False)

    description = Column(String, nullable=True)

    # Where tapping it goes
    screen = Column(String, nullable=True)

    tab = Column(String, nullable=True)

    unread = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
