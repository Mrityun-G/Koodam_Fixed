from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class ServiceCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    price: float = 0.0
    duration_minutes: Optional[int] = None
    tag: Optional[str] = None
    # Material Symbols icon name and hex colours for the Home tile
    icon: Optional[str] = None
    bg_color: Optional[str] = None
    icon_color: Optional[str] = None
    sort_order: int = 0


class ServiceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    duration_minutes: Optional[int] = None
    tag: Optional[str] = None
    icon: Optional[str] = None
    bg_color: Optional[str] = None
    icon_color: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class ServiceResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    category: str
    price: float
    duration_minutes: Optional[int] = None
    tag: Optional[str] = None
    icon: Optional[str] = None
    bg_color: Optional[str] = None
    icon_color: Optional[str] = None
    sort_order: int = 0
    is_active: bool

    class Config:
        from_attributes = True
