"""Tests for GST on bills and the staff check of a partner's ID documents.

GST: charged only while a GSTIN is set, added on top of the bill, split
into equal CGST and SGST, never part of the partner's share, and fixed
for a booking once it's recorded.

ID check: Aadhaar, PAN and Voter ID go to staff once all three are in;
only staff approval gives the partner the Verified tick customers see.

Throwaway in-memory SQLite; never connects to Supabase.
Run with: npm test (from the project folder)
"""
import sys, uuid
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
import app.app_config as app_config
import app.authz as authz
from app.models.user import User
from app.models.partner import Partner
from app.models.service import Service
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

# Settings are read from this database, and one address is staff
app_config.SessionLocal = TestSession
authz.ADMIN_EMAILS = {"staff@gigezee.test"}

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.routers import app_config as config_r, booking_sync as sync_r
from app.routers import escalations as esc_r, partner as partner_r
from app.routers.payment import calculate_split
from app.tax import gst_lines

api = FastAPI()
for r in (config_r, sync_r, esc_r, partner_r):
    api.include_router(r.router)


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
    app_config.seed_app_config(db)  # trust fee 20, commission 10%, GST 18%

    member = User(id=uuid.uuid4(), firebase_uid="member-uid", name="Meena",
                  email="meena@example.com", phone="9876543210")
    staff = User(id=uuid.uuid4(), firebase_uid="staff-uid", name="Staff",
                 email="staff@gigezee.test", phone="9876543211")
    helper_user = User(id=uuid.uuid4(), firebase_uid="helper-uid", name="Ravi",
                       email="ravi@example.com", phone="9876543212", role="PARTNER")
    other_user = User(id=uuid.uuid4(), firebase_uid="other-uid", name="Other",
                      email="other@example.com", phone="9876543213", role="PARTNER")
    db.add_all([member, staff, helper_user, other_user])
    db.flush()

    helper = Partner(id=uuid.uuid4(), user_id=helper_user.id)
    other = Partner(id=uuid.uuid4(), user_id=other_user.id)
    service = Service(id=uuid.uuid4(), title="Plumbing & Repair",
                      description="taps", category="Plumbing & Repair", price=399)
    db.add_all([helper, other, service])
    db.commit()

    MEMBER_ID, HELPER_ID, OTHER_ID = member.id, helper.id, other.id
    SERVICE_ID = service.id


def set_gstin(value):
    with TestSession() as db:
        app_config.save_value(db, "gstin", value, "test")


# =========================================================
# GST arithmetic and the money split
# =========================================================

bill = gst_lines(419, 18)
check("18% on Rs 419 is CGST Rs 37.71 + SGST Rs 37.71",
      bill["cgst"] == 37.71 and bill["sgst"] == 37.71, bill)
check("...making Rs 494.42", bill["total"] == 494.42, bill)
check("no rate, no tax", gst_lines(419, 0)["total"] == 419)

split = calculate_split(494.42, 0, 75.42)
check("GST isn't counted as the job price", split["service_price"] == 399, split)
check("...so the partner's share is the same as without GST",
      split["partner_payout"] == 359.1, split)
check("...and so is GigEzee's", split["gigezee_share"] == 59.9, split)

with_part = gst_lines(419 + 100, 18)
split = calculate_split(with_part["total"], 100, with_part["tax"])
check("GST on an approved part doesn't go to the partner either",
      split["partner_payout"] == 459.1, split)


# =========================================================
# Settings: no GST until there's a GSTIN
# =========================================================

config = client.get("/config").json()
check("no GSTIN: nothing is charged", config["gst_charged_percent"] == 0, config)
check("...though the rate is ready", config["gst_percent"] == 18, config)

as_user("member-uid")
response = client.put("/admin/settings", json={"gstin": "29ABCDE1234F1Z5"})
check("only staff can set the GSTIN", response.status_code == 403, response.text)

as_user("staff-uid")
response = client.put("/admin/settings", json={"gstin": "not-a-gstin"})
check("a malformed GSTIN is refused", response.status_code == 400, response.text)

response = client.put("/admin/settings", json={"gstin": " 29abcde1234f1z5 "})
check("a valid GSTIN is saved, tidied up",
      response.status_code == 200 and response.json()["gstin"] == "29ABCDE1234F1Z5",
      response.text)
check("...and GST is charged from then on",
      response.json()["gst_charged_percent"] == 18, response.text)


# =========================================================
# Booking sync: the app's GST is checked and kept
# =========================================================

def sync(order_id, total, percent=0, cgst=0, sgst=0):
    as_user("member-uid")
    return client.post("/bookings/sync", json={
        "firebase_order_id": order_id,
        "customer_id": str(MEMBER_ID),
        "partner_id": str(HELPER_ID),
        "service_id": str(SERVICE_ID),
        "booking_status": "ACCEPTED",
        "total_amount": total,
        "gst_percent": percent,
        "cgst": cgst,
        "sgst": sgst,
    })


response = sync("taxed-job", 494.42, 18, 37.71, 37.71)
check("a booking with GST is recorded", response.status_code == 200, response.text)

with TestSession() as db:
    detail = db.query(BookingDetail).filter_by(firebase_order_id="taxed-job").one()
    check("...with its rate, tax and GSTIN",
          (detail.gst_percent, detail.cgst_amount, detail.sgst_amount, detail.gstin)
          == (18, 37.71, 37.71, "29ABCDE1234F1Z5"),
          (detail.gst_percent, detail.cgst_amount, detail.sgst_amount, detail.gstin))

