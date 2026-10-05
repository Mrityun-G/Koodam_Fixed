from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_ORIGINS
from app.database import engine, Base, SessionLocal

from app.models.user import User
from app.models.partner import Partner
from app.models.service import Service
from app.models.booking import Booking
from app.models.review import Review
from app.models.emergency import EmergencyRequest
from app.models.partner_service import PartnerService
from app.models.partner_document import PartnerDocument
from app.models.booking_detail import BookingDetail, BookingExtraCharge
from app.models.payout import PartnerPayoutAccount, BookingPayout, PartnerWithdrawal
from app.models.escalation import Complaint, PartnerEscalation
from app.models.photo import Photo
from app.models.notification import Notification
from app.models.app_config import AppConfig

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
from app.routers.escalations import router as escalations_router
from app.routers.ivr import router as ivr_router
from app.routers.photo import router as photo_router
from app.routers.me import router as me_router
from app.routers.app_config import router as app_config_router

from app.app_config import seed_app_config

from app.escalations import start_sweeper
from app.service_catalog import sync_service_catalog


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
app.include_router(escalations_router)
app.include_router(ivr_router)
app.include_router(photo_router)
app.include_router(me_router)
app.include_router(app_config_router)


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
        "INTEGER NOT NULL DEFAULT 5, "
        "ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP, "
        "ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP, "
        "ADD COLUMN IF NOT EXISTS deactivation_reason VARCHAR; "
        "ALTER TABLE booking_details "
        "ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR, "
        "ADD COLUMN IF NOT EXISTS trust_fee DOUBLE PRECISION, "
        "ADD COLUMN IF NOT EXISTS commission_amount DOUBLE PRECISION, "
        "ADD COLUMN IF NOT EXISTS partner_payout DOUBLE PRECISION, "
        "ADD COLUMN IF NOT EXISTS repair_photo_url VARCHAR, "
        "ADD COLUMN IF NOT EXISTS source VARCHAR, "
        "ADD COLUMN IF NOT EXISTS payment_method VARCHAR; "
        "ALTER TABLE booking_extra_charges "
        "ADD COLUMN IF NOT EXISTS photo_url VARCHAR; "
        "ALTER TABLE booking_payouts "
        "ADD COLUMN IF NOT EXISTS withdrawal_id UUID "
        "REFERENCES partner_withdrawals(id); "
        "CREATE INDEX IF NOT EXISTS ix_booking_payouts_withdrawal_id "
        "ON booking_payouts (withdrawal_id); "
        "ALTER TABLE partner_withdrawals "
        "ADD COLUMN IF NOT EXISTS razorpay_payout_id VARCHAR; "
        "ALTER TABLE users "
        "ADD COLUMN IF NOT EXISTS language VARCHAR NOT NULL DEFAULT 'en', "
        "ADD COLUMN IF NOT EXISTS notifications_enabled "
        "BOOLEAN NOT NULL DEFAULT true; "
        "ALTER TABLE services "
        "ADD COLUMN IF NOT EXISTS icon VARCHAR, "
        "ADD COLUMN IF NOT EXISTS bg_color VARCHAR, "
        "ADD COLUMN IF NOT EXISTS icon_color VARCHAR, "
        "ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0"
    ))


# Services match the tiles customers see on Home; fees, limits and app
# text get their first values
with SessionLocal() as db:
    sync_service_catalog(db)
    seed_app_config(db)


# Look for overdue jobs and unanswered complaints while the server runs
@app.on_event("startup")
def run_escalation_checks():
    start_sweeper()


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