import base64
import hashlib
import hmac
from typing import Optional
from xml.sax.saxutils import escape, quoteattr

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import IVR_PUBLIC_URL, TWILIO_AUTH_TOKEN
from app.database import get_db
from app.ivr.flow import Reply, handle_call
from app.models.user import User
from app.routers.escalations import require_admin


# =========================================================
# PHONE BOOKING WEBHOOKS
# The phone provider calls these as the customer presses keys. The menu
# itself is in app/ivr/flow.py; each provider just needs a small adapter
# that turns its request into handle_call() and the Reply into its format.
# =========================================================

router = APIRouter(prefix="/ivr", tags=["Phone booking"])


# ---------------------------------------------------------
# Simulator: KOODAM staff can walk through the menu from the admin
# screen before a phone number is connected. Admin only, because the
# caller's number decides whose bookings the menu acts on.
# ---------------------------------------------------------

class SimulatedKeys(BaseModel):
    call_id: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=10, max_length=20)
    digits: Optional[str] = Field(default=None, max_length=10)


@router.post("/simulate")
def simulate_call(
    data: SimulatedKeys,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    reply = handle_call(db, f"sim-{data.call_id}", data.phone, data.digits)

    return {
        "parts": [{"lang": lang, "text": text} for lang, text in reply.parts],
        "digits": reply.digits,
        "hangup": reply.hangup,
    }


# ---------------------------------------------------------
# Twilio (TwiML). Point the number's "A call comes in" webhook at
# POST {KOODAM_IVR_PUBLIC_URL}/ivr/twilio
# ---------------------------------------------------------

TWILIO_VOICES = {
    "ta": ("ta-IN", "Google.ta-IN-Standard-A"),
    "kn": ("kn-IN", "Google.kn-IN-Standard-A"),
    "en": ("en-IN", "Google.en-IN-Standard-A"),
}


def twilio_signature_ok(url: str, params: dict, signature: str) -> bool:
    payload = url + "".join(f"{key}{params[key]}" for key in sorted(params))
    digest = hmac.new(
        TWILIO_AUTH_TOKEN.encode(), payload.encode(), hashlib.sha1
    ).digest()

    return hmac.compare_digest(base64.b64encode(digest).decode(), signature or "")


def to_twiml(reply: Reply, action: str) -> str:
    speech = "".join(
        f"<Say language={quoteattr(TWILIO_VOICES[lang][0])} "
        f"voice={quoteattr(TWILIO_VOICES[lang][1])}>{escape(text)}</Say>"
        for lang, text in reply.parts
    )

    if reply.hangup or not reply.digits:
        return f"<Response>{speech}<Hangup/></Response>"

    # No key pressed: the Redirect comes back without Digits, which the
    # menu treats as silence
    return (
        "<Response>"
        f'<Gather input="dtmf" numDigits="{reply.digits}" timeout="8" '
        f"action={quoteattr(action)} method=\"POST\">{speech}</Gather>"
        f"<Redirect method=\"POST\">{escape(action)}</Redirect>"
        "</Response>"
    )


@router.post("/twilio")
async def twilio_call(request: Request, db: Session = Depends(get_db)):
    if not TWILIO_AUTH_TOKEN or not IVR_PUBLIC_URL:
        raise HTTPException(status_code=503, detail="Phone booking isn't set up")

    params = {key: value for key, value in (await request.form()).items()}
    query = f"?{request.url.query}" if request.url.query else ""
    url = f"{IVR_PUBLIC_URL}{request.url.path}{query}"

    # The caller's number decides whose bookings this call can change,
    # so only Twilio may call this
    if not twilio_signature_ok(url, params, request.headers.get("X-Twilio-Signature")):
        raise HTTPException(status_code=403, detail="Invalid signature")

    reply = handle_call(
        db,
        params.get("CallSid", ""),
        params.get("From", ""),
        params.get("Digits")
    )

    return Response(
        content=to_twiml(reply, request.url.path),
        media_type="application/xml"
    )
