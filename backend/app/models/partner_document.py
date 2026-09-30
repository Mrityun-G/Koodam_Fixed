from sqlalchemy import Column, String, LargeBinary, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.database import Base


class PartnerDocument(Base):
    """
    Verification documents uploaded by a partner (e.g. police clearance
    certificate). Stored in the database rather than public storage
    because they contain personal information.
    """
    __tablename__ = "partner_documents"

    __table_args__ = (
        UniqueConstraint(
            "partner_id",
            "document_type",
            name="uq_partner_document_type"
        ),
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    partner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("partners.id"),
        nullable=False
    )

    # e.g. "POLICE_CERTIFICATE"
    document_type = Column(String, nullable=False)

    file_name = Column(String, nullable=False)

    content_type = Column(String, nullable=False)

    data = Column(LargeBinary, nullable=False)

    uploaded_at = Column(
        DateTime,
        default=datetime.utcnow
    )