response = sync("taxed-job", 494.42, 18, 30, 30)
check("tax that doesn't add up is refused", response.status_code == 422, response.text)

response = sync("taxed-job", 469.28, 12, 25.14, 25.14)
check("a booking's GST rate can't change later", response.status_code == 409, response.text)

response = sync("old-job", 419)
check("a booking without GST still syncs", response.status_code == 200, response.text)

set_gstin("")
response = sync("sneaky-job", 494.42, 18, 37.71, 37.71)
check("no GSTIN: a new booking can't carry GST", response.status_code == 409, response.text)

response = sync("taxed-job", 494.42, 18, 37.71, 37.71)
check("...but one booked while it was charged keeps it",
      response.status_code == 200, response.text)

bills = {b["total_amount"]: b for b in client.get(f"/bookings/billing/{MEMBER_ID}").json()}
taxed = bills.get(494.42, {})
check("the bill shows CGST, SGST and the GSTIN",
      (taxed.get("cgst"), taxed.get("sgst"), taxed.get("gst_percent"), taxed.get("gstin"))
      == (37.71, 37.71, 18, "29ABCDE1234F1Z5"), taxed)
check("...and the partner's share leaves the tax out",
      taxed.get("service_price") == 399 and taxed.get("partner_payout") == 359.1, taxed)
check("an untaxed bill shows no tax",
      bills.get(419, {}).get("cgst") == 0 and bills.get(419, {}).get("gstin") is None,
      bills.get(419))


# =========================================================
# ID documents and the Verified tick
# =========================================================

def upload(kind, partner_id=HELPER_ID, uid="helper-uid",
           content=b"%PDF-1.4 scan", content_type="application/pdf"):
    as_user(uid)
    return client.post(
        f"/partners/{partner_id}/id-documents/{kind}",
        files={"file": (f"{kind}.pdf", content, content_type)},
    )


def helper_state():
    with TestSession() as db:
        p = db.get(Partner, HELPER_ID)
        return p.id_check_status, p.is_verified


response = upload("aadhaar")
check("a partner uploads their Aadhaar",
      response.status_code == 200 and response.json()["documents"]["aadhaar"],
      response.text)
check("...one of three isn't sent for checking yet",
      response.json()["status"] == "NOT_SUBMITTED", response.text)

check("a text file isn't accepted",
      upload("pan", content=b"hi", content_type="text/plain").status_code == 400)
check("an unknown document is refused", upload("passport").status_code == 404)
check("nobody can upload for another partner",
      upload("pan", uid="other-uid").status_code == 403)

upload("pan")
response = upload("voter_id")
check("with all three in, staff are asked to check them",
      response.json()["status"] == "UNDER_REVIEW", response.text)
check("...and there's no tick yet", helper_state() == ("UNDER_REVIEW", False))

as_user("staff-uid")
queue = client.get("/admin/escalations").json()["id_verifications"]
check("the partner is in staff's ID queue",
      [q["id"] for q in queue] == [str(HELPER_ID)]
      and all(queue[0]["documents"].values()), queue)

response = client.get(f"/partners/{HELPER_ID}/id-documents/pan/file")
check("staff can open a document",
      response.status_code == 200 and response.content == b"%PDF-1.4 scan",
      response.status_code)

as_user("member-uid")
check("a customer can't open it",
      client.get(f"/partners/{HELPER_ID}/id-documents/pan/file").status_code == 403)
check("a customer can't approve it",
      client.post(f"/admin/partners/{HELPER_ID}/id-verification",
                  json={"status": "VERIFIED"}).status_code == 403)

as_user("staff-uid")
check("a rejection needs a reason",
      client.post(f"/admin/partners/{HELPER_ID}/id-verification",
                  json={"status": "REJECTED"}).status_code == 422)
client.post(f"/admin/partners/{HELPER_ID}/id-verification",
            json={"status": "REJECTED", "reason": "PAN photo is blurred"})
check("rejected: no tick", helper_state() == ("REJECTED", False))

as_user("helper-uid")
status = client.get(f"/partners/{HELPER_ID}/id-documents").json()
check("the partner sees why",
      status["rejection_reason"] == "PAN photo is blurred", status)

response = upload("pan", content=b"%PDF-1.4 clear scan")
check("re-uploading sends them back to staff, reason cleared",
      response.json()["status"] == "UNDER_REVIEW"
      and response.json()["rejection_reason"] is None, response.text)

as_user("staff-uid")
response = client.post(f"/admin/partners/{HELPER_ID}/id-verification",
                       json={"status": "VERIFIED"})
check("staff approve them", response.status_code == 200, response.text)
check("...and the partner gets the Verified tick", helper_state() == ("VERIFIED", True))
check("...and leaves the queue",
      client.get("/admin/escalations").json()["id_verifications"] == [])

upload("aadhaar", content=b"%PDF-1.4 new aadhaar")
check("a changed document loses the tick until staff look again",
      helper_state() == ("UNDER_REVIEW", False))

as_user("staff-uid")
response = client.post(f"/admin/partners/{OTHER_ID}/id-verification",
                       json={"status": "VERIFIED"})
check("a partner without all three documents can't be approved",
      response.status_code == 409, response.text)

print()
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
