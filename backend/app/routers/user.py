from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from uuid import UUID

from app.auth import current_firebase_uid
from app.authz import require_self, require_user
from app.database import get_db
from app.models.booking import Booking
from app.models.booking_detail import BookingDetail
from app.models.partner_document import PartnerDocument
from app.models.user import User
from app.models.partner import Partner
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.supabase_storage import StorageUnavailable, upload as storage_upload


router = APIRouter(
    prefix="/users",
    tags=["Users"]
)


# --------------------------------------------------
# ENSURE PARTNER PROFILE
# --------------------------------------------------

def ensure_partner_profile(
    db: Session,
    user: User
):
    if user.role != "PARTNER":
        return None

    partner = db.query(Partner).filter(
        Partner.user_id == user.id
    ).first()

    if partner:
        return partner

    partner = Partner(
        user_id=user.id,
        experience_years=0,
        hourly_rate=0.0,
        vehicle=None,
        vehicle_number=None,
        is_online=False,
        is_verified=False,
        latitude=None,
        longitude=None
    )

    db.add(partner)
    db.commit()
    db.refresh(partner)

    return partner


# --------------------------------------------------
# CREATE USER
# --------------------------------------------------

@router.post("/", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    firebase_uid: str = Depends(current_firebase_uid)
):
    # The account being created has to be the one that signed in, so a
    # caller can't mint a profile for somebody else's Firebase uid.
    if user_data.firebase_uid != firebase_uid:
        raise HTTPException(
            status_code=403,
            detail="You can only create your own profile."
        )

    existing_user = db.query(User).filter(
        User.email == user_data.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User with this email already exists"
        )

    new_user = User(
        firebase_uid=user_data.firebase_uid,
        name=user_data.name,
        email=user_data.email,
        phone=user_data.phone,
        avatar=user_data.avatar,
        role=user_data.role
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create partner profile automatically
    ensure_partner_profile(
        db,
        new_user
    )

    return new_user


# --------------------------------------------------
# SYNC FIREBASE USER WITH DATABASE
# --------------------------------------------------

@router.post("/sync", response_model=UserResponse)
def sync_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    firebase_uid: str = Depends(current_firebase_uid)
):
    # The uid comes from the signed token, never from the body: otherwise
    # anyone could re-point another person's account at their own login by
    # posting that account's email with their uid.
    if user_data.firebase_uid != firebase_uid:
        raise HTTPException(
            status_code=403,
            detail="This sign-in doesn't match the account being synced."
        )

    # ----------------------------------------------
    # EXISTING FIREBASE USER
    # ----------------------------------------------

    existing_user = (
        db.query(User)
        .filter(
            User.firebase_uid == user_data.firebase_uid
        )
        .first()
    )

    # An account's role is fixed at sign-up; logging in from the other
    # login page must not turn a member into a partner (skipping KYC)
    if existing_user:

        existing_user.name = user_data.name
        existing_user.email = user_data.email

        if user_data.phone is not None:
            existing_user.phone = user_data.phone

        if user_data.avatar is not None:
            existing_user.avatar = user_data.avatar

        db.commit()
        db.refresh(existing_user)

        # Ensure PARTNER profile exists
        ensure_partner_profile(
            db,
            existing_user
        )

        return existing_user

    # ----------------------------------------------
    # EXISTING EMAIL
    # ----------------------------------------------

    existing_email = (
        db.query(User)
        .filter(
            User.email == user_data.email
        )
        .first()
    )

    if existing_email:

        # An account with this email already exists under a different
        # login. Only Google re-linking the same verified address should
        # ever land here; a mismatch means someone is trying to take it
        # over, so refuse rather than move the account.
        if (
            existing_email.firebase_uid
            and existing_email.firebase_uid != user_data.firebase_uid
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "An account already uses this email. Please log in "
                    "with your original sign-in method."
                )
            )

        existing_email.firebase_uid = user_data.firebase_uid
        existing_email.name = user_data.name

        if user_data.phone is not None:
            existing_email.phone = user_data.phone

        if user_data.avatar is not None:
            existing_email.avatar = user_data.avatar

        db.commit()
        db.refresh(existing_email)

        # Ensure PARTNER profile exists
        ensure_partner_profile(
            db,
            existing_email
        )

        return existing_email

    # ----------------------------------------------
    # CREATE NEW USER
    # ----------------------------------------------

    new_user = User(
        firebase_uid=user_data.firebase_uid,
        name=user_data.name,
        email=user_data.email,
        phone=user_data.phone,
        avatar=user_data.avatar,
        role=user_data.role
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create partner profile automatically
    ensure_partner_profile(
        db,
        new_user
    )

    return new_user


# --------------------------------------------------
# UPDATE USER PROFILE
# --------------------------------------------------

@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    caller: User = Depends(require_user)
):
    require_self(caller, user_id)

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    if user_data.name is not None:
        user.name = user_data.name

    if user_data.phone is not None:
        user.phone = user_data.phone

    if user_data.avatar is not None:
        user.avatar = user_data.avatar

    db.commit()
    db.refresh(user)

    return user


