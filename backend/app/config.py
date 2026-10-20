import os
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values, load_dotenv

load_dotenv()

def _env(*names: str, default: Optional[str] = None) -> Optional[str]:
    """The first of these environment variables that is set."""
    for name in names:
        value = os.getenv(name)

        if value is not None and value.strip():
            return value

    return default


def _setting(name: str, default: Optional[str] = None) -> Optional[str]:
    """
    A GigEzee setting, under whichever prefix the environment uses.

    The app was renamed from KOODAM to GigEzee partway through, so live
    environments carry a mix of GIGEZEE_* and KOODAM_* names. Reading
    both means a deployment keeps working through the rename instead of
    silently falling back to a default - which is exactly how
    ADMIN_EMAILS once came out empty and locked every staff member out
    of the escalations console.

    `name` may be given with either prefix or with none.
    """
    suffix = name

    for prefix in ("GIGEZEE_", "KOODAM_"):
        if suffix.startswith(prefix):
            suffix = suffix[len(prefix):]
            break

    return _env(f"GIGEZEE_{suffix}", f"KOODAM_{suffix}", default=default)


# Kept so older call sites keep reading; _setting is the one to use.
_env_legacy = _setting


DATABASE_URL = os.getenv("DATABASE_URL")

SUPABASE_URL = os.getenv("SUPABASE_URL")

SUPABASE_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY"
)

# Deployed frontend URLs allowed to call the API, comma-separated
# (e.g. https://gigezee.vercel.app); localhost is always allowed
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

# GigEzee AI reads a photo of the broken thing and works out what a
# partner should check. Unset means the feature is off and members pick
# a service themselves.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()

# Serve canned diagnoses instead of calling Claude, so the camera flow
# can be tested on a deployed backend with no API key and no charges.
# The answers are fixed text, not real analysis: every one is marked
# [DEV FAKE] in summary_for_partner so the rows can be found and
# deleted. Never leave this on once a real key is set - see
# app/fake_diagnosis.py.
FAKE_AI = os.getenv("GIGEZEE_FAKE_AI", "").strip().lower() in {
    "1", "true", "yes", "on"
}

# A real key is what the feature should run on; the fake is only a
# stand-in while there isn't one
if FAKE_AI and ANTHROPIC_API_KEY:
    FAKE_AI = False

# Gnani (api.vachana.ai) speech to text, used only where the browser
# cannot listen for itself. Unset means the app falls back to typing.
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "").strip()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")

RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

# Test keys: no real money moves
RAZORPAY_TEST_MODE = (RAZORPAY_KEY_ID or "").startswith("rzp_test_")

# GigEzee's RazorpayX account number. When set, partner withdrawals are
# paid out by RazorpayX straight away; otherwise staff pay them by hand
RAZORPAYX_ACCOUNT_NUMBER = os.getenv("RAZORPAYX_ACCOUNT_NUMBER", "").strip()

# It's all digits; anything else (e.g. a placeholder) counts as not set
if not RAZORPAYX_ACCOUNT_NUMBER.isdigit():
    RAZORPAYX_ACCOUNT_NUMBER = ""

# Flat fee the customer pays GigEzee on every booking (rupees)
TRUST_FEE = float(_setting("TRUST_FEE", "20"))

# GigEzee's share of the service price; extra parts are never commissioned
PLATFORM_COMMISSION_PERCENT = float(
    _setting("PLATFORM_COMMISSION_PERCENT", "10")
)

# backend/.env and the frontend's .env in the project root
_BACKEND_ENV = Path(__file__).resolve().parent.parent / ".env"
_FRONTEND_ENV = _BACKEND_ENV.parent.parent / ".env"


def firebase_project_id() -> Optional[str]:
    """
    Firebase project whose ID tokens the backend accepts.
    Read when needed rather than once at startup, so a value added to
    either .env file works without restarting the server. Falls back to
    the frontend's VITE_FIREBASE_PROJECT_ID, so it only has to be set once.
    """
    value = os.getenv("FIREBASE_PROJECT_ID")

    if value:
        return value.strip()

    for path in (_BACKEND_ENV, _FRONTEND_ENV):
        values = dotenv_values(path) if path.exists() else {}
        value = (
            values.get("FIREBASE_PROJECT_ID")
            or values.get("VITE_FIREBASE_PROJECT_ID")
        )

        if value and value.strip():
            os.environ["FIREBASE_PROJECT_ID"] = value.strip()
            return value.strip()

    return None

