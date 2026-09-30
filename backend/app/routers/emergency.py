from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models.emergency import EmergencyRequest
from app.models.user import User
from app.models.partner import Partner

from app.schemas.emergency import (
    EmergencyCreate,
    EmergencyResponse
)


router = APIRouter(
    prefix="/emergency",
    tags=["Emergency"]
)


@router.post("/", response_model=EmergencyResponse)
def create_emergency_request(
    emergency_data: EmergencyCreate,
    db: Session = Depends(get_db)
):

    # Check user
    user = db.query(User).filter(
        User.id == emergency_data.user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    new_request = EmergencyRequest(
        user_id=emergency_data.user_id,
        service_type=emergency_data.service_type,
        description=emergency_data.description,
        address=emergency_data.address,
        latitude=emergency_data.latitude,
        longitude=emergency_data.longitude,
        priority=emergency_data.priority,
        status="PENDING"
    )

    db.add(new_request)
    db.commit()
    db.refresh(new_request)

    return new_request


@router.get("/", response_model=list[EmergencyResponse])
def get_emergency_requests(
    db: Session = Depends(get_db)
):
    return db.query(EmergencyRequest).order_by(
        EmergencyRequest.created_at.desc()
    ).all()


@router.get("/{request_id}", response_model=EmergencyResponse)
def get_emergency_request(
    request_id: UUID,
    db: Session = Depends(get_db)
):

    request = db.query(EmergencyRequest).filter(
        EmergencyRequest.id == request_id
    ).first()

    if not request:
        raise HTTPException(
            status_code=404,
            detail="Emergency request not found"
        )

    return request


@router.patch("/{request_id}/assign/{partner_id}",
              response_model=EmergencyResponse)
def assign_emergency_partner(
    request_id: UUID,
    partner_id: UUID,
    db: Session = Depends(get_db)
):

    request = db.query(EmergencyRequest).filter(
        EmergencyRequest.id == request_id
    ).first()

    if not request:
        raise HTTPException(
            status_code=404,
            detail="Emergency request not found"
        )

    partner = db.query(Partner).filter(
        Partner.id == partner_id
    ).first()

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner not found"
        )

    request.assigned_partner_id = partner_id
    request.status = "ASSIGNED"

    db.commit()
    db.refresh(request)

    return request