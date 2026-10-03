import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app.config import TRUST_FEE
from app.firebase_rtdb import FirebaseUnavailable, rtdb, to_db_key
from app.ivr import phone_bookings as pb
from app.ivr.prompts import CHOOSE_LANGUAGE, LANGUAGES, rupees, say, spell_digits
from app.models.booking_detail import BookingDetail
from app.models.service import Service


# =========================================================
# PHONE MENU
# One call is a series of steps: the provider plays what we say,
# collects the keys pressed and sends them back. handle_call() takes
# those keys and returns what to say next. It knows nothing about the
# provider; app/routers/ivr.py turns a Reply into the provider's format.
# =========================================================

logger = logging.getLogger(__name__)

# Complaint reasons by key, matching REASONS in routers/escalations.py
COMPLAINT_KEYS = {
    "1": "NO_SHOW",
    "2": "LATE",
    "3": "POOR_WORK",
    "4": "OVERCHARGED",
    "5": "BEHAVIOUR",
}

# Silence this many times in a row and the call ends
MAX_MISSES = 2

SESSION_TTL_SECONDS = 30 * 60


@dataclass
class Reply:
    # What to say, as (language, text) parts
    parts: list
    # How many keys to collect next; 0 means nothing is expected
    digits: int = 0
    hangup: bool = False


@dataclass
class Session_:
    caller: str
    state: str = "LANG"
    lang: str = "en"
    data: dict = field(default_factory=dict)
    # Keys offered on the status menu -> what they do
    options: dict = field(default_factory=dict)
    last: Optional[Reply] = None
    misses: int = 0
    touched: float = field(default_factory=time.time)


_sessions: dict = {}
_lock = threading.Lock()


def _session(call_id: str, caller: str) -> Session_:
    now = time.time()

    with _lock:
        for key in [k for k, s in _sessions.items() if now - s.touched > SESSION_TTL_SECONDS]:
            del _sessions[key]

        session = _sessions.get(call_id)

        if not session or session.caller != caller:
            session = _sessions[call_id] = Session_(caller=caller)

        session.touched = now
        return session


def _end(call_id: str):
    with _lock:
        _sessions.pop(call_id, None)


# ---------------------------------------------------------
# Entry point
# ---------------------------------------------------------

def handle_call(db: Session, call_id: str, caller_raw: str, digits: Optional[str]) -> Reply:
    caller = pb.normalize_phone(caller_raw)

    if not caller:
        # Hidden or foreign numbers can't be matched to an account
        return Reply([("en", say("unavailable", "en"))], hangup=True)

    session = _session(call_id, caller)
    digits = (digits or "").strip().rstrip("#")

    try:
        if session.last is None:
            reply = Reply(list(CHOOSE_LANGUAGE), digits=1)
            session.state = "LANG"
        elif not digits:
            session.misses += 1
            reply = (
                _say(session, "goodbye", hangup=True)
                if session.misses >= MAX_MISSES
                else session.last
            )
        else:
            session.misses = 0
            reply = _step(db, session, digits)
    except FirebaseUnavailable:
        logger.error("Phone booking needs FIREBASE_SERVICE_ACCOUNT")
        reply = _say(session, "unavailable", hangup=True)
    except Exception:
        logger.exception("Phone menu failed for call %s", call_id)
        db.rollback()
        reply = _say(session, "unavailable", hangup=True)

    if reply.hangup:
        _end(call_id)
    else:
        session.last = reply

    return reply


def _say(session: Session_, key: str, digits: int = 0, hangup: bool = False, **values) -> Reply:
    return Reply([(session.lang, say(key, session.lang, **values))], digits=digits, hangup=hangup)


def _join(session: Session_, *texts: str, digits: int = 0, hangup: bool = False) -> Reply:
    return Reply([(session.lang, " ".join(t for t in texts if t))], digits=digits, hangup=hangup)


def _invalid_then_repeat(session: Session_) -> Reply:
    repeat = session.last or Reply([], digits=1)
    return Reply(
        [(session.lang, say("invalid", session.lang)), *repeat.parts],
        digits=repeat.digits
    )


# ---------------------------------------------------------
# Steps
# ---------------------------------------------------------

