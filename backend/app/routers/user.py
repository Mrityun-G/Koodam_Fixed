from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.user import User
from app.models.partner import Partner
from app.schemas.user import UserCreate, UserResponse, UserUpdate


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
    db: Session = Depends(get_db)
):
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
    db: Session = Depends(get_db)
):
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

    if existing_user:

        existing_user.name = user_data.name
        existing_user.email = user_data.email
        existing_user.role = user_data.role

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

        existing_email.firebase_uid = user_data.firebase_uid
        existing_email.name = user_data.name
        existing_email.role = user_data.role

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
    db: Session = Depends(get_db)
):
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
    db: Session = Depends(get_db)
):
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
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.firebase_uid == firebase_uid
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User profile not found"
        )

    return user