import os

from dotenv import load_dotenv

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