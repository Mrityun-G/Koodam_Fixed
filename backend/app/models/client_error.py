from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from app.database import Base


class ClientError(Base):
    """
    A crash or unhandled rejection from somebody's phone.

    Until this existed a render error showed the user a white screen and
    told us nothing. Rows are written by /client-errors and read in the
    admin console; `fingerprint` groups repeats of the same fault so one
    bad deploy doesn't look like a thousand separate problems.
    """

    __tablename__ = "client_errors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Groups identical faults: message + first frame of the stack
    fingerprint = Column(String, nullable=False, index=True)

    message = Column(String, nullable=False)

    stack = Column(Text, nullable=True)

    # "render" (an ErrorBoundary), "window" or "promise"
    source = Column(String, nullable=False, default="window")

    # Which screen they were on, e.g. "booking"
    screen = Column(String, nullable=True)

    # The signed-in user, when there was one
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    user_agent = Column(String, nullable=True)

    app_version = Column(String, nullable=True)

    times_seen = Column(Integer, nullable=False, default=1)

    first_seen = Column(DateTime, default=datetime.utcnow)

    last_seen = Column(DateTime, default=datetime.utcnow)
