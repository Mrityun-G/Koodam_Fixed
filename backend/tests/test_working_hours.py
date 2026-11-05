"""Tests for a partner's own working hours and days off.

The partner sets which days they work, from when to when, and the dates
they're off; only they (or staff) can change them; nonsense is refused
with a message they can act on; and customers get the hours with the
partner's listing so the app only offers times inside them.

Throwaway in-memory SQLite; never connects to Supabase.
Run with: npm test (from the project folder)
"""
import sys, uuid
from datetime import date, datetime, timedelta
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
from app.models.partner_service import PartnerService
from app.models.service import Service

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
from app.routers import partner as partner_r, service as service_r

api = FastAPI()
api.include_router(partner_r.router)
api.include_router(service_r.router)


def _db():
    s = TestSession()
    try:
        yield s
    finally:
        s.close()


api.dependency_overrides[get_db] = _db
client = TestClient(api)


def as_user(uid):
    api.dependency_overrides[current_firebase_uid] = lambda: uid


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
with TestSession() as db:
    member = User(id=uuid.uuid4(), firebase_uid="member-uid", name="Meena",
                  email="meena@example.com", phone="9876543210")
    helper_user = User(id=uuid.uuid4(), firebase_uid="helper-uid", name="Ravi",
                       email="ravi@example.com", phone="9876543212", role="PARTNER")
    db.add_all([member, helper_user])
    db.flush()

    # Online with the app open, so customers are offered them
    helper = Partner(id=uuid.uuid4(), user_id=helper_user.id, is_online=True,
                     last_seen_at=datetime.utcnow())
    service = Service(id=uuid.uuid4(), title="Plumbing & Repair",
                      description="taps", category="Plumbing & Repair",
                      price=399, is_active=True, sort_order=1)
    db.add_all([helper, service])
    db.flush()
    db.add(PartnerService(id=uuid.uuid4(), partner_id=helper.id,
                          service_id=service.id, is_active=True,
                          experience_years=2))
    db.commit()

    HELPER_ID = helper.id

URL = f"/partners/{HELPER_ID}/working-hours"

MON_SAT = {day: {"start": "09:00", "end": "18:00"}
           for day in ("mon", "tue", "wed", "thu", "fri", "sat")}
MON_SAT["sun"] = None

today = date.today()
NEXT_WEEK = (today + timedelta(days=7)).isoformat()
TOMORROW = (today + timedelta(days=1)).isoformat()
LONG_AGO = (today - timedelta(days=30)).isoformat()


def listed_partner():
    as_user("member-uid")
    response = client.get("/services/with-partners")
    assert response.status_code == 200, response.text
    return response.json()[0]["partners"][0]


# ---------- before any are set ----------
partner = listed_partner()
check("a partner who never set hours is listed with none",
      partner["working_hours"] is None and partner["days_off"] == [], partner)

# ---------- only the partner can change them ----------
as_user("member-uid")
response = client.put(URL, json={"working_hours": MON_SAT, "days_off": []})
check("a customer can't change a partner's hours",
      response.status_code == 403, response.text)

# ---------- the partner sets them ----------
as_user("helper-uid")
response = client.put(URL, json={
    "working_hours": MON_SAT,
    "days_off": [NEXT_WEEK, TOMORROW, NEXT_WEEK, LONG_AGO]
})
body = response.json()
check("the partner saves Mon-Sat 9 to 6", response.status_code == 200, response.text)
check("...Sunday is stored as not working",
      body.get("working_hours", {}).get("sun") is None
      and body["working_hours"]["mon"] == {"start": "09:00", "end": "18:00"}, body)
check("days off come back sorted, once each, past ones dropped",
      body.get("days_off") == [TOMORROW, NEXT_WEEK], body)

partner = listed_partner()
check("customers get the hours with the listing",
      partner["working_hours"] == body["working_hours"], partner)
check("...and the days off", partner["days_off"] == [TOMORROW, NEXT_WEEK], partner)

# ---------- nonsense is refused ----------
as_user("helper-uid")


def refused(name, payload, words):
    response = client.put(URL, json=payload)
    detail = (response.json() or {}).get("detail", "")
    check(name, response.status_code == 400 and words in str(detail),
          f"{response.status_code} {response.text}")


refused("no working days at all",
        {"working_hours": {day: None for day in MON_SAT}, "days_off": []},
        "at least one working day")
refused("an end before the start",
        {"working_hours": {**MON_SAT, "mon": {"start": "18:00", "end": "09:00"}},
         "days_off": []},
        "at least one hour")
refused("a time that isn't on the half hour",
        {"working_hours": {**MON_SAT, "mon": {"start": "09:15", "end": "18:00"}},
         "days_off": []},
        "start and end time")
refused("a day that doesn't exist",
        {"working_hours": {**MON_SAT, "funday": None}, "days_off": []},
        "wrong format")
refused("a day off that isn't a date",
        {"working_hours": MON_SAT, "days_off": ["next tuesday"]},
        "isn't a date")
refused("a day off more than a year ahead",
        {"working_hours": MON_SAT,
         "days_off": [(today + timedelta(days=400)).isoformat()]},
        "a year ahead")

response = client.put(URL, json={
    "working_hours": {**MON_SAT, "sat": {"start": "20:00", "end": "24:00"}},
    "days_off": []
})
check("work can run up to midnight",
      response.status_code == 200
      and response.json()["working_hours"]["sat"]["end"] == "24:00",
      response.text)

# ---------- and removed ----------
response = client.put(URL, json={"working_hours": None, "days_off": []})
check("the partner can go back to no fixed hours",
      response.status_code == 200 and response.json()["working_hours"] is None,
      response.text)
check("...and customers see none", listed_partner()["working_hours"] is None)

print()
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
