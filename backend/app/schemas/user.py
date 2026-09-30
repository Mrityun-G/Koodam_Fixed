from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
from datetime import datetime
from typing import Optional

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None

class UserCreate(BaseModel):
    firebase_uid: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    avatar: Optional[str] = None
    role: str = "MEMBER"


class UserResponse(BaseModel):
    id: UUID
    firebase_uid: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    avatar: Optional[str] = None
    role: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True