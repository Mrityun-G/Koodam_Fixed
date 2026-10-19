"""
GigEzee AI: works out what is likely wrong from a photo.

A member who can't name the fault - often an older person who only knows
"the AC runs but the room stays warm" - photographs the appliance. Claude
reads the photo and what they said, and returns the handful of causes a
partner should check first, plus which service tile to book.

This is triage, not a verdict. The causes are things to check, the
partner confirms on arrival, and nothing here sets a price.
"""
import base64
import json
import logging
from typing import Optional

import anthropic

from app.config import ANTHROPIC_API_KEY

logger = logging.getLogger(__name__)


# Triage is a short, bounded answer; this is plenty and keeps the member
# from waiting
MAX_TOKENS = 2000

MODEL = "claude-opus-5-5"

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

# The member reads the answer in the language they set in the app. The
# member often speaks it rather than typing, so the note arrives in
# their language too.
LANGUAGE_NAMES = {
    "en": "English",
    "ta": "Tamil",
    "kn": "Kannada",
}


class DiagnosisUnavailable(Exception):
    """The AI couldn't be reached, or isn't configured."""


SYSTEM_PROMPT = """You are GigEzee AI, triaging household repair jobs in India.

Who you are helping: a member of the public photographing a broken
appliance or fitting in their home. Many are elderly and cannot name the
part or the fault. They describe what they observe ("it runs but doesn't
cool"), not what is wrong.

Your job is to turn that into the few things a visiting technician should
check first, and to say which service to book.

How to judge:
- Give the 2-4 most likely causes, most likely first. Not an exhaustive list.
- Each cause is something a technician CHECKS, not a confirmed fault.
- Write every cause in plain words an older person can read aloud over the
  phone. No part numbers, no jargon. "The cooling gas may have leaked
  out", not "refrigerant undercharge".
- Base it on what you can actually see plus what they told you. If the
  photo is too dark, too far away, or shows something else entirely, say
  so in `photo_problem` and keep confidence low.
- Never estimate a price or a repair time. GigEzee sets prices, not you.
- Never tell the member to open, dismantle or repair anything themselves.

Safety comes first. If you see or are told about anything that could hurt
someone - burning smell, smoke, scorched or melted wiring, sparks, exposed
live conductors, a gas smell, water sitting against an electrical fitting -
set `safety_warning` to a short, calm instruction naming the single thing
to do now (for example: "Switch this off at the mains and do not use it
until a helper has seen it."). Set urgency to "urgent". Otherwise leave
`safety_warning` as an empty string.

`service_title` must be copied exactly from the list of available
services given to you. Pick the one whose technician would do this work.
If nothing fits, use an empty string.

`questions_for_member` are up to 3 short questions whose answers would
most narrow this down - the things you would want to know but cannot see.
Leave the list empty if the photo and description already settle it.

`summary_for_partner` is one or two sentences for the technician who
takes the job, in trade language. They can see the photo themselves.

Language. You are told which language the member reads. Write
`appliance`, every `cause` and `why`, `questions_for_member`,
`photo_problem` and `safety_warning` in that language, in its own
script, as someone would actually speak it at home - not a stiff
translation. Keep the brand name GigEzee as it is. `summary_for_partner`
stays in English whatever the member's language, because it is trade
shorthand for the technician. The enum fields (`confidence`,
`likelihood`, `urgency`) stay exactly as the schema lists them."""


def _client() -> anthropic.Anthropic:
    if not ANTHROPIC_API_KEY:
        raise DiagnosisUnavailable(
            "AI diagnosis isn't set up yet. Please pick a service yourself."
        )

    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# The shape every diagnosis comes back in, so the app can rely on it
RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "appliance": {
            "type": "string",
            "description": "What the photo shows, in plain words, e.g. 'Split air conditioner indoor unit'."
        },
        "confidence": {
            "type": "string",
            "enum": ["high", "medium", "low"],
            "description": "How sure you are, given what the photo and description actually show."
        },
        "photo_problem": {
            "type": "string",
            "description": "If the photo is unusable (too dark, too far, wrong subject), what the member should photograph instead. Empty string if the photo is fine."
        },
        "service_title": {
            "type": "string",
            "description": "Exactly one title from the available services list, or an empty string if none fit."
        },
        "likely_causes": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {
                "type": "object",
                "properties": {
                    "cause": {
                        "type": "string",
                        "description": "The thing to check, in plain words an older person can read aloud."
                    },
                    "why": {
                        "type": "string",
                        "description": "One short sentence: what in the photo or description points to this."
                    },
                    "likelihood": {
                        "type": "string",
                        "enum": ["high", "medium", "low"]
                    }
                },
                "required": ["cause", "why", "likelihood"],
                "additionalProperties": False
            }
        },
        "questions_for_member": {
            "type": "array",
            "maxItems": 3,
            "items": {"type": "string"}
        },
        "safety_warning": {
            "type": "string",
            "description": "A calm one-line instruction if there is a hazard, else an empty string."
        },
        "urgency": {
            "type": "string",
            "enum": ["routine", "soon", "urgent"]
        },
        "summary_for_partner": {
            "type": "string",
            "description": "One or two sentences for the technician, in trade language."
        }
    },
    "required": [
        "appliance",
        "confidence",
        "photo_problem",
        "service_title",
        "likely_causes",
        "questions_for_member",
        "safety_warning",
        "urgency",
        "summary_for_partner"
    ],
    "additionalProperties": False
}


def diagnose(
    image_bytes: bytes,
    image_type: str,
    service_titles: list,
    member_note: Optional[str] = None,
    language: str = "en"
) -> dict:
    """
    Read the photo and return the triage result.

    `service_titles` are the bookable tiles, so the answer routes to one
    that actually exists. `member_note` is whatever the member typed or
    spoke, which is often the most useful part ("runs but doesn't
    cool"). `language` is the app language the member reads, so the
    answer comes back in it.
    """
    if image_type not in ALLOWED_IMAGE_TYPES:
        raise DiagnosisUnavailable("Please send a JPG, PNG or WEBP photo.")

    client = _client()

    said = (member_note or "").strip()

    language_name = LANGUAGE_NAMES.get(language, "English")

    prompt = [
        f"The member reads {language_name}. Write their part of the answer in it.",
        "",
        "Available services (copy one of these exactly into service_title):",
        "\n".join(f"- {title}" for title in service_titles),
        "",
        (
            f'What the member said is wrong (their own words, in {language_name}): "{said}"'
            if said
            else "The member did not describe the problem - go on the photo alone."
        ),
        "",
        "Triage this for the technician who will visit."
    ]

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": image_type,
                            "data": base64.standard_b64encode(
                                image_bytes
                            ).decode("utf-8")
                        }
                    },
                    {"type": "text", "text": "\n".join(prompt)}
                ]
            }],
            output_config={
                "format": {
                    "type": "json_schema",
                    "schema": RESULT_SCHEMA
                }
            }
        )
    except anthropic.APIStatusError as error:
        logger.error("AI diagnosis failed (%s): %s", error.status_code, error)
        raise DiagnosisUnavailable(
            "GigEzee AI is busy right now. Please pick a service yourself."
        )
    except anthropic.APIConnectionError as error:
        logger.error("AI diagnosis unreachable: %s", error)
        raise DiagnosisUnavailable(
            "Couldn't reach GigEzee AI. Please check your connection."
        )

    # A safety decline comes back as a normal 200, so check before reading
    if response.stop_reason == "refusal":
        logger.warning(
            "AI diagnosis declined: %s",
            getattr(response.stop_details, "category", None)
        )
        raise DiagnosisUnavailable(
            "GigEzee AI couldn't read this photo. Please pick a service yourself."
        )

    text = next(
        (block.text for block in response.content if block.type == "text"),
        None
    )

    if not text:
        raise DiagnosisUnavailable(
            "GigEzee AI didn't answer. Please pick a service yourself."
        )

    result = json.loads(text)

    # The schema uses "" for absent so it stays a plain-string schema;
    # the app wants null
    for field in ("photo_problem", "service_title", "safety_warning"):
        if not (result.get(field) or "").strip():
            result[field] = None

    # The model is told to copy a real title; drop anything else rather
    # than route the member to a service that isn't there
    if result.get("service_title") not in service_titles:
        result["service_title"] = None

    return result
