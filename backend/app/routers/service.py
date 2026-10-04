from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.service import Service
from app.models.partner_service import PartnerService
from app.models.partner import Partner
from app.models.user import User
from app.escalations import can_take_bookings
from app.routers.escalations import require_admin
from app.schemas.service import ServiceCreate, ServiceResponse, ServiceUpdate


router = APIRouter(
    prefix="/services",
    tags=["Services"]
)


# Adding or changing services is for KOODAM staff only
@router.post("/", response_model=ServiceResponse)
def create_service(
    service_data: ServiceCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    new_service = Service(
        **service_data.model_dump(exclude={"category"}),
        # Home tiles match helpers by category; one tile per service
        category=service_data.category or service_data.title,
        is_active=True
    )

    db.add(new_service)
    db.commit()
    db.refresh(new_service)

    return new_service


@router.get("/", response_model=list[ServiceResponse])
def get_services(
    db: Session = Depends(get_db)
):
    return (
        db.query(Service)
        .filter(Service.is_active == True)
        .order_by(Service.sort_order, Service.title)
        .all()
    )


@router.patch("/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: UUID,
    changes: ServiceUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    service = db.get(Service, service_id)

    if not service:
        raise HTTPException(
            status_code=404,
            detail="Service not found"
        )

    for field, value in changes.model_dump(exclude_unset=True).items():
        setattr(service, field, value)

    db.commit()
    db.refresh(service)

    return service


def is_bookable(partner) -> bool:
    return bool(partner.is_online) and can_take_bookings(partner)


def partner_listing(partner, user, partner_service) -> dict:
    return {
        "partner_id": partner.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "experience_years": partner_service.experience_years,
        "rating": partner.rating,
        "reviews_count": partner.reviews_count,
        "completion_rate": partner.completion_rate,
        # 100 = no escalations; lower partners rank lower in search
        "reliability_score": partner.reliability_score,
        "hourly_rate": (
            partner_service.price_override
            if partner_service.price_override is not None
            else partner.hourly_rate
        ),
        "vehicle": partner.vehicle,
        "vehicle_number": partner.vehicle_number,
        "is_online": partner.is_online,
        "is_verified": partner.is_verified,
        "police_verified": (
            partner.police_verification_status == "VERIFIED"
        ),
        "latitude": partner.latitude,
        "longitude": partner.longitude,
        "service_radius_km": partner.service_radius_km or 5
    }


# Declared before /{service_id} so "with-partners" isn't read as an ID
@router.get("/with-partners")
def get_services_with_partners(
    db: Session = Depends(get_db)
):
    """
    Every active service with the partners offering it, in one query,
    so the home screen needs one request instead of one per service.
    """
    # Services with no partners still come back (outer joins), so the
    # whole screen is one query
    rows = (
        db.query(Service, Partner, User, PartnerService)
        .outerjoin(
            PartnerService,
            (PartnerService.service_id == Service.id)
            & (PartnerService.is_active == True)
        )
        .outerjoin(Partner, Partner.id == PartnerService.partner_id)
        .outerjoin(User, User.id == Partner.user_id)
        .filter(Service.is_active == True)
        .order_by(Service.sort_order, Service.title)
        .all()
    )

    services = {}

    for service, partner, user, partner_service in rows:
        entry = services.setdefault(service.id, {
            **ServiceResponse.model_validate(service).model_dump(),
            "partners": []
        })

        # Offline or suspended partners aren't offered to customers
        if partner and user and is_bookable(partner):
            entry["partners"].append(
                partner_listing(partner, user, partner_service)
            )

    return list(services.values())


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

    results = [row for row in results if is_bookable(row[0])]

    partners = [
        partner_listing(partner, user, partner_service)
        for partner, user, partner_service in results
    ]

    return partners
