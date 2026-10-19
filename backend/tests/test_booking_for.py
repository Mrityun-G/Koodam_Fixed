"""Tests the booking-for / Child Care backend changes on a throwaway
in-memory SQLite database. Never connects to Supabase.
Run with: npm test (from the project folder)"""
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


from app.database import Base, get_db
import app.models.user, app.models.partner, app.models.service, app.models.booking  # noqa
import app.models.booking_detail, app.models.partner_service, app.models.app_config  # noqa
import app.models.review, app.models.payout, app.models.escalation, app.models.photo  # noqa
import app.models.partner_document, app.models.notification, app.models.emergency  # noqa
from app.models.user import User
from app.models.partner import Partner
from app.models.service import Service
from app.models.app_config import AppConfig
from app.models.booking_detail import BookingDetail, BookingRecipient
from app.service_catalog import (
    RETIRED_TILES,
    RETIRED_TILES_KEY,
    retire_tiles,
    sync_service_catalog,
)

engine = create_engine("sqlite://", poolclass=StaticPool,
                       connect_args={"check_same_thread": False})


# Stand-ins for the Postgres-only functions the Partner model uses
@event.listens_for(engine, "connect")
def _pg_funcs(conn, _):
    conn.create_function("greatest", -1, lambda *a: max(x for x in a if x is not None))
    conn.create_function("timezone", 2, lambda tz, ts: ts)
    conn.create_function("make_interval", -1, lambda *a: 0)


Base.metadata.create_all(engine)
TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.routers import service as service_r, partner_service as ps_r
from app.routers import partner as partner_r, booking_sync as sync_r

api = FastAPI()
for r in (service_r, ps_r, partner_r, sync_r):
    api.include_router(r.router)


def _db():
    s = TestSession()
    try:
        yield s
    finally:
        s.close()


api.dependency_overrides[get_db] = _db
client = TestClient(api)
SYNC = [r.path for r in sync_r.router.routes if r.path.endswith("/sync")][0]
BILL = [r.path for r in sync_r.router.routes
        if "/billing/" in r.path and "partner" not in r.path][0]

passed = failed = 0


def check(name, cond, info=""):
    global passed, failed
    if cond:
        passed += 1
        print("PASS", name)
    else:
        failed += 1
        print("FAIL", name, "|", info)


db = TestSession()

# ---------- Catalog ----------
sync_service_catalog(db)
cc = db.query(Service).filter(Service.title == "Child Care").all()
check("fresh DB: Child Care tile created once", len(cc) == 1)
check("Child Care needs police verification", cc and cc[0].requires_police_verification)
check("Child Care is 199 for 60 min", cc and cc[0].price == 199 and cc[0].duration_minutes == 60)
others = db.query(Service).filter(Service.title != "Child Care").all()
check("other tiles don't need police verification",
      all(not s.requires_police_verification for s in others))
marker = db.get(AppConfig, "catalog_tiles_added")
check("app_config remembers Child Care was added", marker and "Child Care" in marker.value)

sync_service_catalog(db)
check("restart: no duplicate Child Care",
      db.query(Service).filter(Service.title == "Child Care").count() == 1)

cc[0].is_active = False
db.commit()
sync_service_catalog(db)
db.expire_all()
check("restart: Child Care switched off by staff stays off",
      db.query(Service).filter(Service.title == "Child Care").one().is_active is False)
cc[0].is_active = True
db.commit()

# ---------- Dropped tiles ----------
# Taking a tile out of CATALOG doesn't remove rows already written to a
# database that started up while it was listed, so they are switched off
check("dropped tiles are no longer in the catalog",
      not {s.title for s in db.query(Service).filter(Service.is_active.is_(True))}
      & set(RETIRED_TILES))

live_before = db.query(Service).filter(Service.is_active.is_(True)).count()

# A database that still has one, as the deployed one does
stale_title = RETIRED_TILES[0]
db.add(Service(id=uuid.uuid4(), title=stale_title, category=stale_title,
               description="left over", price=99.0, duration_minutes=60,
               tag="Printing", icon="print", sort_order=90, is_active=True))
db.flush()
stale = db.query(Service).filter(Service.title == stale_title).one()
db.query(AppConfig).filter(AppConfig.key == RETIRED_TILES_KEY).delete()
db.commit()

retire_tiles(db)
db.expire_all()