def env_setting(*names: str) -> Optional[str]:
    """
    The first of these settings that has a value, from the environment or
    either .env file (so a frontend VITE_ value only has to be set once).
    """
    for name in names:
        value = os.getenv(name)

        if value and value.strip():
            return value.strip()

    for path in (_BACKEND_ENV, _FRONTEND_ENV):
        values = dotenv_values(path) if path.exists() else {}

        for name in names:
            value = values.get(name)

            if value and value.strip():
                return value.strip()

    return None


# =========================================================
# PHONE BOOKING (offline mode)
# Customers without a smartphone book by calling GigEzee's number. The
# backend creates the same Firebase booking the app does, so partners
# get it in their usual portal. Phone bookings are paid in cash.
# =========================================================

# The number customers call, as shown on the landing page
IVR_PHONE_NUMBER = _setting("IVR_NUMBER", "")

# The public https address of this backend, used to check that a call
# webhook really came from the phone provider (e.g. https://api.gigezee.in)
IVR_PUBLIC_URL = (_setting("IVR_PUBLIC_URL", "") or "").rstrip("/")

# Twilio signs every webhook with the account's auth token
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")

# Business category Razorpay files each partner's Route linked account
# under (values from Razorpay's business category list)
ROUTE_BUSINESS_CATEGORY = _setting("ROUTE_CATEGORY", "services")

ROUTE_BUSINESS_SUBCATEGORY = _setting(
    "ROUTE_SUBCATEGORY", "repair_and_cleaning"
)


# ---------------------------------------------------------
# Partner escalations and penalties
# ---------------------------------------------------------

def _env_number(name: str, default: float) -> float:
    try:
        return float(_setting(name, str(default)))
    except (TypeError, ValueError):
        return float(default)


# GigEzee staff, by sign-in email (comma-separated). Users can't make
# themselves admins: the users.role column is set by the app itself.
ADMIN_EMAILS = {
    email.strip().lower()
    for email in (_setting("ADMIN_EMAILS", "") or "").split(",")
    if email.strip()
}

# Hours a partner has to reply to a customer's complaint
COMPLAINT_RESPONSE_HOURS = _env_number("GIGEZEE_COMPLAINT_RESPONSE_HOURS", 24)

# Hours after the booked time before an accepted job that hasn't
# started, or a started job that hasn't finished, is escalated
JOB_START_GRACE_HOURS = _env_number("GIGEZEE_JOB_START_GRACE_HOURS", 2)
JOB_FINISH_GRACE_HOURS = _env_number("GIGEZEE_JOB_FINISH_GRACE_HOURS", 12)

# Jobs booked before this date are never escalated automatically, so
# turning the feature on doesn't punish partners for old test bookings
ESCALATIONS_FROM = _setting("ESCALATIONS_FROM", "2026-10-03")

# A partner's first escalation in this window is a warning, the rest are
# strikes; this many strikes in the window suspends them
STRIKE_WINDOW_DAYS = _env_number("GIGEZEE_STRIKE_WINDOW_DAYS", 30)
STRIKES_TO_SUSPEND = int(_env_number("GIGEZEE_STRIKES_TO_SUSPEND", 3))
SUSPENSION_DAYS = _env_number("GIGEZEE_SUSPENSION_DAYS", 7)

# Reliability score: 100 minus these points per warning / strike from
# the last RELIABILITY_DAYS days. It lowers the partner's place in search.
RELIABILITY_DAYS = _env_number("GIGEZEE_RELIABILITY_DAYS", 90)
WARNING_POINTS = _env_number("GIGEZEE_WARNING_POINTS", 5)
STRIKE_POINTS = _env_number("GIGEZEE_STRIKE_POINTS", 20)

# How often the server looks for overdue jobs and unanswered complaints
ESCALATION_SWEEP_MINUTES = _env_number("GIGEZEE_ESCALATION_SWEEP_MINUTES", 10)
