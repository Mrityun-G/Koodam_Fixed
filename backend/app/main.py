from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base

from app.models.user import User
from app.models.partner import Partner
from app.models.service import Service
from app.models.booking import Booking
from app.models.review import Review
from app.models.emergency import EmergencyRequest
from app.models.partner_service import PartnerService

from app.routers.user import router as user_router
from app.routers.partner import router as partner_router
from app.routers.service import router as service_router
from app.routers.partner_service import router as partner_service_router
from app.routers.booking import router as booking_router
from app.routers.review import router as review_router
from app.routers.emergency import router as emergency_router


app = FastAPI(title="KOODAM Backend")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost",
        "https://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register routers
app.include_router(user_router)
app.include_router(partner_router)
app.include_router(service_router)
app.include_router(partner_service_router)
app.include_router(booking_router)
app.include_router(review_router)
app.include_router(emergency_router)


# Create database tables
Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {
        "message": "KOODAM Backend is running!"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.get("/database-test")
def database_test():
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            value = result.scalar()

        return {
            "database": "connected",
            "test": value
        }

    except Exception as e:
        return {
            "database": "connection failed",
            "error": str(e)
        }