def _step(db: Session, session: Session_, digits: str) -> Reply:
    state = session.state

    if state == "LANG":
        if digits not in ("1", "2", "3"):
            return _invalid_then_repeat(session)

        session.lang = LANGUAGES[int(digits) - 1]
        return _home(db, session, greet=True)

    if state == "SERVICE":
        services = session.data.get("services", [])

        if not digits.isdigit() or not 1 <= int(digits) <= len(services):
            return _invalid_then_repeat(session)

        session.data["service_id"] = services[int(digits) - 1]
        session.data["excluded"] = []
        session.state = "PINCODE"
        return _say(session, "ask_pincode", digits=6)

    if state == "PINCODE":
        coords = pb.locate_pincode(digits)

        if not coords:
            return _join(
                session,
                say("bad_pincode", session.lang),
                say("ask_pincode", session.lang),
                digits=6
            )

        session.data["pincode"] = digits
        session.data["coords"] = coords
        return _offer(db, session)

    if state == "CONFIRM":
        if digits == "2":
            return _join(
                session,
                say("cancelled", session.lang),
                say("goodbye", session.lang),
                hangup=True
            )

        if digits != "1":
            return _invalid_then_repeat(session)

        return _book(db, session)

    if state == "EXTRA":
        if digits not in ("1", "2"):
            return _invalid_then_repeat(session)

        approve = digits == "1"
        total = pb.answer_extra_charge(session.data["order_id"], session.data["charge_id"], approve)
        # None: it was already answered (e.g. by another call)
        if total is None:
            heard = ""
        elif approve:
            heard = say("extra_approved", session.lang, total=rupees(total))
        else:
            heard = say("extra_declined", session.lang)
        return _status(db, session, _load_order(session.data["order_id"]), lead=heard)

    if state == "RATE":
        if digits not in ("1", "2", "3", "4", "5"):
            return _invalid_then_repeat(session)

        pb.save_rating(_load_order(session.data["order_id"]), int(digits))
        session.state = "STATUS"
        session.options = {"8": "complaint", "0": "new"}
        return _join(
            session,
            say("rated", session.lang),
            say("menu_complaint", session.lang),
            say("menu_new_booking", session.lang),
            digits=1
        )

    if state == "COMPLAINT":
        reason = COMPLAINT_KEYS.get(digits)

        if not reason:
            return _invalid_then_repeat(session)

        customer = pb.get_or_create_phone_customer(db, session.caller)
        saved = pb.file_complaint(db, session.data["booking_id"], customer, reason)

        return _join(
            session,
            say("complaint_saved" if saved else "complaint_exists", session.lang),
            say("goodbye", session.lang),
            hangup=True
        )

    if state == "STATUS":
        action = session.options.get(digits)

        if not action:
            return _invalid_then_repeat(session)

        return _status_action(db, session, action)

    return _home(db, session)


def _home(db: Session, session: Session_, greet: bool = False) -> Reply:
    customer = pb.get_or_create_phone_customer(db, session.caller)
    order = pb.latest_phone_order(db, customer)
    lead = say("welcome", session.lang) if greet else ""

    if order:
        return _status(db, session, order, lead=lead)

    return _service_menu(db, session, lead=lead)


def _service_menu(db: Session, session: Session_, lead: str = "") -> Reply:
    services = pb.phone_services(db)

    if not services:
        return _join(session, lead, say("no_services", session.lang), say("goodbye", session.lang), hangup=True)

    session.state = "SERVICE"
    session.data["services"] = [str(service.id) for service in services]

    options = [
        say("service_option", session.lang, service=service.title, digit=index)
        for index, service in enumerate(services, start=1)
    ]

    return _join(session, lead, *options, digits=1)


def _offer(db: Session, session: Session_) -> Reply:
    service = db.get(Service, session.data["service_id"])
    lat, lng = session.data["coords"]
    match = pb.nearest_partner(db, service, lat, lng, tuple(session.data.get("excluded", [])))

    if not match:
        return _join(session, say("no_partner", session.lang), say("goodbye", session.lang), hangup=True)

    session.data["partner_id"] = str(match["partner"].id)
    session.state = "CONFIRM"
    price = float(service.price or 0)

    return _say(
        session, "offer", digits=1,
        partner=match["user"].name,
        km=match["km"],
        service=service.title,
        price=rupees(price),
        fee=rupees(TRUST_FEE),
        total=rupees(price + TRUST_FEE)
    )


