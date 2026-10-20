from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.ai_diagnosis import (
    ALLOWED_IMAGE_TYPES,
    LANGUAGE_NAMES,
    DiagnosisUnavailable,
    diagnose as diagnose_with_ai,
)
from app.auth import current_firebase_uid
from app.config import ANTHROPIC_API_KEY, FAKE_AI
from app.database import get_db
from app.fake_diagnosis import diagnose as diagnose_with_canned_answer
from app.models.diagnosis import Diagnosis
from app.models.service import Service


# =========================================================
# GIGEZEE AI DIAGNOSIS
# The member photographs what is broken; the AI says what a partner
# should check and which service to book. For members who can't name
# the fault - most often an older person on their own.
# =========================================================

router = APIRouter(
    prefix="/diagnosis",
    tags=["AI diagnosis"]
)

# Phone photos are shrunk by the app before sending; this leaves room
MAX_BYTES = 5 * 1024 * 1024

# Real AI unless GIGEZEE_FAKE_AI is on and no key is set (config decides
# that). Bound to one name here because tests and
# tests/dev_server_fake_ai.py swap this attribute to fake the call.
diagnose = diagnose_with_canned_answer if FAKE_AI else diagnose_with_ai


def diagnosis_response(record: Diagnosis) -> dict:
    return {
        "id": record.id,
        "photo_path": f"/diagnosis/{record.id}/photo",
        "member_note": record.member_note,
        "created_at": f"{record.created_at.isoformat()}Z",
        **record.result,
    }


@router.get("/available")
def diagnosis_available():
    """
    Whether the app should offer the camera at all. `fake` tells a
    caller the answers are canned, so a tester can tell the two apart
    without reading summary_for_partner.
    """
    return {
        "available": bool(ANTHROPIC_API_KEY) or FAKE_AI,
        "fake": FAKE_AI and not ANTHROPIC_API_KEY,
    }


@router.post("")
async def create_diagnosis(
    file: UploadFile = File(...),
    note: str = Form("", max_length=500),
    language: str = Form("en"),
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Please send a photo (JPG or PNG)."
        )

    data = await file.read(MAX_BYTES + 1)

    if not data:
        raise HTTPException(status_code=400, detail="The photo is empty.")

    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail="That photo is too large. Please try again."
        )

    # Only tiles a member can actually book, so the answer routes somewhere
    service_titles = [
        title for (title,) in db.query(Service.title)
        .filter(Service.is_active.is_(True))
        .order_by(Service.sort_order)
    ]

    try:
        result = diagnose(
            image_bytes=data,
            image_type=file.content_type,
            service_titles=service_titles,
            member_note=note,
            # An unknown language falls back to English rather than failing
            language=language if language in LANGUAGE_NAMES else "en",
        )
    except DiagnosisUnavailable as error:
        # 503: the member can still book by picking a service themselves
        raise HTTPException(status_code=503, detail=str(error))

    record = Diagnosis(
        created_by=firebase_uid,
        photo=data,
        photo_type=file.content_type,
        photo_size_bytes=len(data),
        member_note=note.strip() or None,
        language=language if language in LANGUAGE_NAMES else "en",
        result=result,
        service_title=result.get("service_title"),
        urgency=result.get("urgency"),
        has_safety_warning=bool(result.get("safety_warning")),
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return diagnosis_response(record)


@router.get("/{diagnosis_id}")
def get_diagnosis(
    diagnosis_id: UUID,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    record = db.get(Diagnosis, diagnosis_id)

    if not record:
        raise HTTPException(status_code=404, detail="Diagnosis not found")

    return diagnosis_response(record)


@router.post("/{diagnosis_id}/booking")
def attach_to_booking(
    diagnosis_id: UUID,
    order_id: str = Form(..., min_length=1, max_length=200),
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    """
    Link the diagnosis to the booking the member just made, so the
    partner who takes the job sees the photo and what to check.
    """
    record = db.get(Diagnosis, diagnosis_id)

    if not record:
        raise HTTPException(status_code=404, detail="Diagnosis not found")

    if record.created_by != firebase_uid:
        raise HTTPException(
            status_code=403,
            detail="This diagnosis isn't yours."
        )

    record.firebase_order_id = order_id
    db.commit()

    return {"attached": True}


@router.get("/for-order/{order_id}")
def get_for_order(
    order_id: str,
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    """What the partner sees on an incoming job, if the member used AI."""
    record = db.query(Diagnosis).filter(
        Diagnosis.firebase_order_id == order_id
    ).order_by(Diagnosis.created_at.desc()).first()

    if not record:
        return None

    return diagnosis_response(record)


@router.get("/{diagnosis_id}/photo")
def get_diagnosis_photo(
    diagnosis_id: UUID,
    db: Session = Depends(get_db)
):
    record = db.get(Diagnosis, diagnosis_id)

    if not record:
        raise HTTPException(status_code=404, detail="Photo not found")

    return Response(
        content=record.photo,
        media_type=record.photo_type,
        # The photo never changes once sent
        headers={"Cache-Control": "private, max-age=86400"},
    )
