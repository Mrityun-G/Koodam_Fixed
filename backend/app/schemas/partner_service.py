from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class PartnerServiceCreate(BaseModel):
    partner_id: UUID
    service_id: UUID
    experience_years: int = 0
    price_override: Optional[float] = None


class PartnerServiceResponse(BaseModel):
    id: UUID
    partner_id: UUID
    service_id: UUID
    experience_years: int
    price_override: Optional[float] = None
    is_active: bool

    class Config:
        from_attributes = True