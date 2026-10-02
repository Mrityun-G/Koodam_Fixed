from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_ORIGINS
from app.database import engine, Base

from app.models.user import User
from app.models.partner import Partner
from app.models.service import Service
from app.models.booking import Booking
from app.models.review import Review
from app.models.emergency import EmergencyRequest
from app.models.partner_service import PartnerService
from app.models.partner_document import PartnerDocument
from app.models.booking_detail import BookingDetail, BookingExtraCharge
from app.models.payout import PartnerPayoutAccount, BookingPayout

from app.routers.user import router as user_router
from app.routers.partner import router as partner_router
from app.routers.service import router as service_router
from app.routers.partner_service import router as partner_service_router
from app.routers.booking import router as booking_router
from app.routers.review import router as review_router
from app.routers.emergency import router as emergency_router
from app.routers.booking_sync import router as booking_sync_router
from app.routers.payment import router as payment_router
from app.routers.payouts import router as payouts_router


app = FastAPI(title="KOODAM Backend")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost",
        "https://localhost",
        *ALLOWED_ORIGINS,
    ],
    # Vite moves to 5174, 5175… when 5173 is busy; allow any local port
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
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
app.include_router(booking_sync_router)
app.include_router(payment_router)
app.include_router(payouts_router)


# Create database tables
Base.metadata.create_all(bind=engine)


# create_all only creates missing tables; add columns introduced later
# to tables that already exist (one round trip for all of them)
with engine.begin() as connection:
    connection.execute(text(
        "ALTER TABLE partners "
        "ADD COLUMN IF NOT EXISTS police_verification_status "
        "VARCHAR NOT NULL DEFAULT 'NOT_SUBMITTED', "
        "ADD COLUMN IF NOT EXISTS police_rejection_reason VARCHAR, "
        "ADD COLUMN IF NOT EXISTS service_radius_km "
        "INTEGER NOT NULL DEFAULT 5; "
        "ALTER TABLE booking_details "
        "ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR, "
        "ADD COLUMN IF NOT EXISTS trust_fee DOUBLE PRECISION, "
        "ADD COLUMN IF NOT EXISTS commission_amount DOUBLE PRECISION, "
        "ADD COLUMN IF NOT EXISTS partner_payout DOUBLE PRECISION"
    ))


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