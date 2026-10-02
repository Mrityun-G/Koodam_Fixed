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
