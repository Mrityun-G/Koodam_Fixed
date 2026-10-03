import logging
import threading
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import (
    ESCALATIONS_FROM,
    ESCALATION_SWEEP_MINUTES,
    JOB_FINISH_GRACE_HOURS,
    JOB_START_GRACE_HOURS,
    STRIKES_TO_SUSPEND,
    STRIKE_WINDOW_DAYS,
    SUSPENSION_DAYS,
)
from app.database import SessionLocal
from app.models.booking import Booking
from app.models.escalation import Complaint, PartnerEscalation
from app.models.partner import Partner


# =========================================================
# PARTNER ESCALATIONS
# A partner's first escalation in STRIKE_WINDOW_DAYS is a warning; the
# rest are strikes. STRIKES_TO_SUSPEND strikes in that window hide the
# partner from customers for SUSPENSION_DAYS. Every escalation also
# lowers their reliability score (see Partner.reliability_score).
# =========================================================

logger = logging.getLogger(__name__)

WARNING = "WARNING"
STRIKE = "STRIKE"


def _active_since(db: Session, partner_id, days: float, severity: str = None):
    query = db.query(PartnerEscalation).filter(
        PartnerEscalation.partner_id == partner_id,
        PartnerEscalation.status == "ACTIVE",
        PartnerEscalation.created_at > datetime.utcnow() - timedelta(days=days)
    )

    if severity:
        query = query.filter(PartnerEscalation.severity == severity)

    return query


def is_suspended(partner: Partner) -> bool:
    return bool(
        partner.suspended_until and partner.suspended_until > datetime.utcnow()
    )


def refresh_suspension(db: Session, partner: Partner, new_strike: bool):
    """
    Suspend the partner when a new strike takes them to the limit, and
    lift the suspension if an overturn takes them back under it.
    """
    strikes = _active_since(db, partner.id, STRIKE_WINDOW_DAYS, STRIKE).count()

    if strikes < STRIKES_TO_SUSPEND:
        if is_suspended(partner):
            partner.suspended_until = None
    elif new_strike and not is_suspended(partner):
        partner.suspended_until = (
            datetime.utcnow() + timedelta(days=SUSPENSION_DAYS)
        )
        # Stop new requests reaching them straight away
        partner.is_online = False


def penalize(
    db: Session,
    partner: Partner,
    source: str,
    reason: str,
    booking_id=None,
    complaint_id=None,
    severity: Optional[str] = None
) -> Optional[PartnerEscalation]:
    """
    Record an escalation on the partner. Returns None if this job was
    already escalated for the same reason. The caller commits.
    """
    if severity not in (WARNING, STRIKE):
        earlier = _active_since(db, partner.id, STRIKE_WINDOW_DAYS).count()
        severity = WARNING if earlier == 0 else STRIKE

    escalation = PartnerEscalation(
        partner_id=partner.id,
        booking_id=booking_id,
        complaint_id=complaint_id,
        source=source,
        severity=severity,
        reason=reason
    )

    # A savepoint, so a duplicate only undoes this escalation
    try:
        with db.begin_nested():
            db.add(escalation)
    except IntegrityError:
        return None

    refresh_suspension(db, partner, new_strike=severity == STRIKE)

    return escalation


def _escalations_start() -> datetime:
    try:
        return datetime.fromisoformat(ESCALATIONS_FROM)
    except ValueError:
        return datetime.utcnow()


def _overdue_jobs(db: Session, status: str, source: str, grace_hours: float):
    # Jobs in this state past the grace period, not yet escalated for it
    return (
        db.query(Booking, Partner)
        .join(Partner, Partner.id == Booking.partner_id)
        .outerjoin(
            PartnerEscalation,
            and_(
                PartnerEscalation.booking_id == Booking.id,
                PartnerEscalation.source == source
            )
        )
        .filter(
            Booking.status == status,
            Booking.booking_time >= _escalations_start(),
            Booking.booking_time
            < datetime.utcnow() - timedelta(hours=grace_hours),
            PartnerEscalation.id.is_(None)
        )
        .all()
    )


def sweep(db: Session) -> int:
    """Escalate overdue jobs and unanswered complaints. Returns how many."""
    count = 0

    for booking, partner in _overdue_jobs(
        db, "ACCEPTED", "JOB_NOT_STARTED", JOB_START_GRACE_HOURS
    ):
        if penalize(
            db, partner, "JOB_NOT_STARTED",
            f"Accepted job not started within {JOB_START_GRACE_HOURS:g} "
            "hours of the booked time.",
            booking_id=booking.id
        ):
            count += 1

    for booking, partner in _overdue_jobs(
        db, "IN_PROGRESS", "JOB_NOT_FINISHED", JOB_FINISH_GRACE_HOURS
    ):
        if penalize(
            db, partner, "JOB_NOT_FINISHED",
            f"Job not finished within {JOB_FINISH_GRACE_HOURS:g} "
            "hours of the booked time.",
            booking_id=booking.id
        ):
            count += 1

    unanswered = (
        db.query(Complaint, Partner)
        .join(Partner, Partner.id == Complaint.partner_id)
        .filter(
            Complaint.status == "OPEN",
            Complaint.respond_by < datetime.utcnow()
        )
        .all()
    )

    for complaint, partner in unanswered:
        complaint.status = "ESCALATED"
        complaint.closed_at = datetime.utcnow()

        if penalize(
            db, partner, "COMPLAINT_UNANSWERED",
            "Didn't reply to a customer's complaint in time.",
            booking_id=complaint.booking_id,
            complaint_id=complaint.id
        ):
            count += 1

    db.commit()

    return count


def safe_sweep(db: Session):
    # Never let the checks break the request that triggered them
    try:
        sweep(db)
    except Exception:
        db.rollback()
        logger.exception("Escalation sweep failed")


def start_sweeper():
    """Run the checks every ESCALATION_SWEEP_MINUTES in the background."""
    stop = threading.Event()

    def loop():
        while not stop.is_set():
            db = SessionLocal()
            try:
                safe_sweep(db)
            finally:
                db.close()

            stop.wait(ESCALATION_SWEEP_MINUTES * 60)

    threading.Thread(target=loop, name="escalation-sweeper", daemon=True).start()

    return stop
