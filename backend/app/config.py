import os
from pathlib import Path
from typing import Optional

from dotenv import dotenv_values, load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

SUPABASE_URL = os.getenv("SUPABASE_URL")

SUPABASE_SERVICE_ROLE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY"
)

# Deployed frontend URLs allowed to call the API, comma-separated
# (e.g. https://koodam.vercel.app); localhost is always allowed
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")

RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

# Flat fee the customer pays KOODAM on every booking (rupees)
TRUST_FEE = float(os.getenv("KOODAM_TRUST_FEE", "20"))

# KOODAM's share of the service price; extra parts are never commissioned
PLATFORM_COMMISSION_PERCENT = float(
    os.getenv("KOODAM_PLATFORM_COMMISSION_PERCENT", "10")
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

# Business category Razorpay files each partner's Route linked account
# under (values from Razorpay's business category list)
ROUTE_BUSINESS_CATEGORY = os.getenv("KOODAM_ROUTE_CATEGORY", "services")

ROUTE_BUSINESS_SUBCATEGORY = os.getenv(
    "KOODAM_ROUTE_SUBCATEGORY", "repair_and_cleaning"
)


# ---------------------------------------------------------
# Partner escalations and penalties
# ---------------------------------------------------------

def _env_number(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return float(default)


# KOODAM staff, by sign-in email (comma-separated). Users can't make
# themselves admins: the users.role column is set by the app itself.
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("KOODAM_ADMIN_EMAILS", "").split(",")
    if email.strip()
}

# Hours a partner has to reply to a customer's complaint
COMPLAINT_RESPONSE_HOURS = _env_number("KOODAM_COMPLAINT_RESPONSE_HOURS", 24)

# Hours after the booked time before an accepted job that hasn't
# started, or a started job that hasn't finished, is escalated
JOB_START_GRACE_HOURS = _env_number("KOODAM_JOB_START_GRACE_HOURS", 2)
JOB_FINISH_GRACE_HOURS = _env_number("KOODAM_JOB_FINISH_GRACE_HOURS", 12)

# Jobs booked before this date are never escalated automatically, so
# turning the feature on doesn't punish partners for old test bookings
ESCALATIONS_FROM = os.getenv("KOODAM_ESCALATIONS_FROM", "2026-10-03")

# A partner's first escalation in this window is a warning, the rest are
# strikes; this many strikes in the window suspends them
STRIKE_WINDOW_DAYS = _env_number("KOODAM_STRIKE_WINDOW_DAYS", 30)
STRIKES_TO_SUSPEND = int(_env_number("KOODAM_STRIKES_TO_SUSPEND", 3))
SUSPENSION_DAYS = _env_number("KOODAM_SUSPENSION_DAYS", 7)

# Reliability score: 100 minus these points per warning / strike from
# the last RELIABILITY_DAYS days. It lowers the partner's place in search.
RELIABILITY_DAYS = _env_number("KOODAM_RELIABILITY_DAYS", 90)
WARNING_POINTS = _env_number("KOODAM_WARNING_POINTS", 5)
STRIKE_POINTS = _env_number("KOODAM_STRIKE_POINTS", 20)

# How often the server looks for overdue jobs and unanswered complaints
ESCALATION_SWEEP_MINUTES = _env_number("KOODAM_ESCALATION_SWEEP_MINUTES", 10)
