from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


class ReviewCreate(BaseModel):
    booking_id: UUID
    user_id: UUID
    partner_id: UUID
    rating: int = Field(..., ge=1, le=5)
    feedback: Optional[str] = None


class ReviewResponse(BaseModel):
    id: UUID
    booking_id: UUID
    user_id: UUID
    partner_id: UUID
    rating: int
    feedback: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True