# --------------------------------------------------
# GET USER
# --------------------------------------------------

@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    caller: User = Depends(require_user)
):
    require_self(caller, user_id)

    user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    return user


# --------------------------------------------------
# GET USER BY FIREBASE UID
# --------------------------------------------------

@router.get(
    "/firebase/{firebase_uid}",
    response_model=UserResponse
)
def get_user_by_firebase_uid(
    firebase_uid: str,
    db: Session = Depends(get_db),
    caller_uid: str = Depends(current_firebase_uid)
):
    # This is how the app loads its own profile on start-up, so it only
    # ever answers for the account that is signed in.
    if firebase_uid != caller_uid:
        raise HTTPException(
            status_code=403,
            detail="You can only load your own profile."
        )

    user = db.query(User).filter(
        User.firebase_uid == firebase_uid
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User profile not found"
        )

    return user

# --------------------------------------------------
# DELETE ACCOUNT
# The Terms promise a member can have their data removed, and both app
# stores require it. Money records have to be kept for tax and dispute
# reasons, so the personal details are erased from them instead: the
# booking survives, the person behind it does not.
# --------------------------------------------------

OPEN_BOOKING_STATUSES = ("PENDING", "ACCEPTED", "IN_PROGRESS")


@router.delete("/me")
def delete_my_account(
    db: Session = Depends(get_db),
    caller: User = Depends(require_user)
):
    partner = db.query(Partner).filter(
        Partner.user_id == caller.id
    ).first()

    # A job in flight has another person on the other side of it
    open_as_customer = db.query(Booking).filter(
        Booking.user_id == caller.id,
        Booking.status.in_(OPEN_BOOKING_STATUSES)
    ).first()

    open_as_partner = (
        db.query(Booking).filter(
            Booking.partner_id == partner.id,
            Booking.status.in_(OPEN_BOOKING_STATUSES)
        ).first()
        if partner else None
    )

    if open_as_customer or open_as_partner:
        raise HTTPException(
            status_code=409,
            detail=(
                "You still have a booking in progress. Please finish or "
                "cancel it before deleting your account."
            )
        )

    # Work that was done but not paid for yet
    unpaid = db.query(Booking).join(
        BookingDetail, BookingDetail.booking_id == Booking.id
    ).filter(
        Booking.user_id == caller.id,
        Booking.status == "COMPLETED",
        BookingDetail.payment_status != "PAID"
    ).first()

    if unpaid:
        raise HTTPException(
            status_code=409,
            detail=(
                "There's still an unpaid bill on your account. Please "
                "settle it before deleting your account."
            )
        )

    if partner:
        # KYC scans are the most sensitive thing we hold; they go for real
        db.query(PartnerDocument).filter(
            PartnerDocument.partner_id == partner.id
        ).delete(synchronize_session=False)

        partner.is_online = False
        partner.is_verified = False
        partner.latitude = None
        partner.longitude = None
        partner.vehicle = None
        partner.vehicle_number = None
        partner.police_verification_status = "NOT_SUBMITTED"
        partner.police_rejection_reason = None
        partner.deactivated_at = datetime.utcnow()
        partner.deactivation_reason = "Account deleted by the partner"

    # Scrub the person out of the rows that have to stay
    caller.name = "Deleted user"
    caller.email = f"deleted-{caller.id}@users.koodam.invalid"
    caller.phone = None
    caller.avatar = None

    # Frees the Firebase login and stops any old token resolving to this
    # row, while keeping the NOT NULL + UNIQUE promise on the column
    caller.firebase_uid = f"deleted:{caller.id}"

    db.commit()

    return {
        "deleted": True,
        "message": "Your account and personal details have been removed."
    }


# --------------------------------------------------
# PROFILE PHOTO
# Uploaded through the server so the Firebase sign-in can be checked and
# the file looked at before it is stored. The browser used to write
# straight into the Supabase bucket with the anon key, which meant the
# bucket had to accept writes from anyone holding that key.
# --------------------------------------------------

AVATAR_BUCKET = "profile-photos"

AVATAR_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

MAX_AVATAR_BYTES = 5 * 1024 * 1024


@router.post("/me/avatar")
async def upload_my_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    caller: User = Depends(require_user)
):
    if file.content_type not in AVATAR_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Please upload a JPG, PNG or WebP image."
        )

    data = await file.read()

    if not data:
        raise HTTPException(status_code=400, detail="That file is empty.")

    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Please choose an image under 5MB."
        )

    extension = AVATAR_TYPES[file.content_type]

    # The name is built here, never taken from the upload: a path sent by
    # the browser could otherwise climb out of the user's own folder.
    path = (
        f"profiles/{caller.id}/avatar-"
        f"{int(datetime.utcnow().timestamp())}.{extension}"
    )

    try:
        url = storage_upload(
            AVATAR_BUCKET,
            path,
            data,
            content_type=file.content_type
        )
    except StorageUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error))

    caller.avatar = url
    db.commit()

    return {"avatar": url}
