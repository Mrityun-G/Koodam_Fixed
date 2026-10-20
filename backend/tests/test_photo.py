"""Tests job photo upload and serving on a throwaway in-memory SQLite
database. Nothing leaves the machine: no Firebase, no Supabase, no
Storage. Run with: npm test (from the project folder)"""
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


from app.database import Base, get_db
import app.models.user, app.models.partner, app.models.service, app.models.booking  # noqa
import app.models.booking_detail, app.models.photo  # noqa
from app.models.booking_detail import BookingDetail
from app.models.photo import Photo

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

from app.auth import current_firebase_uid
from app.routers import photo as photo_r


passed = failed = 0


def check(label, ok):
    global passed, failed
    if ok:
        passed += 1
        print(f"PASS {label}")
    else:
        failed += 1
        print(f"FAIL {label}")


# ---------- one booking the partner is working on ----------
# Only the booking_details row matters here: it is what the upload
# checks the order id against.
db = TestSession()
db.add(BookingDetail(
    booking_id=uuid.uuid4(),
    firebase_order_id="order-abc",
    current_step=3,
    base_amount=599.0,
    payment_status="PENDING",
    source="APP",
    payment_method="CASH",
    updated_at=datetime.utcnow(),
))
db.commit()
db.close()

app = FastAPI()
app.include_router(photo_r.router)
app.dependency_overrides[current_firebase_uid] = lambda: "uid-partner"


def override_db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_db] = override_db
client = TestClient(app, raise_server_exceptions=False)

# Small stand-ins; the app has already shrunk the real photo by here
JPEG = b"\xff\xd8\xff\x00 not really a jpeg"
PNG = b"\x89PNG\r\n\x1a\n not really a png"


# ---------- the partner shares the finished repair ----------
response = client.post(
    "/photos",
    files={"file": ("repair.jpg", JPEG, "image/jpeg")},
    data={"order_id": "order-abc", "label": "repair"},
)

check("repair photo accepted", response.status_code == 200)
body = response.json() if response.status_code == 200 else {}
photo_id = body.get("id")

check("response carries a link the app can show",
      str(body.get("path", "")) == f"/photos/{photo_id}")

# ---------- what got stored ----------
db = TestSession()
record = db.get(Photo, uuid.UUID(str(photo_id)))
check("stored against the booking", record.firebase_order_id == "order-abc")
check("stored as a repair photo", record.label == "repair")
check("stored against whoever uploaded it", record.uploaded_by == "uid-partner")
check("photo bytes kept whole", record.data == JPEG)
check("size recorded", record.size_bytes == len(JPEG))
check("upload time recorded", record.created_at is not None)
db.close()

# ---------- a photo of the part, for the customer to approve ----------
response = client.post(
    "/photos",
    files={"file": ("part.png", PNG, "image/png")},
    data={"order_id": "order-abc", "label": "part"},
)
check("part photo accepted as PNG", response.status_code == 200)
part_id = response.json().get("id") if response.status_code == 200 else None

response = client.post(
    "/photos",
    files={"file": ("part.webp", b"RIFF\x00\x00\x00\x00WEBP", "image/webp")},
    data={"order_id": "order-abc", "label": "part"},
)
check("WebP accepted", response.status_code == 200)

# ---------- labels the record doesn't use are refused ----------
response = client.post(
    "/photos",
    files={"file": ("selfie.jpg", JPEG, "image/jpeg")},
    data={"order_id": "order-abc", "label": "selfie"},
)
check("an unknown label is refused (422)", response.status_code == 422)

# ---------- a photo needs a booking to belong to ----------
response = client.post(
    "/photos",
    files={"file": ("repair.jpg", JPEG, "image/jpeg")},
    data={"order_id": "no-such-order", "label": "repair"},
)
check("unknown booking refused (404)", response.status_code == 404)
check("unknown booking says so in plain words",
      "couldn't be found" in response.json().get("detail", ""))

# ---------- not a photo ----------
response = client.post(
    "/photos",
    files={"file": ("invoice.pdf", b"%PDF-1.4", "application/pdf")},
    data={"order_id": "order-abc", "label": "repair"},
)
check("PDF refused (400)", response.status_code == 400)

# ---------- an empty file ----------
response = client.post(
    "/photos",
    files={"file": ("empty.jpg", b"", "image/jpeg")},
    data={"order_id": "order-abc", "label": "repair"},
)
check("empty photo refused (400)", response.status_code == 400)

# ---------- a photo the app failed to shrink ----------
# The app sends a few hundred KB; the cap is 3 MB
too_big = b"\xff\xd8\xff" + b"\x00" * (3 * 1024 * 1024)
response = client.post(
    "/photos",
    files={"file": ("huge.jpg", too_big, "image/jpeg")},
    data={"order_id": "order-abc", "label": "repair"},
)
check("oversized photo refused (400)", response.status_code == 400)

db = TestSession()
check("nothing refused was stored", db.query(Photo).count() == 3)
db.close()

# ---------- the screens read it back ----------
response = client.get(f"/photos/{photo_id}")
check("photo served", response.status_code == 200)
check("photo served with its own type",
      response.headers["content-type"].startswith("image/jpeg"))
check("photo served byte for byte", response.content == JPEG)
check("photo cached hard, since it never changes",
      "immutable" in response.headers.get("cache-control", ""))

response = client.get(f"/photos/{part_id}")
check("the part photo keeps its own type",
      response.status_code == 200
      and response.headers["content-type"].startswith("image/png"))

# ---------- links that lead nowhere ----------
response = client.get(f"/photos/{uuid.uuid4()}")
check("unknown photo id is a 404", response.status_code == 404)

response = client.get("/photos/not-a-uuid")
check("a malformed photo link is refused (422)", response.status_code == 422)

print()
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