check("a leftover dropped tile is switched off",
      db.query(Service).filter(Service.title == stale_title,
                               Service.is_active.is_(True)).count() == 0)
check("switching it off leaves the rest of the catalog alone",
      db.query(Service).filter(Service.is_active.is_(True)).count() == live_before)
check("the retirement is remembered",
      set(db.get(AppConfig, RETIRED_TILES_KEY).value) == set(RETIRED_TILES))

# Staff may want it back; a restart must not undo their decision
stale.is_active = True
db.commit()
retire_tiles(db)
db.expire_all()
check("staff re-enabling a dropped tile survives a restart",
      db.query(Service).filter(Service.title == stale_title,
                               Service.is_active.is_(True)).count() == 1)
db.query(Service).filter(Service.title == stale_title).delete()
db.commit()

# Simulate the live DB, which predates Child Care
db.delete(db.get(AppConfig, "catalog_tiles_added"))
db.query(Service).filter(Service.title == "Child Care").delete()
db.commit()
sync_service_catalog(db)
check("existing DB: Child Care added on next start",
      db.query(Service).filter(Service.title == "Child Care").count() == 1)
child_care = db.query(Service).filter(Service.title == "Child Care").one()
plumbing = db.query(Service).filter(Service.title != "Child Care",
                                    Service.is_active.is_(True)).first()


# ---------- People ----------
def make_user(name, role="MEMBER"):
    u = User(id=uuid.uuid4(), firebase_uid="fb-" + name, name=name,
             email=f"{name}@test.local", role=role)
    db.add(u)
    db.commit()
    return u


member = make_user("parent")
p_user = make_user("sitter", "PARTNER")
partner = Partner(id=uuid.uuid4(), user_id=p_user.id, is_online=True,
                  is_verified=True, police_verification_status="NOT_SUBMITTED",
                  latitude=13.08, longitude=80.27)
db.add(partner)
db.commit()

# ---------- Police verification gate ----------
r = client.post("/partner-services/", json={"partner_id": str(partner.id),
                                            "service_id": str(child_care.id)})
check("unverified partner can't add Child Care (403)", r.status_code == 403, r.text)
check("403 message explains police verification", "police" in r.text.lower(), r.text)

r = client.post("/partner-services/", json={"partner_id": str(partner.id),
                                            "service_id": str(plumbing.id)})
check(f"unverified partner can still add {plumbing.title}", r.status_code == 200, r.text)

partner.police_verification_status = "VERIFIED"
db.commit()
r = client.post("/partner-services/", json={"partner_id": str(partner.id),
                                            "service_id": str(child_care.id)})
check("verified partner can add Child Care", r.status_code == 200, r.text)


def listed(service):
    r = client.get(f"/services/{service.id}/partners")
    return r.status_code, str(partner.id) in r.text, r.text


code, shown, txt = listed(child_care)
check("verified partner listed for Child Care", code == 200 and shown, txt[:300])

partner.police_verification_status = "UNDER_REVIEW"
db.commit()
code, shown, txt = listed(child_care)
check("verification withdrawn -> hidden from Child Care", code == 200 and not shown, txt[:300])
code, shown, txt = listed(plumbing)
check(f"...but still listed for {plumbing.title}", code == 200 and shown, txt[:300])

wp = client.get("/services/with-partners").json()
cc_entry = [e for e in wp if str(e.get("id")) == str(child_care.id)
            or e.get("title") == "Child Care"]
check("/services/with-partners also hides them from Child Care",
      cc_entry and str(partner.id) not in str(cc_entry[0]), str(cc_entry)[:300])
partner.police_verification_status = "VERIFIED"
db.commit()

# ---------- Booking sync: booked for my child, 6 hours ----------
start = datetime.utcnow().replace(microsecond=0) + timedelta(days=1)
base = {
    "customer_id": str(member.id), "partner_id": str(partner.id),
    "service_id": str(child_care.id), "booking_status": "ACCEPTED",
    "current_step": 2, "total_amount": 1214, "address": "12 Anna Nagar",
    "scheduled_at": start.isoformat() + "Z",
}
order = dict(base, firebase_order_id="ord-child", duration_minutes=360,
             booked_for={"relation": "child", "name": " Anu ", "phone": " ",
                         "age": 7, "notes": " Pickup at 3pm "})
