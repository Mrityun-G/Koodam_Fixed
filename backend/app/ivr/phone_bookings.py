import logging
import math
import random
import re
import time
from datetime import datetime, timedelta
from typing import Optional

import requests
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import COMPLAINT_RESPONSE_HOURS, TRUST_FEE
from app.escalations import can_take_bookings
from app.firebase_rtdb import rtdb, to_db_key
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail
from app.models.escalation import Complaint
from app.models.partner import Partner
from app.models.partner_service import PartnerService
from app.models.service import Service
from app.models.user import User
from app.routers.booking_sync import BookingSync, apply_sync


# =========================================================
# PHONE BOOKINGS
# What the phone menu does: find the caller's account, pick the nearest
# available partner, and create the same Firebase booking request and
# order the app creates, so the partner sees it in their usual portal.
# Phone bookings are paid in cash and use a fixed arrival code (the
# customer has no screen to show a rotating one).
# =========================================================

logger = logging.getLogger(__name__)

PHONE_SOURCE = "PHONE"
CASH = "CASH"

# Same as the app: the partner has this long to accept
REQUEST_EXPIRY_SECONDS = 105

# After this, a finished booking no longer comes up when they call
RECENT_BOOKING_DAYS = 7


class ChangeRejected(Exception):
    """Raised inside a Firebase transaction to leave the order unchanged."""


# ---------------------------------------------------------
# Callers
# ---------------------------------------------------------

def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """+91 and the last 10 digits, or None if it isn't an Indian mobile."""
    digits = re.sub(r"\D", "", raw or "")

    if len(digits) < 10:
        return None

    return f"+91{digits[-10:]}"


def get_or_create_phone_customer(db: Session, phone: str) -> User:
    last10 = phone[-10:]

    # Someone who also uses the app keeps one account
    existing = (
        db.query(User)
        .filter(
            func.right(func.regexp_replace(User.phone, r"\D", "", "g"), 10)
            == last10
        )
        .order_by(User.created_at.asc())
        .first()
    )

    if existing:
        return existing

    user = User(
        firebase_uid=f"phone:{phone}",
        name=f"Phone customer {last10[-4:]}",
        # Placeholder: the .invalid domain can never receive mail
        email=f"{last10}@phone.koodam.invalid",
        phone=phone,
        role="MEMBER"
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


# ---------------------------------------------------------
# Services and partners
# ---------------------------------------------------------

def phone_services(db: Session) -> list:
    # One keypad digit each, so at most nine
    return (
        db.query(Service)
        .filter(Service.is_active == True)
        .order_by(Service.title.asc())
        .limit(9)
        .all()
    )


_pincode_cache: dict = {}


def locate_pincode(pincode: str) -> Optional[tuple]:
    """(latitude, longitude) of an Indian pincode, from OpenStreetMap."""
    if not re.fullmatch(r"[1-9]\d{5}", pincode or ""):
        return None

    if pincode in _pincode_cache:
        return _pincode_cache[pincode]

    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "postalcode": pincode,
                "country": "India",
                "format": "json",
                "limit": 1
            },
            headers={"User-Agent": "KOODAM phone booking"},
            timeout=8
        )
        response.raise_for_status()
        results = response.json()
    except (requests.RequestException, ValueError):
        logger.warning("Pincode lookup failed for %s", pincode)
        return None

    if not results:
        return None

    coords = (float(results[0]["lat"]), float(results[0]["lon"]))
    _pincode_cache[pincode] = coords

    return coords


def distance_km(lat1, lng1, lat2, lng2) -> float:
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return radius * 2 * math.asin(math.sqrt(a))


