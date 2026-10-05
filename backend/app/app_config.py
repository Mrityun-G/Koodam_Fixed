import threading
import time
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import PLATFORM_COMMISSION_PERCENT, TRUST_FEE
from app.database import SessionLocal
from app.models.app_config import AppConfig


# =========================================================
# APP SETTINGS AND CONTENT (stored in the app_config table)
# The first start writes the defaults below; after that the database is
# the source of truth and staff change it from the admin screen.
# Numbers are read through setting(), cached for a short while so a
# payment doesn't need an extra query.
# =========================================================

# Fees and limits, with the range staff may set
SETTINGS = {
    # Flat fee the customer pays KOODAM on every booking (rupees)
    "trust_fee": {"default": TRUST_FEE, "min": 0, "max": 1000},
    # KOODAM's share of the service price (not of extra parts)
    "platform_commission_percent": {
        "default": PLATFORM_COMMISSION_PERCENT, "min": 0, "max": 50
    },
    # Smallest balance a partner can withdraw (rupees)
    "min_withdrawal": {"default": 100.0, "min": 1, "max": 100000},
}

# Shown in the app. {trust_fee} and {commission_percent} in the FAQ are
# filled in with the current settings.
CONTENT = {
    "faq": [
        {
            "q": "How do I book a helper?",
            "a": 'From the Home screen, browse verified helpers nearby and tap "Quick Book" on any card. Pick a service, date and time, then confirm — your request is sent instantly.'
        },
        {
            "q": "What is the Safety PIN for?",
            "a": "Each booking generates a 4-digit Safety PIN. Share it with your helper only after they arrive, to confirm you are handing over access to the verified person."
        },
        {
            "q": "How do I cancel or reschedule a booking?",
            "a": 'Until your helper accepts, you can tap "Cancel request" on the Requests tab. After that, use the in-app chat or call button to coordinate changes directly with your helper.'
        },
        {
            "q": "How does payment work?",
            "a": "Pricing is shown upfront on the booking screen, including a small trust fee. Extra parts are only added if you approve them. Once the job is done, you pay securely in the app with Razorpay (UPI, card or netbanking), and the bill is saved in Profile → Billing History."
        },
        {
            "q": "As a partner, how much do I earn from a job?",
            "a": "You set your own price. KOODAM keeps a {commission_percent}% commission on the job price, and every extra part you add is passed to you in full. The ₹{trust_fee} trust fee is paid by the customer, not you. Your share of each paid job joins your balance in Earnings → Payouts, and you withdraw it whenever you like."
        },
        {
            "q": "How do I rate a helper after service?",
            "a": 'Once your service is marked "Completed & Verified" on the Live Tracking screen, a rating card appears where you can give 1-5 stars and an optional comment.'
        },
        {
            "q": "How do I become a Service Partner?",
            "a": 'Go to your Profile and tap "Switch to Service Partner" to access the Partner Dashboard, where you can go online and start receiving nearby job requests.'
        },
        {
            "q": "Is my personal information safe?",
            "a": "Yes. We only share the details needed to complete a booking. See our Terms & Policy page for the full privacy policy."
        },
    ],
    "terms": [
        {
            "title": "Terms of Service",
            "points": [
                "KOODAM connects residents with verified local service partners for household help. We are a booking platform, not the employer of any service partner.",
                "Bookings, once confirmed, form a direct agreement between the member and the service partner. Pricing shown at booking time is final unless additional work is agreed upon on-site.",
                "The Safety PIN system exists to confirm identity at arrival. Do not share it before the helper physically arrives at your location.",
                "Ratings and reviews must reflect genuine experiences. Misuse of the rating system may result in account restrictions.",
            ],
        },
        {
            "title": "Privacy Policy",
            "points": [
                "We collect only the information needed to facilitate bookings: name, contact details, location and service history.",
                "Your phone number and address are shared with a service partner only after a booking is confirmed.",
                "We do not sell personal data to third parties. Data may be used internally to improve safety, matching and support.",
                "You may request an update or deletion of your profile data at any time from the Edit Profile screen.",
            ],
        },
        {
            "title": "Cancellations & Refunds",
            "points": [
                "Bookings may be cancelled before a service partner arrives via in-app chat or call.",
                "The trust fee is non-refundable once a service partner has been assigned to your request.",
                "Disputes over completed work can be raised through in-app chat with your service partner.",
            ],
        },
    ],
    "offline_steps": [
        {"icon": "translate", "title": "Call and choose your language", "desc": "Tamil, Kannada or English. Your phone number is your account."},
        {"icon": "handyman", "title": "Pick a service and enter your pincode", "desc": "Press the number for the service, then type your 6-digit area pincode."},
        {"icon": "verified_user", "title": "Hear the price and confirm", "desc": "We find the nearest serviceman. Note down the 4-digit safety code we read out."},
        {"icon": "call", "title": "The serviceman calls you", "desc": "They call for your address. Give them the safety code only when they reach your home."},
        {"icon": "build", "title": "Extra parts need your approval", "desc": "If they need a part, call the same number to approve or decline it."},
        {"icon": "payments", "title": "Pay cash after the work", "desc": "Pay the serviceman the total you heard. Call again to rate them or report a problem."},
    ],
    # value is stored on complaints (and pressed by phone callers, see
    # app/ivr/flow.py), so staff edit labels and add reasons but keep values
    "complaint_reasons": [
        {"value": "NO_SHOW", "label": "Partner didn't turn up"},
        {"value": "LATE", "label": "Partner was very late"},
        {"value": "POOR_WORK", "label": "Work was poor or unfinished"},
        {"value": "OVERCHARGED", "label": "Charged more than agreed"},
        {"value": "BEHAVIOUR", "label": "Rude or unsafe behaviour"},
        {"value": "OTHER", "label": "Something else"},
    ],
}

CACHE_SECONDS = 30

_cache = {"values": {}, "loaded_at": 0.0}
_lock = threading.Lock()


def seed_app_config(db: Session) -> None:
    """Write the defaults for any key not in the database yet."""
    existing = {key for (key,) in db.query(AppConfig.key).all()}
    defaults = {
        **{key: spec["default"] for key, spec in SETTINGS.items()},
        **CONTENT,
    }

    for key, value in defaults.items():
        if key not in existing:
            db.add(AppConfig(key=key, value=value, updated_by="default"))

    db.commit()


def _values() -> dict:
    with _lock:
        if time.time() - _cache["loaded_at"] < CACHE_SECONDS and _cache["values"]:
            return _cache["values"]

    with SessionLocal() as db:
        values = {row.key: row.value for row in db.query(AppConfig).all()}

    with _lock:
        _cache["values"] = values
        _cache["loaded_at"] = time.time()

    return values


def forget_cached_values() -> None:
    with _lock:
        _cache["loaded_at"] = 0.0


def setting(key: str) -> float:
    try:
        return float(_values().get(key, SETTINGS[key]["default"]))
    except Exception:
        # The database is unreachable: the defaults keep payments working
        return float(SETTINGS[key]["default"])


def content(key: str):
    try:
        return _values().get(key, CONTENT[key])
    except Exception:
        return CONTENT[key]


def save_value(db: Session, key: str, value, staff_email: str) -> None:
    row = db.get(AppConfig, key)

    if row is None:
        row = AppConfig(key=key)
        db.add(row)

    row.value = value
    row.updated_at = datetime.utcnow()
    row.updated_by = staff_email
    db.commit()
    forget_cached_values()