r = client.post(SYNC, json=order)
check("sync booking for child: 200", r.status_code == 200, r.text)
bid = uuid.UUID(str(r.json().get("booking_id")))
db.expire_all()
rec = db.get(BookingRecipient, bid)
got = rec and (rec.relation, rec.name, rec.phone, rec.age, rec.notes)
check("recipient saved; relation upper-cased, text trimmed, blank phone -> None",
      got == ("CHILD", "Anu", None, 7, "Pickup at 3pm"), got)
det = db.query(BookingDetail).filter(BookingDetail.booking_id == bid).one()
check("duration 360 min saved", det.duration_minutes == 360, det.duration_minutes)

r = client.post(SYNC, json=dict(order, current_step=3,
                                 booked_for=dict(order["booked_for"], notes="Allergic to nuts")))
db.expire_all()
check("re-sync updates the same recipient row (no duplicate)",
      r.status_code == 200 and db.query(BookingRecipient).count() == 1
      and db.get(BookingRecipient, bid).notes == "Allergic to nuts", r.text)

client.post(SYNC, json=dict(order, duration_minutes=None))
db.expire_all()
check("re-sync without duration keeps 6 hrs",
      db.query(BookingDetail).filter(BookingDetail.booking_id == bid).one().duration_minutes == 360)


# ---------- Partner calendar uses 6 hours ----------
def hours(s):
    a = datetime.fromisoformat(s["start"].replace("Z", "+00:00"))
    b = datetime.fromisoformat(s["end"].replace("Z", "+00:00"))
    return (b - a).total_seconds() / 3600


r = client.get(f"/partners/{partner.id}/busy-slots")
check("busy slot for the care booking lasts 6 hrs",
      r.status_code == 200 and any(hours(s) == 6 for s in r.json()), r.text[:300])

r = client.get(f"/partners/{partner.id}/overview")
check("overview's upcoming job shows 360 min",
      r.status_code == 200 and '"duration_minutes":360' in r.text.replace(" ", ""), r.text[:400])

# ---------- Self booking & bad input ----------
r = client.post(SYNC, json=dict(base, firebase_order_id="ord-self",
                                service_id=str(plumbing.id), total_amount=319,
                                scheduled_at=(start + timedelta(days=1)).isoformat() + "Z"))
self_id = uuid.UUID(str(r.json().get("booking_id")))
db.expire_all()
check("booking for myself: no recipient row",
      r.status_code == 200 and db.get(BookingRecipient, self_id) is None, r.text)
r = client.get(f"/partners/{partner.id}/busy-slots")
expected = (plumbing.duration_minutes or 60) / 60
check(f"normal booking keeps its usual length ({expected:g} h)",
      any(hours(s) == expected for s in r.json()), r.text[:300])

r = client.post(SYNC, json=dict(base, firebase_order_id="ord-boss",
                                booked_for={"relation": "BOSS", "name": "X"}))
db.expire_all()
check("unknown relation 'BOSS' ignored",
      r.status_code == 200 and db.get(BookingRecipient, uuid.UUID(r.json()["booking_id"])) is None)

r = client.post(SYNC, json=dict(base, firebase_order_id="ord-self2",
                                booked_for={"relation": "SELF", "name": "Me"}))
check("relation SELF not saved as recipient",
      db.get(BookingRecipient, uuid.UUID(r.json()["booking_id"])) is None)

for name, extra in [
    ("duration 5 min rejected", {"duration_minutes": 5}),
    ("duration over 24 h rejected", {"duration_minutes": 2000}),
    ("empty recipient name rejected", {"booked_for": {"relation": "GUEST", "name": ""}}),
    ("negative age rejected", {"booked_for": {"relation": "CHILD", "name": "A", "age": -1}}),
]:
    r = client.post(SYNC, json=dict(base, firebase_order_id="ord-" + name, **extra))
    check(name + " (422)", r.status_code == 422, r.status_code)

# ---------- Bills ----------
r = client.get(BILL.replace("{customer_identifier}", str(member.id)))
bills = r.json() if r.status_code == 200 else []
child_bills = [b for b in bills if b.get("booked_for")]
check("bill shows booked_for {name, relation} (no phone/notes leaked)",
      len(child_bills) == 1 and child_bills[0]["booked_for"] == {"name": "Anu", "relation": "CHILD"},
      str(child_bills)[:300])
check("other bills have booked_for = null",
      len(bills) > 1 and sum(1 for b in bills if b.get("booked_for") is None) == len(bills) - 1,
      str(bills)[:300])

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
