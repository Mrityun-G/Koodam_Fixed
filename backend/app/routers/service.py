from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.service import Service
from app.models.partner_service import PartnerService
from app.models.partner import Partner
from app.models.user import User
from app.schemas.service import ServiceCreate, ServiceResponse


router = APIRouter(
    prefix="/services",
    tags=["Services"]
)


@router.post("/", response_model=ServiceResponse)
def create_service(
    service_data: ServiceCreate,
    db: Session = Depends(get_db)
):
    new_service = Service(
        title=service_data.title,
        description=service_data.description,
        category=service_data.category,
        price=service_data.price,
        duration_minutes=service_data.duration_minutes,
        tag=service_data.tag
    )

    db.add(new_service)
    db.commit()
    db.refresh(new_service)

    return new_service


@router.get("/", response_model=list[ServiceResponse])
def get_services(
    db: Session = Depends(get_db)
):
    return db.query(Service).filter(
        Service.is_active == True
    ).all()


@router.get("/{service_id}", response_model=ServiceResponse)
def get_service(
    service_id: UUID,
    db: Session = Depends(get_db)
):
    service = db.query(Service).filter(
        Service.id == service_id
    ).first()

    if not service:
        raise HTTPException(
            status_code=404,
            detail="Service not found"
        )

    return service


@router.get("/{service_id}/partners")
def get_partners_for_service(
    service_id: UUID,
    db: Session = Depends(get_db)
):
    # Check whether the service exists
    service = db.query(Service).filter(
        Service.id == service_id,
        Service.is_active == True
    ).first()

    if not service:
        raise HTTPException(
            status_code=404,
            detail="Service not found"
        )

    # Find partners who provide this service
    results = (
        db.query(
            Partner,
            User,
            PartnerService
        )
        .join(
            PartnerService,
            PartnerService.partner_id == Partner.id
        )
        .join(
            User,
            User.id == Partner.user_id
        )
        .filter(
            PartnerService.service_id == service_id,
            PartnerService.is_active == True
        )
        .all()
    )

    partners = []

    for partner, user, partner_service in results:
        partners.append({
            "partner_id": partner.id,
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "avatar": user.avatar,
            "experience_years": partner_service.experience_years,
            "rating": partner.rating,
            "reviews_count": partner.reviews_count,
            "completion_rate": partner.completion_rate,
            "hourly_rate": (
                partner_service.price_override
                if partner_service.price_override is not None
                else partner.hourly_rate
            ),
            "vehicle": partner.vehicle,
            "vehicle_number": partner.vehicle_number,
            "is_online": partner.is_online,
            "is_verified": partner.is_verified,
            "latitude": partner.latitude,
            "longitude": partner.longitude
        })

    return partners