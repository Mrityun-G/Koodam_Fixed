"""
Turning a recorded clip into words.

Only used by devices whose browser cannot listen for itself - inside the
Android app, where WebView has no SpeechRecognition. Everywhere else the
browser still does it, free and live.

Signed in on purpose: a recording is somebody's voice describing a fault
in their home, and an open endpoint here would also be a free
transcription service for anyone who found it, billed to GigEzee.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.authz import require_user
from app.gnani import (
    ACCEPTED_TYPES,
    LANGUAGE_CODES,
    SpeechUnavailable,
    is_configured,
    transcribe,
)
from app.models.user import User

logger = logging.getLogger("gigezee.speech")

router = APIRouter(prefix="/speech", tags=["Speech"])


@router.get("/available")
def speech_available():
    """
    Whether the recorded-clip fallback can be used at all. The app asks
    before showing a mic it would not be able to honour.
    """
    return {
        "available": is_configured(),
        "languages": sorted(LANGUAGE_CODES),
    }


@router.post("/transcribe")
async def transcribe_speech(
    audio: UploadFile = File(...),
    language: str = Form("en"),
    # The words to weight, from the same keyword list the app matches
    # on, comma-separated. Optional.
    bias: Optional[str] = Form(None),
    caller: User = Depends(require_user)
):
    if audio.content_type and audio.content_type.split(";")[0] not in ACCEPTED_TYPES:
        raise HTTPException(
            status_code=400,
            detail="That audio format isn't supported."
        )

    data = await audio.read()

    try:
        transcript = transcribe(
            data,
            audio.content_type,
            language=language,
            bias=bias.split(",") if bias else None,
            filename=audio.filename or "speech.webm"
        )
    except SpeechUnavailable as error:
        # 503 rather than 500: the app treats it as "fall back to typing"
        raise HTTPException(status_code=503, detail=str(error))

    logger.info(
        "transcribed %s bytes of %s for user %s",
        len(data), language, caller.id
    )

    return {"transcript": transcript}
