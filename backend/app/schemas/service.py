from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class ServiceCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str
    price: float = 0.0
    duration_minutes: Optional[int] = None
    tag: Optional[str] = None


class ServiceResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    category: str
    price: float
    duration_minutes: Optional[int] = None
    tag: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True