"""
A stand-in for GigEzee AI that answers without calling Claude.

Turned on by GIGEZEE_FAKE_AI=1, and ignored whenever a real
ANTHROPIC_API_KEY is set. It exists so the camera flow can be tried on a
deployed backend before there is a funded API key: the photo makes the
whole round trip, the thinking screen shows, the answer routes to a tile
the member can really book, and the diagnosis is a real database row.

What it is not: analysis. The answer is fixed text that ignores the
photo, so it says "split air conditioner" whatever was photographed.
Every answer is marked [DEV FAKE] in summary_for_partner, which is the
field the partner sees, so a fake can never be mistaken for a real
triage - and so the rows are easy to find:

    DELETE FROM diagnoses WHERE result->>'summary_for_partner' LIKE '[DEV FAKE]%';

Keep the shape identical to app/ai_diagnosis.diagnose(): same arguments,
same keys as RESULT_SCHEMA, and empty fields already turned into None.
"""
import logging
import time
from typing import Optional

from app.ai_diagnosis import ALLOWED_IMAGE_TYPES, DiagnosisUnavailable

logger = logging.getLogger(__name__)


# The marker that tells a reader - and a cleanup query - that no AI was
# involved. app/fake_diagnosis.py's docstring has the DELETE.
FAKE_MARKER = "[DEV FAKE]"

# Long enough that the app's "thinking" state is visible, short enough
# that it isn't holding a worker for no reason
THINKING_SECONDS = 1.2

# Words in the member's note that should produce the hazard path, so the
# safety warning and the urgent badge can both be tested
SAFETY_WORDS = ("smoke", "burn", "spark", "shock", "gas", "smell", "fire")

# Note words that suggest an appliance tile, so the routing looks
# sensible rather than always landing on the first service
APPLIANCE_WORDS = ("ac", "cool", "fridge", "air", "appliance")


def _pick_service(service_titles: list, note: str) -> Optional[str]:
    """
    The real model is told to copy a title that is really bookable; this
    does the same, preferring an appliance tile when the note sounds
    like one. None when there are no services at all.
    """
    if any(word in note for word in APPLIANCE_WORDS):
        for title in service_titles:
            words = title.lower().split()

            if "ac" in words or "appliance" in title.lower():
                return title

    return service_titles[0] if service_titles else None


def diagnose(
    image_bytes: bytes,
    image_type: str,
    service_titles: list,
    member_note: Optional[str] = None,
    language: str = "en"
) -> dict:
    """
    Same contract as app.ai_diagnosis.diagnose, with a canned answer.

    `language` is accepted and ignored: the fake answers in English
    whatever the member reads, which is one more reason it is only a
    stand-in.
    """
    # Rejected the same way the real one does, so a bad upload still
    # fails here and not somewhere further in
    if image_type not in ALLOWED_IMAGE_TYPES:
        raise DiagnosisUnavailable("That image type isn't supported.")

    if not image_bytes:
        raise DiagnosisUnavailable("The photo is empty.")

    note = (member_note or "").lower()
    risky = any(word in note for word in SAFETY_WORDS)

    logger.warning(
        "GIGEZEE_FAKE_AI is on: returning a canned diagnosis for "
        "%s bytes of %s (note: %r, language: %s, %s bookable services). "
        "No photo was analysed and nothing was sent to Anthropic.",
        len(image_bytes), image_type, member_note or None,
        language, len(service_titles),
    )

    time.sleep(THINKING_SECONDS)

    return {
        "appliance": "Split air conditioner, indoor unit",
        "confidence": "medium",
        "photo_problem": None,
        "service_title": _pick_service(service_titles, note),
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
            "Switch it off at the wall and don't use it until a helper "
            "has looked at it."
            if risky else None
        ),
        "urgency": "urgent" if risky else "soon",
        "summary_for_partner": (
            f"{FAKE_MARKER} Canned answer - GIGEZEE_FAKE_AI is on, so no "
            "AI read this photo. Treat the causes above as placeholders. "
            f"Member said: {member_note or 'nothing'}"
        ),
    }
