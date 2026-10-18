from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import current_firebase_uid
from app.database import get_db
from app.models.photo import Photo


# =========================================================
# JOB PHOTOS
# The app shrinks photos to about 1280px before sending them, so they
# fit comfortably in the database. Each photo gets an unguessable link
# that the customer, partner and staff screens can show.
# =========================================================

router = APIRouter(
    prefix="/photos",
    tags=["Photos"]
)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

# A shrunk photo is a few hundred KB; this leaves plenty of room
MAX_BYTES = 3 * 1024 * 1024


@router.post("")
async def upload_photo(
    file: UploadFile = File(...),
    order_id: str = Form(..., min_length=1, max_length=200),
    label: str = Form(..., pattern=r"^(repair|part)$"),
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Please choose a photo.")

    data = await file.read(MAX_BYTES + 1)

    if not data:
        raise HTTPException(status_code=400, detail="The photo is empty.")

    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="The photo is too large.")

    photo = Photo(
        firebase_order_id=order_id,
        label=label,
        content_type=file.content_type,
        data=data,
        size_bytes=len(data),
        uploaded_by=firebase_uid,
    )
    db.add(photo)
    db.commit()

    # The app adds its own backend address in front
    return {"id": photo.id, "path": f"/photos/{photo.id}"}


@router.get("/{photo_id}")
def get_photo(photo_id: UUID, db: Session = Depends(get_db)):
    photo = db.get(Photo, photo_id)

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    return Response(
        content=photo.data,
        media_type=photo.content_type,
        # A photo never changes once uploaded
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
