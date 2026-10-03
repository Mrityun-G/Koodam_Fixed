import requests
from fastapi import HTTPException

from app.config import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET


# Payments and transfers are on /v1; Route linked accounts are on /v2
RAZORPAY_API = "https://api.razorpay.com"


def to_paise(rupees: float) -> int:
    return int(round((rupees or 0) * 100))


def razorpay_request(
    method: str,
    path: str,
    payload: dict = None,
    version: str = "v1",
    params: dict = None
) -> dict:
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Razorpay keys are missing on the server"
        )

    try:
        response = requests.request(
            method,
            f"{RAZORPAY_API}/{version}{path}",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json=payload,
            params=params,
            timeout=15
        )
    except requests.RequestException:
        raise HTTPException(
            status_code=502,
            detail="Couldn't reach Razorpay. Please try again."
        )

    if not response.ok:
        try:
            message = response.json()["error"]["description"]
        except (ValueError, KeyError, TypeError):
            message = response.text

        # Razorpay hasn't switched on Route (partner payouts) for the
        # KOODAM account yet; this is on KOODAM's side, not the partner's
        if "route feature not enabled" in str(message).lower():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Bank payouts aren't switched on for KOODAM yet. Your "
                    "earnings are recorded and will be paid once they are. "
                    "Please try adding your bank account again later."
                )
            )

        raise HTTPException(
            status_code=502,
            detail=f"Razorpay error: {message}"
        )

    return response.json()
