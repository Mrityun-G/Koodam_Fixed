from datetime import datetime

from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


class AppConfig(Base):
    """
    Settings and content KOODAM staff can change without a release:
    fees and limits (numbers) and the FAQ, Terms, offline-mode steps and
    complaint reasons (lists). See app/app_config.py for the keys.
    """
    __tablename__ = "app_config"

    key = Column(String, primary_key=True)

    value = Column(JSONB, nullable=False)

    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Email of the staff member who last changed it
    updated_by = Column(String, nullable=True)
