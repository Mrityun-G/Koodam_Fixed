from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
import random

from app.database import get_db
from app.models.booking import Booking
from app.models.user import User
from app.models.partner import Partner
from app.models.service import Service
from app.models.partner_service import PartnerService

from app.schemas.booking import BookingCreate, BookingResponse


router = APIRouter(
    prefix="/bookings",
    tags=["Bookings"]
)


@router.post("/", response_model=BookingResponse)
def create_booking(
    booking_data: BookingCreate,
    db: Session = Depends(get_db)
):

    # Check user
    user = db.query(User).filter(
        User.id == booking_data.user_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Check partner
    partner = db.query(Partner).filter(
        Partner.id == booking_data.partner_id
    ).first()

    if not partner:
        raise HTTPException(
            status_code=404,
            detail="Partner not found"
        )

    # Check service
    service = db.query(Service).filter(
        Service.id == booking_data.service_id
    ).first()

    if not service:
        raise HTTPException(
            status_code=404,
            detail="Service not found"
        )

    # Check whether partner provides this service
    partner_service = db.query(PartnerService).filter(
        PartnerService.partner_id == booking_data.partner_id,
        PartnerService.service_id == booking_data.service_id,
        PartnerService.is_active == True
    ).first()

    if not partner_service:
        raise HTTPException(
            status_code=400,
            detail="This partner does not provide this service"
        )

    # Determine price
    if partner_service.price_override is not None:
        total_amount = partner_service.price_override
    else:
        total_amount = service.price

    # Generate 4-digit safety PIN
    safety_pin = str(random.randint(1000, 9999))

    # Create booking
    new_booking = Booking(
        user_id=booking_data.user_id,
        partner_id=booking_data.partner_id,
        service_id=booking_data.service_id,
        booking_time=booking_data.booking_time,
        status="PENDING",
        address=booking_data.address,
        latitude=booking_data.latitude,
        longitude=booking_data.longitude,
        total_amount=total_amount,
        notes=booking_data.notes,
        safety_pin=safety_pin
    )

    db.add(new_booking)
    db.commit()
    db.refresh(new_booking)

    return new_booking


@router.get("/", response_model=list[BookingResponse])
def get_bookings(
    db: Session = Depends(get_db)
):
    return db.query(Booking).order_by(
        Booking.created_at.desc()
    ).all()


@router.get("/{booking_id}", response_model=BookingResponse)
def get_booking(
    booking_id: UUID,
    db: Session = Depends(get_db)
):

    booking = db.query(Booking).filter(
        Booking.id == booking_id
    ).first()

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Booking not found"
        )

    return booking