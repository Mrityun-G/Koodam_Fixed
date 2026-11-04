"""Tests that /me/open-booking hands a member back the booking they still
have to pay or follow, so it isn't lost when the app's own memory of it
is (a logout, a cleared browser, another phone).

Throwaway in-memory SQLite; never connects to Supabase.
Run with: npm test (from the project folder)
"""
import sys, uuid
from datetime import datetime, timedelta
from pathlib import Path

# Lets "import app..." work wherever the script is started from
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, event
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@compiles(JSONB, "sqlite")
def _jsonb(type_, compiler, **kw):
    return "JSON"


from app.auth import current_firebase_uid
from app.database import Base, get_db
import app.models.user, app.models.partner, app.models.service  # noqa
import app.models.booking, app.models.booking_detail  # noqa
import app.models.partner_service, app.models.app_config  # noqa
import app.models.review, app.models.payout, app.models.escalation  # noqa
import app.models.photo, app.models.partner_document  # noqa
import app.models.notification, app.models.emergency  # noqa
from app.models.user import User
from app.models.partner import Partner
from app.models.service import Service
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail

engine = create_engine("sqlite://", poolclass=StaticPool,
                       connect_args={"check_same_thread": False})


# Stand-ins for the Postgres-only functions the Partner model uses
@event.listens_for(engine, "connect")
def _pg_funcs(conn, _):
    conn.create_function(
        "greatest", -1, lambda *a: max(x for x in a if x is not None)
    )
    conn.create_function("timezone", 2, lambda tz, ts: ts)
    conn.create_function("make_interval", -1, lambda *a: 0)


Base.metadata.create_all(engine)
TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.routers import me as me_r

api = FastAPI()
api.include_router(me_r.router)


def _db():
    s = TestSession()
    try:
        yield s
    finally:
        s.close()


api.dependency_overrides[get_db] = _db
client = TestClient(api)

passed = failed = 0


def check(name, cond, info=""):
    global passed, failed
    if cond:
        passed += 1
        print("PASS", name)
    else:
        failed += 1
        print("FAIL", name, "|", info)


# ---------- the world ----------
db = TestSession()

member = User(id=uuid.uuid4(), name="Member", email="member@example.com",
              phone="9876543210", firebase_uid="member-uid")
neighbour = User(id=uuid.uuid4(), name="Neighbour",
                 email="neighbour@example.com", phone="9876543211",
                 firebase_uid="neighbour-uid")
helper = User(id=uuid.uuid4(), name="Helper", email="helper@example.com",
              phone="9876543212", firebase_uid="helper-uid", role="PARTNER")
db.add_all([member, neighbour, helper])
db.flush()

partner = Partner(id=uuid.uuid4(), user_id=helper.id)
service = Service(id=uuid.uuid4(), title="Electrical Works",
                  description="wiring", category="Electrical Works",
                  price=400.0, is_active=True)
db.add_all([partner, service])
db.commit()

NOW = datetime.utcnow()


def add_booking(order_id, status, booked_for, created, customer=member,
                payment="PENDING", source=None):
    booking = Booking(id=uuid.uuid4(), user_id=customer.id,
                      partner_id=partner.id, service_id=service.id,
                      booking_time=booked_for, status=status,
                      total_amount=470.0, created_at=created)
    db.add(booking)
    db.flush()
    db.add(BookingDetail(booking_id=booking.id, firebase_order_id=order_id,
                         payment_status=payment, source=source))
    db.commit()


def open_booking(uid="member-uid"):
    api.dependency_overrides[current_firebase_uid] = lambda: uid
    response = client.get("/me/open-booking")
    assert response.status_code == 200, response.text
    return response.json()


# ---------- signed out ----------
api.dependency_overrides.pop(current_firebase_uid, None)
got = client.get("/me/open-booking")
check("a signed-out caller is refused", got.status_code in (401, 403),
      f"status {got.status_code}")


# ---------- nothing open ----------
check("no bookings: null", open_booking() is None)

# Weeks-old jobs nobody finished (test bookings, abandoned jobs) are
# overdue and escalated, not something to reopen on every login
add_booking("stale-job", "IN_PROGRESS", NOW - timedelta(days=21),
            NOW - timedelta(days=22))
check("a job long past its booked time is not reopened",
      open_booking() is None, open_booking())

add_booking("paid-job", "COMPLETED", NOW - timedelta(days=1),
            NOW - timedelta(days=1), payment="PAID")
check("a paid job is not reopened", open_booking() is None, open_booking())

add_booking("declined", "DECLINED", NOW, NOW)
check("a declined request is not reopened", open_booking() is None,
      open_booking())


# ---------- the bug: a finished job that still has to be paid ----------
add_booking("unpaid-job", "COMPLETED", NOW - timedelta(days=14),
            NOW - timedelta(days=14))
got = open_booking()
check("a completed, unpaid job comes back",
      got and got["firebase_order_id"] == "unpaid-job", got)
check("...however old it is", got and got["status"] == "COMPLETED", got)
check("...saying it is unpaid",
      got and got["payment_status"] == "PENDING", got)


# ---------- someone else's bill is never handed out ----------
add_booking("neighbours-bill", "COMPLETED", NOW, NOW + timedelta(minutes=1),
            customer=neighbour)
got = open_booking()
check("another member's newer unpaid job is not returned",
      got and got["firebase_order_id"] == "unpaid-job", got)
check("...but it is theirs",
      open_booking("neighbour-uid")["firebase_order_id"] == "neighbours-bill")


# ---------- phone bookings are settled on the call ----------
add_booking("phone-job", "COMPLETED", NOW, NOW + timedelta(minutes=2),
            source="PHONE")
check("an unpaid phone booking is not reopened in the app",
      open_booking()["firebase_order_id"] == "unpaid-job", open_booking())


# ---------- a job under way ----------
add_booking("tomorrow", "ACCEPTED", NOW + timedelta(days=1),
            NOW + timedelta(minutes=3))
check("a job booked for tomorrow comes back, newest first",
      open_booking()["firebase_order_id"] == "tomorrow", open_booking())

print()
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
