"""
GST on a customer's bill.

GigEzee may only charge GST once it is registered, so tax is in force
only while staff have entered a GSTIN in the admin settings; until then
the rate is 0 and bills carry no tax. The rate is added on top of the
whole bill (service price, trust fee and approved extra parts) and split
equally into CGST and SGST, since a job is always within one state.

A booking keeps the rate it was made with, so changing the setting
never alters a bill that is already running.

Same arithmetic as src/lib/tax.js: whole paise, halves rounded up.
"""

import math
import re
from typing import Optional

from app.app_config import setting, text_setting
from app.models.booking_detail import BookingDetail

GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


def is_valid_gstin(value: str) -> bool:
    return bool(GSTIN_PATTERN.match(value or ""))


def gst_in_force() -> tuple:
    """(rate charged on new bookings, GSTIN); (0.0, "") until registered."""
    gstin = text_setting("gstin")

    if not gstin:
        return 0.0, ""

    return setting("gst_percent"), gstin


def _to_paise(rupees: float) -> int:
    return int(math.floor(float(rupees or 0) * 100 + 0.5))


def gst_lines(taxable: float, percent: float) -> dict:
    """CGST and SGST (each half the rate) on top of `taxable` rupees."""
    half_paise = int(math.floor(_to_paise(taxable) * float(percent or 0) / 200 + 0.5))
    taxable_paise = _to_paise(taxable)

    return {
        "taxable": taxable_paise / 100,
        "cgst": half_paise / 100,
        "sgst": half_paise / 100,
        "tax": 2 * half_paise / 100,
        "total": (taxable_paise + 2 * half_paise) / 100,
    }


def booking_tax(detail: Optional[BookingDetail]) -> float:
    """The GST recorded on a booking, in rupees (0 for untaxed ones)."""
    if detail is None:
        return 0.0

    return round((detail.cgst_amount or 0.0) + (detail.sgst_amount or 0.0), 2)


def tax_problem(total: float, percent: float, cgst: float, sgst: float) -> Optional[str]:
    """Why the GST a device sent doesn't add up, or None when it does."""
    if not 0 <= percent <= 28:
        return "GST rate must be between 0 and 28%"

    if cgst < 0 or sgst < 0 or abs(cgst - sgst) > 0.01:
        return "CGST and SGST must be equal"

    expected = gst_lines(total - cgst - sgst, percent)

    if abs(expected["tax"] - (cgst + sgst)) > 0.02:
        return "GST doesn't match the bill"

    return None
