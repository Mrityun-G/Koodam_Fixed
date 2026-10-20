from math import asin, cos, radians, sin, sqrt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from uuid import UUID

from app.auth import current_firebase_uid
from app.database import get_db
from app.models.service import Service
from app.models.partner_service import PartnerService
from app.models.partner import Partner
from app.models.user import User
from app.authz import require_admin, require_user
from app.escalations import can_take_bookings
from app.schemas.service import ServiceCreate, ServiceResponse, ServiceUpdate


router = APIRouter(
    prefix="/services",
    tags=["Services"]
)


EARTH_RADIUS_KM = 6371.0

# One degree of latitude is this far anywhere; longitude shrinks towards
# the poles, which is why the box below divides by cos(latitude)
KM_PER_DEGREE_LAT = 111.0

# Most partners a member is sent for one service tile. The home screen
# shows a handful, so this is generous; it exists to keep the response
# a fixed size however many partners sign up.
NEAREST_PER_SERVICE = 20

# Used to size the bounding box when no partner has a radius set yet
DEFAULT_SERVICE_RADIUS_KM = 5


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    """Great-circle distance in km. Mirrors the app's lib/geo.js."""
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)

    h = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    )

    return 2 * EARTH_RADIUS_KM * asin(sqrt(h))


# Adding or changing services is for GigEzee staff only
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


def is_police_verified(partner) -> bool:
    return partner.police_verification_status == "VERIFIED"


def is_bookable(partner, service=None) -> bool:
    # Services like Child Care are only offered by police-verified partners
    if (
        service is not None
        and service.requires_police_verification
        and not is_police_verified(partner)
    ):
        return False

    return bool(partner.is_online) and can_take_bookings(partner)


def partner_listing(
    partner, user, partner_service, service, distance_km=None
) -> dict:
    # No email or phone here. This list is read by every member on the
    # home screen, and a partner's contact details aren't theirs to
    # have: the booking flow asks for the number it needs, once, from
    # /partners/{id}/contact.
    return {
        "partner_id": partner.id,
        "name": user.name,
        "avatar": user.avatar,
        # How far the partner is from the member who asked, in km, or
        # null when the member's own position isn't known yet
        "distance_km": (
            round(distance_km, 2) if distance_km is not None else None
        ),
        "experience_years": partner_service.experience_years,
        "rating": partner.rating,
        "reviews_count": partner.reviews_count,
        "completion_rate": partner.completion_rate,
        # 100 = no escalations; lower partners rank lower in search
        "reliability_score": partner.reliability_score,
        # Same price the booking is charged at (see routers/booking.py)
        "hourly_rate": (
            partner_service.price_override
            if partner_service.price_override is not None
            else service.price
        ),
        "vehicle": partner.vehicle,
        "vehicle_number": partner.vehicle_number,
        "is_online": partner.is_online,
        "is_verified": partner.is_verified,
        "police_verified": is_police_verified(partner),
        "latitude": partner.latitude,
        "longitude": partner.longitude,
        "service_radius_km": partner.service_radius_km or 5
    }


# Declared before /{service_id} so "with-partners" isn't read as an ID
@router.get("/with-partners")
def get_services_with_partners(
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    per_service: int = Query(NEAREST_PER_SERVICE, ge=1, le=100),
    firebase_uid: str = Depends(current_firebase_uid),
    db: Session = Depends(get_db)
):
    """
    Every active service with the partners who can reach the member,
    nearest first.

    `lat`/`lng` are the member's position. Given them, the database is
    asked only for partners in a box around it, and the ones whose own
    service radius doesn't stretch that far are dropped - so the
    response is the size of the member's neighbourhood, not of the
    partner table. Without a position (location not granted yet) the
    best-rated partners come back instead, still capped at
    `per_service`, so the screen fills but the response stays bounded.
    """
    knows_where = lat is not None and lng is not None

    # Every active service is a tile on the home screen, whether or not
    # anyone nearby offers it, so the box below narrows which partners
    # join - it is part of the ON clause, never a WHERE. As a WHERE it
    # would drop the rows where the outer join produced no partner, and
    # with them the tiles for every service nobody nearby offers.
    partner_on = Partner.id == PartnerService.partner_id

    if knows_where:
        # The box has to be wide enough for the furthest-reaching
        # partner, because each one is kept or dropped by their own
        # radius below. One scalar query, so a partner who sets a wide
        # radius is never silently cut off.
        widest_km = (
            db.query(func.max(Partner.service_radius_km)).scalar()
            or DEFAULT_SERVICE_RADIUS_KM
        )

        d_lat = widest_km / KM_PER_DEGREE_LAT

        # cos() of a latitude near the poles approaches zero; the floor
        # keeps the box finite rather than dividing by ~0
        d_lng = widest_km / max(
            KM_PER_DEGREE_LAT * cos(radians(lat)), 1e-6
        )

        # Indexed on (latitude, longitude) - see app/main.py
        partner_on = (
            partner_on
            & Partner.latitude.isnot(None)
            & Partner.longitude.isnot(None)
            & Partner.latitude.between(lat - d_lat, lat + d_lat)
            & Partner.longitude.between(lng - d_lng, lng + d_lng)
        )

    # Services with no partners still come back (outer joins), so the
    # whole screen is one query
    rows = (
        db.query(Service, Partner, User, PartnerService)
        .outerjoin(
            PartnerService,
            (PartnerService.service_id == Service.id)
            & (PartnerService.is_active == True)
        )
        .outerjoin(Partner, partner_on)
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
        if not (partner and user and is_bookable(partner, service)):
            continue

        distance_km = None

        if knows_where:
            distance_km = haversine_km(
                lat, lng, partner.latitude, partner.longitude
            )

            # The box is square and generous; this is the real test,
            # against the radius this partner actually set
            radius_km = (
                partner.service_radius_km or DEFAULT_SERVICE_RADIUS_KM
            )

            if distance_km > radius_km:
                continue

        entry["partners"].append(
            partner_listing(
                partner, user, partner_service, service, distance_km
            )
        )

    # Nearest first when the member's position is known, best-rated
    # first when it isn't, then capped either way
    for entry in services.values():
        entry["partners"].sort(
            key=(
                (lambda p: p["distance_km"])
                if knows_where
                else (lambda p: -(p["rating"] or 0))
            )
        )
        entry["partners"] = entry["partners"][:per_service]

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
    db: Session = Depends(get_db),
    caller: User = Depends(require_user)
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

    results = [row for row in results if is_bookable(row[0], service)]

    partners = [
        partner_listing(partner, user, partner_service, service)
        for partner, user, partner_service in results
    ]

    return partners