def nearest_partner(
    db: Session,
    service: Service,
    lat: float,
    lng: float,
    exclude_ids: tuple = ()
) -> Optional[dict]:
    """The closest online partner offering this service who covers the area."""
    rows = (
        db.query(Partner, User)
        .join(PartnerService, PartnerService.partner_id == Partner.id)
        .join(User, User.id == Partner.user_id)
        .filter(
            PartnerService.service_id == service.id,
            PartnerService.is_active == True,
            Partner.is_online == True,
            Partner.latitude.isnot(None),
            Partner.longitude.isnot(None)
        )
        .all()
    )

    candidates = []

    for partner, user in rows:
        if str(partner.id) in exclude_ids or not can_take_bookings(partner):
            continue

        km = distance_km(lat, lng, partner.latitude, partner.longitude)

        if km <= (partner.service_radius_km or 5):
            candidates.append((km, -(partner.reliability_score or 0), partner, user))

    if not candidates:
        return None

    km, _, partner, user = min(candidates, key=lambda row: row[:2])

    return {"partner": partner, "user": user, "km": round(km, 1)}


_nearby_pincode_cache: dict = {}


def pincode_near(lat: float, lng: float) -> Optional[str]:
    key = (round(lat, 3), round(lng, 3))

    if key in _nearby_pincode_cache:
        return _nearby_pincode_cache[key]

    try:
        response = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json", "zoom": 18},
            headers={"User-Agent": "KOODAM phone booking"},
            timeout=8
        )
        response.raise_for_status()
        pincode = (response.json().get("address") or {}).get("postcode")
    except (requests.RequestException, ValueError):
        return None

    _nearby_pincode_cache[key] = pincode
    return pincode


def explain_no_partner(db: Session, service: Service, lat: float, lng: float) -> str:
    """
    Why nobody matched, for KOODAM staff testing in the simulator.
    Never read out on a real call.
    """
    rows = (
        db.query(Partner, User)
        .join(PartnerService, PartnerService.partner_id == Partner.id)
        .join(User, User.id == Partner.user_id)
        .filter(
            PartnerService.service_id == service.id,
            PartnerService.is_active == True
        )
        .all()
    )

    if not rows:
        return f"No partner offers {service.title}."

    reasons = []

    for partner, user in rows:
        if not partner.is_online:
            reason = "offline"
        elif not can_take_bookings(partner):
            reason = "suspended or deactivated"
        elif partner.latitude is None or partner.longitude is None:
            reason = "no location saved (go Offline and Online again with location allowed)"
        else:
            km = distance_km(lat, lng, partner.latitude, partner.longitude)
            reason = f"{km:.1f} km from this pincode, travels up to {partner.service_radius_km or 5} km"
            nearby = pincode_near(partner.latitude, partner.longitude)

            if nearby:
                reason += f"; try pincode {nearby}"

        reasons.append(f"{user.name}: {reason}")

    return "; ".join(reasons)


# ---------------------------------------------------------
# Creating a booking
# ---------------------------------------------------------

def _arrival_code() -> str:
    return str(random.SystemRandom().randint(1000, 9999))


