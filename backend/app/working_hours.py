"""
A partner's own working hours: which days of the week they work, from
what time to what time, and the dates they are off (leave, festivals).

Customers see these on the partner's card and can only pick booking
times inside them. A partner who has never set any (working_hours is
NULL) can be booked at any of the standard times, as before.

Stored on the partner as JSON:

    working_hours = {"mon": {"start": "09:00", "end": "18:00"},
                     ..., "sun": None}          # None = not working
    days_off      = ["2026-11-14", "2026-11-15"] # YYYY-MM-DD, local

Times are the partner's local clock (India), "HH:MM" on the half hour,
and the end may be "24:00" for work that runs up to midnight.
"""
from datetime import date, datetime, timedelta
import re

DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

# Leave can be planned up to a year ahead; the list stays short
MAX_DAYS_OFF = 60
DAYS_OFF_AHEAD = 366

_TIME = re.compile(r"^([01]\d|2[0-4]):(00|30)$")


def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def clean_working_hours(raw):
    """
    The weekly hours in the stored shape, or None when the partner
    chose no fixed hours. Raises ValueError with a message a partner
    can act on.
    """
    if raw is None:
        return None

    if not isinstance(raw, dict):
        raise ValueError("Working hours are in the wrong format.")

    unknown = set(raw) - set(DAY_KEYS)

    if unknown:
        raise ValueError("Working hours are in the wrong format.")

    cleaned = {}

    for day in DAY_KEYS:
        hours = raw.get(day)

        if not hours:
            cleaned[day] = None
            continue

        start = str(hours.get("start", "")) if isinstance(hours, dict) else ""
        end = str(hours.get("end", "")) if isinstance(hours, dict) else ""

        if not _TIME.match(start) or not _TIME.match(end):
            raise ValueError("Please pick a start and end time for each working day.")

        if start == "24:00" or _minutes(end) > 24 * 60:
            raise ValueError("Please pick a start and end time for each working day.")

        if _minutes(end) - _minutes(start) < 60:
            raise ValueError("Each working day has to be at least one hour long.")

        cleaned[day] = {"start": start, "end": end}

    if not any(cleaned.values()):
        raise ValueError(
            "Pick at least one working day. To stop jobs for now, go offline instead."
        )

    return cleaned


def _earliest_day() -> date:
    # A day behind UTC, so a partner a few hours ahead (India) never
    # loses today's day off to the server's clock
    return (datetime.utcnow() - timedelta(days=1)).date()


def clean_days_off(raw) -> list:
    """Unique, sorted, upcoming YYYY-MM-DD dates. Raises ValueError."""
    if not raw:
        return []

    if len(raw) > MAX_DAYS_OFF:
        raise ValueError(f"You can mark up to {MAX_DAYS_OFF} days off at a time.")

    earliest = _earliest_day()
    latest = earliest + timedelta(days=DAYS_OFF_AHEAD)
    days = set()

    for value in raw:
        try:
            day = date.fromisoformat(str(value))
        except ValueError:
            raise ValueError("One of the days off isn't a date.") from None

        if day > latest:
            raise ValueError("Days off can be planned up to a year ahead.")

        # Days already gone by are dropped rather than refused
        if day >= earliest:
            days.add(day.isoformat())

    return sorted(days)


def upcoming_days_off(days_off) -> list:
    """The stored days off without the ones already gone by."""
    earliest = _earliest_day().isoformat()
    return [day for day in (days_off or []) if day >= earliest]


def working_hours_fields(partner) -> dict:
    """What the apps are sent about a partner's hours."""
    return {
        "working_hours": partner.working_hours or None,
        "days_off": upcoming_days_off(partner.days_off)
    }
