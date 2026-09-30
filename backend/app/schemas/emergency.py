from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class EmergencyCreate(BaseModel):
    user_id: UUID
    service_type: str
    description: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    priority: str = "HIGH"


class EmergencyResponse(BaseModel):
    id: UUID
    user_id: UUID
    service_type: str
    description: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str
    priority: str
    assigned_partner_id: Optional[UUID] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True