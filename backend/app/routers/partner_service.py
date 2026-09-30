from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.partner import Partner
from app.models.user import User
from app.models.service import Service
from app.models.partner_service import PartnerService
from app.schemas.partner_service import (
    PartnerServiceCreate,
    PartnerServiceResponse
)


router = APIRouter(
    prefix="/partner-services",
    tags=["Partner Services"]
)


# =========================================================
# RESOLVE PARTNER ID
# Accepts either:
# 1. partners.id
# 2. users.id
# =========================================================

def resolve_partner(
    db: Session,
    identifier: UUID
):
    # First check actual Partner ID
    partner = db.query(Partner).filter(
        Partner.id == identifier
    ).first()

    if partner:
        return partner

    # If not found, check User ID
    partner = (
        db.query(Partner)
        .join(User, User.id == Partner.user_id)
        .filter(User.id == identifier)
        .first()
    )

    return partner


# =========================================================
# ADD SERVICE TO PARTNER
# =========================================================

@router.post(
    "/",
    response_model=PartnerServiceResponse
)
def assign_service_to_partner(
    data: PartnerServiceCreate,
    db: Session = Depends(get_db)
):
    partner = resolve_partner(
        db,
        data.partner_id
    )

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner profile not found"
        )

    service = db.query(Service).filter(
        Service.id == data.service_id
    ).first()

    if not service:
        raise HTTPException(
            status_code=404,
            detail="Service not found"
        )

    existing = db.query(PartnerService).filter(
        PartnerService.partner_id == partner.id,
        PartnerService.service_id == data.service_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="This service is already assigned to this partner"
        )

    new_partner_service = PartnerService(
        partner_id=partner.id,
        service_id=data.service_id,
        experience_years=data.experience_years,
        price_override=data.price_override,
        is_active=True
    )

    db.add(new_partner_service)
    db.commit()
    db.refresh(new_partner_service)

    return new_partner_service


# =========================================================
# GET ALL ACTIVE PARTNER SERVICES
# =========================================================

@router.get(
    "/",
    response_model=list[PartnerServiceResponse]
)
def get_partner_services(
    db: Session = Depends(get_db)
):
    return db.query(PartnerService).filter(
        PartnerService.is_active == True
    ).all()


# =========================================================
# GET SERVICES FOR PARTNER
# Accepts Partner ID OR User ID
# =========================================================

@router.get(
    "/partner/{partner_id}",
    response_model=list[PartnerServiceResponse]
)
def get_services_for_partner(
    partner_id: UUID,
    db: Session = Depends(get_db)
):
    partner = resolve_partner(
        db,
        partner_id
    )

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner profile not found"
        )

    return db.query(PartnerService).filter(
        PartnerService.partner_id == partner.id,
        PartnerService.is_active == True
    ).all()


# =========================================================
# EXPLICIT USER-ID ENDPOINT
# =========================================================

@router.get(
    "/user/{user_id}",
    response_model=list[PartnerServiceResponse]
)
def get_services_for_partner_user(
    user_id: UUID,
    db: Session = Depends(get_db)
):
    partner = (
        db.query(Partner)
        .filter(Partner.user_id == user_id)
        .first()
    )

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner profile not found for this user"
        )

    return db.query(PartnerService).filter(
        PartnerService.partner_id == partner.id,
        PartnerService.is_active == True
    ).all()


# =========================================================
# UPDATE PARTNER SERVICE
# =========================================================

@router.patch(
    "/{partner_service_id}",
    response_model=PartnerServiceResponse
)
def update_partner_service(
    partner_service_id: UUID,
    data: PartnerServiceCreate,
    db: Session = Depends(get_db)
):
    partner_service = db.query(
        PartnerService
    ).filter(
        PartnerService.id == partner_service_id
    ).first()

    if not partner_service:
        raise HTTPException(
            status_code=404,
            detail="Partner service not found"
        )

    partner = resolve_partner(
        db,
        data.partner_id
    )

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner profile not found"
        )

    if partner_service.partner_id != partner.id:
        raise HTTPException(
            status_code=400,
            detail="Partner does not own this service"
        )

    partner_service.experience_years = (
        data.experience_years
    )

    partner_service.price_override = (
        data.price_override
    )

    db.commit()
    db.refresh(partner_service)

    return partner_service


# =========================================================
# REMOVE / DEACTIVATE SERVICE
# =========================================================

@router.delete(
    "/{partner_service_id}",
    response_model=PartnerServiceResponse
)
def deactivate_partner_service(
    partner_service_id: UUID,
    db: Session = Depends(get_db)
):
    partner_service = db.query(
        PartnerService
    ).filter(
        PartnerService.id == partner_service_id
    ).first()

    if not partner_service:
        raise HTTPException(
            status_code=404,
            detail="Partner service not found"
        )

    partner_service.is_active = False

    db.commit()
    db.refresh(partner_service)

    return partner_service