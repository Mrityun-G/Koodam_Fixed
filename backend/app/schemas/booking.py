from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class BookingCreate(BaseModel):
    user_id: UUID
    partner_id: UUID
    service_id: UUID
    booking_time: datetime
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = None


class BookingResponse(BaseModel):
    id: UUID
    user_id: UUID
    partner_id: UUID
    service_id: UUID
    booking_time: datetime
    status: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    total_amount: float
    notes: Optional[str] = None
    safety_pin: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True