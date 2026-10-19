"""Tests that /services/with-partners answers with the member's
neighbourhood rather than the whole partner table, and that a partner's
contact details stay out of it.

Throwaway in-memory SQLite; never connects to Supabase.
Run with: npm test (from the project folder)
"""
import sys, uuid
from datetime import datetime
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
from app.models.partner_service import PartnerService
from app.models.booking import Booking
from app.models.review import Review

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
from app.routers import service as service_r

api = FastAPI()
api.include_router(service_r.router)


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
# A member in Salem; partners at varying distances from them.
SALEM = (11.659878, 78.170935)
CHENNAI = (13.0751, 80.2847)          # ~278 km from Salem
NEXT_STREET = (11.661878, 78.172935)  # ~0.3 km from Salem

db = TestSession()

service = Service(id=uuid.uuid4(), title="Plumbing & Repair",
                  description="taps", category="Plumbing & Repair",
                  price=300.0, is_active=True, sort_order=1)
db.add(service)
db.commit()


def add_partner(name, coords, radius_km, rating=0.0, online=True):
    """A bookable partner offering the one service."""
    user = User(id=uuid.uuid4(), name=name,
                email=f"{name.lower().replace(' ', '')}@example.com",
                phone="9876543210", firebase_uid=f"uid-{name}")
    db.add(user)
    db.flush()

    partner = Partner(
        id=uuid.uuid4(), user_id=user.id, is_online=online,
        rating=rating, reviews_count=0, completion_rate=100.0,
        reliability_score=100.0, service_radius_km=radius_km,
        latitude=coords[0] if coords else None,
        longitude=coords[1] if coords else None,
    )
    db.add(partner)
    db.flush()

    db.add(PartnerService(id=uuid.uuid4(), partner_id=partner.id,
                          service_id=service.id, is_active=True,
                          experience_years=2, price_override=None))

    # Partner.rating is worked out from reviews, not stored, so a
    # partner only has one once a reviewed booking exists
    if rating:
        booking = Booking(id=uuid.uuid4(), user_id=user.id,
                          partner_id=partner.id, service_id=service.id,
                          booking_time=datetime.utcnow(),
                          status="COMPLETED", total_amount=300.0)
        db.add(booking)
        db.flush()
        db.add(Review(id=uuid.uuid4(), booking_id=booking.id,
                      rating=int(rating)))

    db.commit()
    # The id alone: the session closes below, and a detached model
    # can't be read from
    return partner.id


NEAR_RATING, FAR_SMALL_RATING = 3.0, 5.0

near = add_partner("Near Neighbour", NEXT_STREET, 5, rating=NEAR_RATING)
far_small = add_partner("Far Small Radius", CHENNAI, 5,
                        rating=FAR_SMALL_RATING)
far_wide = add_partner("Far Wide Radius", CHENNAI, 400, rating=1.0)
no_coords = add_partner("No Location", None, 5, rating=4.0)
db.close()


def listing(**params):
    """The partners the member is offered for the one service."""
    response = client.get("/services/with-partners", params=params)
    assert response.status_code == 200, response.text
    entry = response.json()[0]
    return entry["partners"], {p["name"] for p in entry["partners"]}


# ---------- signed out ----------
got = client.get("/services/with-partners",
                 params={"lat": SALEM[0], "lng": SALEM[1]})
check("a signed-out caller can't list partners", got.status_code in (401, 403),
      f"status {got.status_code}")

# Everything below is a signed-in member
api.dependency_overrides[current_firebase_uid] = lambda: "member-uid"


# ---------- the radius decides ----------
partners, names = listing(lat=SALEM[0], lng=SALEM[1])

check("a partner down the street is offered", "Near Neighbour" in names, names)
check("278 km away with a 5 km radius is not offered",
      "Far Small Radius" not in names, names)
check("...even though they are the best rated of all",
      FAR_SMALL_RATING > NEAR_RATING)
check("278 km away with a 400 km radius IS offered",
      "Far Wide Radius" in names, names)
check("a partner with no location is not offered to someone far off",
      "No Location" not in names, names)

# This is the bug the old client-side filter had: distanceKm == null
# meant "show to everyone", so a partner who never sent a position was
# offered to every member in the country.
check("...which is the no-location-shows-everywhere bug, closed",
      "No Location" not in names, names)


# ---------- distance comes back, and is right ----------
by_name = {p["name"]: p for p in partners}
near_km = by_name["Near Neighbour"]["distance_km"]

check("distance_km is sent for display", near_km is not None)
check("distance_km is about right (~0.3 km)",
      near_km is not None and 0.2 < near_km < 0.5, near_km)
check("a far partner's distance is right too (~278 km)",
      277 < by_name["Far Wide Radius"]["distance_km"] < 280,
      by_name["Far Wide Radius"]["distance_km"])


# ---------- nearest first ----------
check("nearest partner is listed first",
      partners[0]["name"] == "Near Neighbour",
      [p["name"] for p in partners])


# ---------- contact details stay out ----------
leaked = [k for k in ("email", "phone") if k in partners[0]]
check("no email or phone in the listing", not leaked, leaked)
check("...not anywhere in the response body",
      "@example.com" not in client.get(
          "/services/with-partners",
          params={"lat": SALEM[0], "lng": SALEM[1]}).text)


# ---------- the response is bounded ----------
_, all_names = listing(lat=SALEM[0], lng=SALEM[1], per_service=1)
check("per_service caps how many come back", len(all_names) == 1, all_names)

capped = client.get("/services/with-partners",
                    params={"lat": SALEM[0], "lng": SALEM[1],
                            "per_service": 500})
check("per_service can't be set arbitrarily high",
      capped.status_code == 422, capped.status_code)


# ---------- no position yet ----------
partners_anon, names_anon = listing()

check("without a position the screen still fills",
      len(names_anon) > 0, names_anon)
check("...still capped, not the whole table",
      len(partners_anon) <= 20, len(partners_anon))
check("...best rated first", partners_anon[0]["name"] == "Far Small Radius",
      [p["name"] for p in partners_anon])
check("...and distance is null, not a guess",
      partners_anon[0]["distance_km"] is None)


# ---------- offline partners are still hidden ----------
db = TestSession()
db.get(Partner, near).is_online = False
db.commit()
db.close()

_, names_offline = listing(lat=SALEM[0], lng=SALEM[1])
check("an offline partner is not offered", "Near Neighbour" not in names_offline,
      names_offline)

print()
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
