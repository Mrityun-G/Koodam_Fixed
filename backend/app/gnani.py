"""
Speech to text through Gnani (api.vachana.ai).

Used as the fallback for devices where the browser cannot listen. Android
WebView has no SpeechRecognition, so inside the packaged app the mic is
dead: the member records a clip instead, it comes here, and the
transcript goes back. Where the browser *can* listen it still does, free
and with live interim words, so this only costs credits where there was
no other option.

The key never leaves the server. A VITE_ variable would be compiled into
the JS bundle and the APK for anyone to read.

Measured 2026-10-21: a 7-second clip came back in 0.15-0.34s.
"""

import logging
import unicodedata
from typing import Optional

import requests

from app.config import GNANI_API_KEY

logger = logging.getLogger("gigezee.gnani")

STT_URL = "https://api.vachana.ai/stt/v3"

# The app's three languages, as BCP-47 codes Gnani accepts. Tamil and
# Kannada come back in their own scripts, which is what voiceIntent.js
# matches on. en-IN also covers English mixed with Hindi.
LANGUAGE_CODES = {
    "en": "en-IN",
    "ta": "ta-IN",
    "kn": "kn-IN",
}

# The endpoint takes 60s at the outside and is happiest under 30s. The
# recorder is capped well below this; anything longer is rejected here
# rather than spending a request to be told so.
MAX_SECONDS = 30
MAX_BYTES = 10 * 1024 * 1024

ACCEPTED_TYPES = {
    "audio/wav", "audio/wave", "audio/x-wav",
    "audio/mpeg", "audio/mp3",
    "audio/ogg", "audio/webm",
    "audio/flac", "audio/aac", "audio/mp4", "audio/x-m4a",
}

# bias_list entries must be single words of letters only
MAX_BIAS_WORDS = 40


class SpeechUnavailable(RuntimeError):
    """Transcription couldn't be done; the message is safe to show."""


def is_configured() -> bool:
    return bool(GNANI_API_KEY)


def _is_word(token: str) -> bool:
    """
    A single word of letters, in any script.

    str.isalpha() is too strict here: Tamil and Kannada words carry
    combining marks (the Tamil pulli in குழாய், the Kannada vowel signs in
    ಪೈಪ್), which are category Mn, not letters. Testing with isalpha()
    threw away every Indic boost word - exactly the languages this is
    for - so letters and the marks that attach to them both count.
    """
    if not token or any(ch.isspace() for ch in token):
        return False

    return all(
        unicodedata.category(ch).startswith(("L", "M"))
        for ch in token
    )


def clean_bias(words) -> list:
    """
    Keep only what the API accepts: single words, letters only. The app
    sends the keywords voiceIntent.js already matches on, so boosting
    stays in step with matching without a second copy of the list here.
    """
    cleaned = []

    for word in words or []:
        token = str(word).strip()

        if not _is_word(token):
            continue

        if token.lower() not in {w.lower() for w in cleaned}:
            cleaned.append(token)

        if len(cleaned) >= MAX_BIAS_WORDS:
            break

    return cleaned


def transcribe(
    audio: bytes,
    content_type: Optional[str],
    language: str = "en",
    bias: Optional[list] = None,
    filename: str = "speech.webm"
) -> str:
    """The words in `audio`, or a SpeechUnavailable with why not."""
    if not is_configured():
        raise SpeechUnavailable(
            "Voice input isn't set up on the server yet."
        )

    if not audio:
        raise SpeechUnavailable("No audio was recorded. Please try again.")

    if len(audio) > MAX_BYTES:
        raise SpeechUnavailable(
            "That recording is too long. Please keep it under 30 seconds."
        )

    language_code = LANGUAGE_CODES.get(language, LANGUAGE_CODES["en"])

    fields = {"language_code": (None, language_code)}

    boost = clean_bias(bias)

    if boost:
        # Word boosting is documented to work best on verbatim output,
        # and verbatim is what keyword matching wants anyway.
        fields["format"] = (None, "verbatim")
        fields["bias_list"] = (None, ",".join(boost))

    try:
        response = requests.post(
            STT_URL,
            headers={"X-API-Key-ID": GNANI_API_KEY},
            files={
                "audio_file": (filename, audio, content_type or "audio/webm"),
                **fields,
            },
            timeout=45
        )
    except requests.Timeout:
        raise SpeechUnavailable(
            "Voice input is taking too long. Please type instead."
        )
    except requests.RequestException:
        raise SpeechUnavailable(
            "Couldn't reach the voice service. Please type instead."
        )

    if response.status_code == 200:
        body = response.json()
        transcript = (body or {}).get("transcript")

        if not transcript:
            raise SpeechUnavailable(
                "Nothing was heard. Please speak a little louder and retry."
            )

        return str(transcript).strip()

    # The documented failures, each said in a way a member can act on.
    # The underlying reason is logged, never shown: an account or credit
    # problem is ours to fix, not theirs to read.
    detail = ""

    try:
        detail = (response.json() or {}).get("error", {}).get("message", "")
    except ValueError:
        detail = response.text[:200]

    logger.error(
        "Gnani STT failed (%s): %s", response.status_code, detail
    )

    if response.status_code == 403:
        raise SpeechUnavailable(
            "Voice input is unavailable right now. Please type instead."
        )

    if response.status_code == 429:
        raise SpeechUnavailable(
            "Voice input is busy right now. Please wait a moment or type instead."
        )

    if response.status_code in (500, 503):
        raise SpeechUnavailable(
            "The voice service is down right now. Please type instead."
        )

    raise SpeechUnavailable(
        "That recording couldn't be read. Please try again."
    )
