"""Runs the real GigEzee backend with GigEzee AI faked out.

For testing the camera and the diagnosis screen without an Anthropic
API key: the photo makes the whole round trip, but the Claude call is
replaced with a canned answer, exactly like tests/test_diagnosis.py
does. Nothing is sent to Anthropic and nothing is charged.

    python tests/dev_server_fake_ai.py            (from the backend folder)
    python tests/dev_server_fake_ai.py --port 8002

Everything else is real - the database, sign-in, bookings - so the
diagnoses you create here are real rows in the real database. Each one
is marked [DEV FAKE] in summary_for_partner so you can find and delete
them afterwards.
"""
import argparse
import os
import socket
import sys
import time
from pathlib import Path

# Lets "import app..." work wherever the script is started from
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def lan_ip():
    """This machine's address on the Wi-Fi, so a phone can reach it."""
    try:
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # No packets are sent; this just picks the outgoing interface
            probe.connect(("8.8.8.8", 80))
            return probe.getsockname()[0]
        finally:
            probe.close()
    except OSError:
        return None


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", type=int, default=8001)
parser.add_argument("--host", default="0.0.0.0")
# How long to pretend to think, so the "thinking" screen is visible
parser.add_argument("--delay", type=float, default=1.5)
args = parser.parse_args()

ADDRESS = lan_ip()

# Set before app.config is imported: load_dotenv() doesn't overwrite what
# is already in the environment, so these win over backend/.env.
#
# A non-empty key is what makes /diagnosis/available say yes, which is
# what puts the camera on the home screen. It is never used to call
# anything - the call itself is replaced further down.
os.environ["ANTHROPIC_API_KEY"] = "dev-fake-ai-no-real-call"

# The phone's address has to be allowed through CORS, or the upload is
# refused by the browser before it ever reaches here
if ADDRESS:
    phone_origins = [
        f"http://{ADDRESS}:{port}" for port in (5173, 5174, 5175, 4173)
    ]
    already = os.environ.get("ALLOWED_ORIGINS", "")
    os.environ["ALLOWED_ORIGINS"] = ",".join(
        [*filter(None, already.split(",")), *phone_origins]
    )

from app.main import app  # noqa: E402  (must follow the env setup above)
from app.routers import diagnosis as diagnosis_router  # noqa: E402


# ---------- the canned answer ----------
# Shaped exactly like the real thing: the same keys, "" fields already
# turned into None, and a service_title that is really bookable.
SAFETY_WORDS = ("smoke", "burn", "spark", "shock", "gas", "smell", "fire")


def pick_service(service_titles, note):
    """
    The real model is told to copy a title that is really bookable.
    This does the same, and prefers an appliance tile when the note
    sounds like one, so the routing looks sensible while testing.
    """
    if any(word in note for word in ("ac", "cool", "fridge", "air", "appliance")):
        for title in service_titles:
            low = title.lower()
            if "ac" in low.split() or "appliance" in low:
                return title

    return service_titles[0] if service_titles else None


def fake_diagnose(image_bytes, image_type, service_titles, member_note=None,
                  language="en"):
    note = (member_note or "").lower()
    risky = any(word in note for word in SAFETY_WORDS)

    print(
        f"  [fake AI] {len(image_bytes):,} bytes of {image_type}"
        f" | note: {member_note or '(none)'!r} | language: {language}"
        f" | {len(service_titles)} bookable services"
    )

    # Pretend to think, so the app's "thinking" state is visible
    time.sleep(args.delay)

    return {
        "appliance": "Split air conditioner, indoor unit",
        "confidence": "medium",
        "photo_problem": None,
        # Routes to a tile that exists, so "Find a helper" works
        "service_title": pick_service(service_titles, note),
        "likely_causes": [
            {
                "cause": "The cooling gas may have leaked out",
                "why": "Runs but doesn't cool is the usual sign of this.",
                "likelihood": "high",
            },
            {
                "cause": "The air filter is clogged",
                "why": "Dust blocks the airflow, so little cold air comes out.",
                "likelihood": "medium",
            },
        ],
        "questions_for_member": [
            "Is any air coming out of the vents at all?",
            "How long has it been like this?",
        ],
        "safety_warning": (
            "Switch it off at the wall and don't use it until a helper has "
            "looked at it."
            if risky else None
        ),
        "urgency": "urgent" if risky else "soon",
        "summary_for_partner": (
            "[DEV FAKE] Canned answer from tests/dev_server_fake_ai.py - "
            "no AI was involved. Member said: "
            f"{member_note or 'nothing'}"
        ),
    }


# The router looks both of these up when a request comes in, so swapping
# them here is enough - app/ai_diagnosis.py is never reached.
diagnosis_router.diagnose = fake_diagnose
diagnosis_router.ANTHROPIC_API_KEY = "dev-fake-ai-no-real-call"


if __name__ == "__main__":
    import uvicorn

    where = ADDRESS or "your-ip"

    print()
    print("=" * 62)
    print("  GigEzee backend - GIGEZEE AI IS FAKED")
    print("=" * 62)
    print("  Photos make the full round trip. The Claude call is")
    print("  replaced with a canned answer: nothing is sent to")
    print("  Anthropic, nothing is charged, no API key needed.")
    print()
    print(f"  This backend : http://{where}:{args.port}")
    print(f"  Start the app: VITE_BACKEND_URL=http://{where}:{args.port} npm run dev -- --host")
    print()
    print("  Diagnoses are saved to the REAL database, marked")
    print("  [DEV FAKE] in summary_for_partner.")
    print("=" * 62)
    print()

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