def create_phone_booking(
    db: Session,
    customer: User,
    service: Service,
    match: dict,
    pincode: str,
    coords: tuple
) -> dict:
    partner, partner_user = match["partner"], match["user"]
    partner_id = str(partner.id)

    price = float(service.price or 0)
    total = price + TRUST_FEE
    now_ms = int(time.time() * 1000)
    area = f"PIN {pincode} (phone booking: call the customer for the address)"
    customer_name = customer.name or "Phone customer"

    request_ref = rtdb(f"bookingRequests/{partner_id}").push()
    order_id = request_ref.key

    # The same fields the app writes in handleConfirmBooking
    request_ref.set({
        "status": "PENDING",
        "bookingStatus": "PENDING",
        "paymentStatus": "PENDING",
        "orderId": order_id,
        "partnerId": partner_id,
        "customerId": str(customer.id),
        "customerFirebaseUid": None,
        "customerName": customer_name,
        "customerEmail": "",
        "customerPhone": customer.phone or "",
        "customerAvatar": "",
        "customerRating": 5,
        "serviceId": str(service.id),
        "serviceTitle": service.title,
        "category": service.tag or "Home Services",
        "payout": total,
        "distance": f"{match['km']} km",
        "etaMins": 7,
        "area": area,
        "scheduledAt": now_ms,
        "scheduledLabel": "Now (phone booking)",
        "createdAt": now_ms,
        "expiresIn": REQUEST_EXPIRY_SECONDS,
        "source": PHONE_SOURCE,
        "paymentMethod": CASH
    })

    order = {
        "orderId": order_id,
        "requestId": order_id,
        "partnerId": partner_id,
        "customerId": str(customer.id),
        "customerName": customer_name,
        "customerAvatar": "",
        "customerPhone": customer.phone or "",
        "helperName": partner_user.name,
        "helperAvatar": partner_user.avatar or "",
        "helperRating": float(partner.rating or 0),
        "helperPhone": partner_user.phone or "",
        "helperVehicle": partner.vehicle or "",
        "helperVehicleNumber": partner.vehicle_number or "",
        "helperVerified": partner.police_verification_status == "VERIFIED",
        "serviceTitle": service.title,
        "serviceId": str(service.id),
        "category": service.tag or "Home Services",
        "totalAmount": total,
        "baseAmount": total,
        "servicePrice": price,
        "trustFee": TRUST_FEE,
        "totalPaid": 0,
        "paymentStatus": "PENDING",
        "bookingStatus": "PENDING",
        "status": "PENDING",
        "serviceStatus": "pending",
        "currentStep": 1,
        # Fixed for the whole job: read out on the call, never rotated
        "safetyPin": _arrival_code(),
        "completionOtp": None,
        "etaMinutes": 12,
        "area": area,
        "customerLat": coords[0],
        "customerLng": coords[1],
        "scheduledAt": now_ms,
        "scheduledLabel": "Now (phone booking)",
        "createdAt": now_ms,
        "source": PHONE_SOURCE,
        "paymentMethod": CASH,
        "phonePincode": pincode
    }

    rtdb(f"orders/{to_db_key(order_id)}").set(order)

    # Keep the permanent record, as the app's sync would
    booking = apply_sync(db, BookingSync(
        firebase_order_id=order_id,
        customer_id=str(customer.id),
        partner_id=partner_id,
        service_id=str(service.id),
        booking_status="PENDING",
        current_step=1,
        address=area,
        latitude=coords[0],
        longitude=coords[1],
        total_amount=total,
        payment_status="PENDING",
        scheduled_at=now_ms,
        created_at=now_ms
    ))

    detail = db.get(BookingDetail, booking.id)
    detail.source = PHONE_SOURCE
    detail.payment_method = CASH
    db.commit()

    return order


# ---------------------------------------------------------
# The caller's current booking
# ---------------------------------------------------------

def latest_phone_order(db: Session, customer: User) -> Optional[dict]:
    """The caller's most recent booking that still needs their attention."""
    row = (
        db.query(Booking, BookingDetail)
        .join(BookingDetail, BookingDetail.booking_id == Booking.id)
        .filter(Booking.user_id == customer.id)
        .order_by(Booking.booking_time.desc())
        .first()
    )

    if not row:
        return None

    booking, detail = row
    order = rtdb(f"orders/{to_db_key(detail.firebase_order_id)}").get()

    if not order:
        return None

    order = expire_if_unanswered(order)
    status = order.get("bookingStatus")

    if status in ("WITHDRAWN", "CANCELLED"):
        return None

    # A paid and rated job is finished; so is anything old
    finished = order.get("paymentStatus") == "PAID" and order.get("rating")
    old = booking.booking_time < datetime.utcnow() - timedelta(days=RECENT_BOOKING_DAYS)

    if finished or (old and status != "ACCEPTED"):
        return None

    return {**order, "_booking_id": booking.id}


