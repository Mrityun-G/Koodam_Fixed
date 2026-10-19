"""Tests GigEzee AI diagnosis on a throwaway in-memory SQLite database.
The Claude call is stubbed, so no API key is needed and no request is
made. Run with: npm test (from the project folder)"""
import sys
from pathlib import Path

# Lets "import app..." work wherever the script is started from
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@compiles(JSONB, "sqlite")
def _jsonb(type_, compiler, **kw):
    return "JSON"


from app.database import Base, get_db
import app.models.user, app.models.service, app.models.diagnosis  # noqa
from app.models.diagnosis import Diagnosis
from app.models.service import Service

engine = create_engine(
    "sqlite://",
    poolclass=StaticPool,
    connect_args={"check_same_thread": False},
)

Base.metadata.create_all(engine)
TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import current_firebase_uid
from app.routers import diagnosis as diagnosis_r


passed = failed = 0


def check(label, ok):
    global passed, failed
    if ok:
        passed += 1
        print(f"PASS {label}")
    else:
        failed += 1
        print(f"FAIL {label}")


# ---------- a service to route to ----------
db = TestSession()
db.add(Service(
    title="AC & Appliance",
    category="AC & Appliance",
    description="AC servicing",
    price=599.0,
    duration_minutes=90,
    is_active=True,
    sort_order=4,
))
db.add(Service(
    title="Switched Off Tile",
    category="Switched Off Tile",
    description="not bookable",
    price=100.0,
    is_active=False,
    sort_order=99,
))
db.commit()
db.close()


# ---------- stub the model call ----------
# Records what the router passed in, and returns a fixed result in the
# shape the real schema guarantees.
seen = {}


def fake_diagnose(image_bytes, image_type, service_titles, member_note=None,
                  language="en"):
    seen.clear()
    seen.update(
        image_type=image_type,
        service_titles=list(service_titles),
        member_note=member_note,
        language=language,
        size=len(image_bytes),
    )

    return {
        "appliance": "Split air conditioner indoor unit",
        "confidence": "medium",
        "photo_problem": None,
        "service_title": "AC & Appliance",
        "likely_causes": [
            {
                "cause": "The cooling gas may have leaked out",
                "why": "Runs but does not cool is the usual sign.",
                "likelihood": "high",
            }
        ],
        "questions_for_member": ["Is any air coming out of the vents?"],
        "safety_warning": None,
        "urgency": "soon",
        "summary_for_partner": "Runs, no cooling. Check gas charge and coil.",
    }


diagnosis_r.diagnose = fake_diagnose

app = FastAPI()
app.include_router(diagnosis_r.router)
app.dependency_overrides[current_firebase_uid] = lambda: "uid-member"


def override_db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_db] = override_db
client = TestClient(app, raise_server_exceptions=False)

PHOTO = ("problem.jpg", b"\xff\xd8\xff\x00 not really a jpeg", "image/jpeg")


# ---------- the member speaks Tamil ----------
response = client.post(
    "/diagnosis",
    files={"file": PHOTO},
    data={"note": "ஏசி ஓடுகிறது ஆனால் குளிரவில்லை", "language": "ta"},
)

check("Tamil note accepted", response.status_code == 200)
body = response.json() if response.status_code == 200 else {}

check("language passed through to the model", seen.get("language") == "ta")
check("spoken note passed through unchanged",
      seen.get("member_note") == "ஏசி ஓடுகிறது ஆனால் குளிரவில்லை")
check("only bookable tiles offered to the model",
      seen.get("service_titles") == ["AC & Appliance"])
check("response carries the causes", len(body.get("likely_causes", [])) == 1)
check("response carries a photo link",
      str(body.get("photo_path", "")).startswith("/diagnosis/"))
check("response echoes the member's own words",
      body.get("member_note") == "ஏசி ஓடுகிறது ஆனால் குளிரவில்லை")

# ---------- what got stored ----------
db = TestSession()
record = db.query(Diagnosis).first()
check("stored against the signed-in member", record.created_by == "uid-member")
check("stored language", record.language == "ta")
check("stored routed service", record.service_title == "AC & Appliance")
check("stored urgency", record.urgency == "soon")
check("no safety warning flagged", record.has_safety_warning is False)
check("photo bytes kept", record.photo_size_bytes == len(PHOTO[1]))
check("not yet attached to a booking", record.firebase_order_id is None)
diagnosis_id = str(record.id)
db.close()

# ---------- an unknown language falls back, never fails ----------
client.post("/diagnosis", files={"file": PHOTO}, data={"language": "zz"})
check("unknown language falls back to English", seen.get("language") == "en")

# ---------- no note at all is allowed ----------
response = client.post("/diagnosis", files={"file": PHOTO})
check("photo with no note still works", response.status_code == 200)
check("missing note reaches the model as empty", not (seen.get("member_note") or ""))
check("missing language defaults to English", seen.get("language") == "en")

# ---------- a non-photo is refused ----------
response = client.post(
    "/diagnosis",
    files={"file": ("notes.pdf", b"%PDF-1.4", "application/pdf")},
)
check("PDF refused (400)", response.status_code == 400)

# ---------- attaching to a booking ----------
response = client.post(
    f"/diagnosis/{diagnosis_id}/booking",
    data={"order_id": "order-abc"},
)
check("attach to booking: 200", response.status_code == 200)

response = client.get("/diagnosis/for-order/order-abc")
check("partner reads it back by order id",
      response.status_code == 200 and response.json()["id"] == diagnosis_id)
check("partner gets the trade summary",
      response.json().get("summary_for_partner", "").startswith("Runs, no cooling"))

response = client.get("/diagnosis/for-order/no-such-order")
check("unknown order returns nothing",
      response.status_code == 200 and response.json() is None)

# ---------- someone else's diagnosis can't be re-pointed ----------
app.dependency_overrides[current_firebase_uid] = lambda: "uid-stranger"
response = client.post(
    f"/diagnosis/{diagnosis_id}/booking",
    data={"order_id": "order-hijack"},
)
check("a stranger can't attach it to their booking (403)",
      response.status_code == 403)
app.dependency_overrides[current_firebase_uid] = lambda: "uid-member"

# ---------- the photo comes back ----------
response = client.get(f"/diagnosis/{diagnosis_id}/photo")
check("photo served with its own type",
      response.status_code == 200
      and response.headers["content-type"].startswith("image/jpeg"))
check("photo is not cached by shared proxies",
      "private" in response.headers.get("cache-control", ""))

# ---------- the feature reports whether it is on ----------
response = client.get("/diagnosis/available")
check("availability endpoint answers", response.status_code == 200
      and "available" in response.json())

print()
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
