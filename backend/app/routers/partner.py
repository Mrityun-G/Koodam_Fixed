from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.partner import Partner
from app.models.user import User
from app.schemas.partner import PartnerCreate, PartnerResponse


router = APIRouter(
    prefix="/partners",
    tags=["Partners"]
)


@router.post("/", response_model=PartnerResponse)
def create_partner(
    partner_data: PartnerCreate,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == partner_data.user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    existing_partner = db.query(Partner).filter(
        Partner.user_id == partner_data.user_id
    ).first()

    if existing_partner:
        raise HTTPException(
            status_code=400,
            detail="This user is already a partner"
        )

    new_partner = Partner(
        user_id=partner_data.user_id,
        experience_years=partner_data.experience_years,
        hourly_rate=partner_data.hourly_rate,
        vehicle=partner_data.vehicle,
        vehicle_number=partner_data.vehicle_number,
        latitude=partner_data.latitude,
        longitude=partner_data.longitude
    )

    db.add(new_partner)
    db.commit()
    db.refresh(new_partner)

    return new_partner


@router.get("/", response_model=list[PartnerResponse])
def get_partners(
    db: Session = Depends(get_db)
):
    return db.query(Partner).all()


@router.get("/{partner_id}", response_model=PartnerResponse)
def get_partner(
    partner_id: UUID,
    db: Session = Depends(get_db)
):
    partner = db.query(Partner).filter(
        Partner.id == partner_id
    ).first()

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner not found"
        )

    return partner