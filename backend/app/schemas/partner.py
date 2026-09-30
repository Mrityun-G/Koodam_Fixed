from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class PartnerCreate(BaseModel):
    user_id: UUID
    experience_years: int = 0
    hourly_rate: float = 0.0
    vehicle: Optional[str] = None
    vehicle_number: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class PartnerResponse(BaseModel):
    id: UUID
    user_id: UUID
    experience_years: int
    rating: float
    reviews_count: int
    completion_rate: float
    hourly_rate: float
    vehicle: Optional[str] = None
    vehicle_number: Optional[str] = None
    is_online: bool
    is_verified: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    class Config:
        from_attributes = True