def expire_if_unanswered(order: dict) -> dict:
    """Close a request the partner never answered (normally their app does)."""
    if order.get("bookingStatus") != "PENDING":
        return order

    created = int(order.get("createdAt") or 0)

    if created and time.time() * 1000 < created + REQUEST_EXPIRY_SECONDS * 1000:
        return order

    closed = {"status": "EXPIRED", "bookingStatus": "EXPIRED", "expiredAt": int(time.time() * 1000)}
    order_id = order["orderId"]

    rtdb(f"orders/{to_db_key(order_id)}").update(closed)
    rtdb(f"bookingRequests/{order['partnerId']}/{order_id}").update(closed)

    return {**order, **closed}


def cancel_request(order: dict) -> bool:
    order_id = order["orderId"]

    def withdraw(current):
        if not current or current.get("bookingStatus") != "PENDING":
            raise ChangeRejected()

        current.update({"status": "WITHDRAWN", "bookingStatus": "WITHDRAWN", "withdrawnAt": int(time.time() * 1000)})
        return current

    try:
        rtdb(f"orders/{to_db_key(order_id)}").transaction(withdraw)
    except ChangeRejected:
        return False

    rtdb(f"bookingRequests/{order['partnerId']}/{order_id}").update({
        "status": "WITHDRAWN",
        "bookingStatus": "WITHDRAWN",
        "withdrawnAt": int(time.time() * 1000)
    })

    return True


def pending_extra_charges(order: dict) -> list:
    return sorted(
        (
            (charge_id, charge)
            for charge_id, charge in (order.get("extraCharges") or {}).items()
            if charge and charge.get("status") == "PENDING"
        ),
        key=lambda pair: pair[1].get("createdAt") or 0
    )


def _approved_total(charges: dict) -> float:
    return sum(
        float(charge.get("amount") or 0)
        for charge in (charges or {}).values()
        if charge and charge.get("status") == "APPROVED"
    )


def answer_extra_charge(order_id: str, charge_id: str, approve: bool) -> Optional[float]:
    """Same rule as the app: total = booked amount + approved parts. Returns the new total."""
    def respond(current):
        charge = (current or {}).get("extraCharges", {}).get(charge_id)

        if not charge or charge.get("status") != "PENDING" or current.get("paymentStatus") == "PAID":
            raise ChangeRejected()

        base = (
            float(current["baseAmount"])
            if current.get("baseAmount") is not None
            else float(current.get("totalAmount") or 0) - _approved_total(current.get("extraCharges"))
        )

        charge["status"] = "APPROVED" if approve else "DECLINED"
        charge["respondedAt"] = int(time.time() * 1000)
        current["baseAmount"] = base
        current["totalAmount"] = base + _approved_total(current["extraCharges"])

        return current

    try:
        updated = rtdb(f"orders/{to_db_key(order_id)}").transaction(respond)
    except ChangeRejected:
        return None

    return float(updated.get("totalAmount") or 0)


def save_rating(order: dict, stars: int):
    now_ms = int(time.time() * 1000)

    rtdb(f"orders/{to_db_key(order['orderId'])}").update({"rating": stars, "feedback": ""})
    # The partner's app builds their reviews from the booking request
    rtdb(f"bookingRequests/{order['partnerId']}/{order.get('requestId') or order['orderId']}").update({
        "rating": stars,
        "feedback": "",
        "ratedAt": now_ms
    })


def file_complaint(db: Session, booking_id, customer: User, reason: str) -> bool:
    """False if this job already has a complaint."""
    booking = db.get(Booking, booking_id)

    if not booking or db.query(Complaint).filter(Complaint.booking_id == booking.id).first():
        return False

    now = datetime.utcnow()

    db.add(Complaint(
        booking_id=booking.id,
        partner_id=booking.partner_id,
        customer_id=customer.id,
        reason=reason,
        description="Reported by phone",
        created_at=now,
        respond_by=now + timedelta(hours=COMPLAINT_RESPONSE_HOURS)
    ))
    db.commit()

    return True