def _book(db: Session, session: Session_) -> Reply:
    service = db.get(Service, session.data["service_id"])
    lat, lng = session.data["coords"]
    excluded = tuple(session.data.get("excluded", []))

    # Look again: the partner may have gone offline while the customer listened
    match = pb.nearest_partner(db, service, lat, lng, excluded)

    if not match:
        return _join(session, say("no_partner", session.lang), say("goodbye", session.lang), hangup=True)

    customer = pb.get_or_create_phone_customer(db, session.caller)
    order = pb.create_phone_booking(db, customer, service, match, session.data["pincode"], (lat, lng))

    session.data["order_id"] = order["orderId"]
    session.state = "STATUS"
    session.options = {"1": "refresh", "9": "cancel"}

    return _join(
        session,
        say("booked", session.lang, partner=match["user"].name, code=spell_digits(order["safetyPin"])),
        say("menu_check_again", session.lang),
        say("menu_cancel_request", session.lang),
        digits=1
    )


def _load_order(order_id: str) -> dict:
    order = rtdb(f"orders/{to_db_key(order_id)}").get() or {}
    return pb.expire_if_unanswered(order) if order else order


def _status(db: Session, session: Session_, order: dict, lead: str = "") -> Reply:
    """Read out where the booking is and offer what can be done next."""
    session.data["order_id"] = order["orderId"]
    session.state = "STATUS"

    lang = session.lang
    status = order.get("bookingStatus")
    step = int(order.get("currentStep") or 0)
    names = {
        "partner": order.get("helperName") or "the serviceman",
        "service": order.get("serviceTitle") or "service",
    }

    if status == "PENDING":
        session.options = {"1": "refresh", "9": "cancel"}
        texts = [
            say("status_pending", lang, **names),
            say("menu_check_again", lang),
            say("menu_cancel_request", lang),
        ]
    elif status in ("DECLINED", "EXPIRED"):
        session.options = {"1": "retry", "0": "new"}
        texts = [
            say("status_not_accepted", lang, **names),
            say("menu_retry", lang),
            say("menu_new_booking", lang),
        ]
    elif step < 4 and status == "ACCEPTED":
        session.options = {"1": "refresh", "8": "complaint"}
        texts = [
            say("status_on_way", lang, **names, code=spell_digits(order.get("safetyPin"))),
            say("menu_repeat", lang),
            say("menu_complaint", lang),
        ]
    elif order.get("paymentStatus") != "PAID":
        pending = pb.pending_extra_charges(order)

        if pending:
            charge_id, charge = pending[0]
            session.state = "EXTRA"
            session.data["charge_id"] = charge_id
            return _join(
                session, lead,
                say("extra_charge", lang, partner=names["partner"], item=charge.get("item"), amount=rupees(charge.get("amount"))),
                digits=1
            )

        session.options = {"1": "refresh", "8": "complaint"}
        texts = [
            say("status_working", lang, **names, total=rupees(order.get("totalAmount"))),
            say("menu_repeat", lang),
            say("menu_complaint", lang),
        ]
    elif not order.get("rating"):
        session.state = "RATE"
        texts = [
            say("status_done", lang, **names, total=rupees(order.get("totalPaid") or order.get("totalAmount"))),
            say("ask_rating", lang),
        ]
    else:
        session.options = {"8": "complaint", "0": "new"}
        texts = [
            say("status_done", lang, **names, total=rupees(order.get("totalPaid") or order.get("totalAmount"))),
            say("menu_complaint", lang),
            say("menu_new_booking", lang),
        ]

    return _join(session, lead, *texts, digits=1)


def _status_action(db: Session, session: Session_, action: str) -> Reply:
    order = _load_order(session.data["order_id"])

    if action == "refresh":
        return _status(db, session, order)

    if action == "cancel":
        cancelled = pb.cancel_request(order)

        if cancelled:
            return _join(session, say("request_cancelled", session.lang), say("goodbye", session.lang), hangup=True)

        # The partner accepted in the meantime
        return _status(db, session, _load_order(session.data["order_id"]))

    if action == "retry":
        session.data["service_id"] = order.get("serviceId")
        session.data["pincode"] = order.get("phonePincode")
        session.data["coords"] = (order.get("customerLat"), order.get("customerLng"))
        session.data["excluded"] = [
            *session.data.get("excluded", []),
            order.get("partnerId")
        ]
        return _offer(db, session)

    if action == "complaint":
        detail = (
            db.query(BookingDetail)
            .filter(BookingDetail.firebase_order_id == order["orderId"])
            .first()
        )

        if not detail:
            return _invalid_then_repeat(session)

        session.data["booking_id"] = detail.booking_id
        session.state = "COMPLAINT"
        return _say(session, "complaint_reasons", digits=1)

    return _service_menu(db, session)
