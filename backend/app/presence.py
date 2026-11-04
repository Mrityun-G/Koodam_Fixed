from datetime import datetime, timedelta

from app.config import PARTNER_PRESENCE_MINUTES
from app.models.partner import Partner


# =========================================================
# PARTNER PRESENCE
# A partner who goes online and then closes the app stays is_online in
# the database - nothing tells the server they left. While online, the
# app checks in every minute (POST /partners/{id}/heartbeat) and stamps
# last_seen_at. A partner is only offered to customers while that stamp
# is recent. Their online choice is never changed here, so the moment
# they open the app again it checks in and they're listed again.
# =========================================================


def presence_cutoff() -> datetime:
    """Partners last seen before this are treated as away."""
    return datetime.utcnow() - timedelta(minutes=PARTNER_PRESENCE_MINUTES)


def mark_seen(partner: Partner) -> None:
    """The caller commits."""
    partner.last_seen_at = datetime.utcnow()


def is_present(partner: Partner) -> bool:
    """Online, and the app has checked in recently."""
    return bool(
        partner.is_online
        and partner.last_seen_at
        and partner.last_seen_at > presence_cutoff()
    )
