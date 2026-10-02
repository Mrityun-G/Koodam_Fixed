from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import DATABASE_URL


# Connections are checked before use: Supabase's pooler can drop an idle
# one silently, and reusing a dead connection hangs a request for about
# two minutes. The most recently used connection is reused first (it's
# the least likely to have been dropped), old ones are replaced, and a
# new connection gives up after 10 seconds instead of hanging.
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_use_lifo=True,
    pool_recycle=240,
    pool_size=5,
    max_overflow=10,
    connect_args={
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 3,
    }
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()