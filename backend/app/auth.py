import time
from typing import Optional

import jwt
import requests
from cryptography.x509 import load_pem_x509_certificate
from fastapi import Header, HTTPException

from app.config import FIREBASE_PROJECT_ID


# =========================================================
# FIREBASE ID TOKENS
# Every app user signs in to Firebase, and the app sends that ID token as
# "Authorization: Bearer <token>". Checking it here proves which Firebase
# account made the request, so (for example) only the partner can change
# where their own money is paid.
# =========================================================

GOOGLE_CERTS_URL = (
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com"
)

# Google rotates these keys; the response says how long to cache them
_certs = {"keys": {}, "expires_at": 0.0}


def _signing_certs() -> dict:
    if time.time() < _certs["expires_at"] and _certs["keys"]:
        return _certs["keys"]

    try:
        response = requests.get(GOOGLE_CERTS_URL, timeout=10)
        response.raise_for_status()
    except requests.RequestException:
        raise HTTPException(
            status_code=503,
            detail="Couldn't check your sign-in right now. Please try again."
        )

    max_age = 3600

    for part in response.headers.get("Cache-Control", "").split(","):
        part = part.strip()

        if part.startswith("max-age="):
            try:
                max_age = int(part.split("=", 1)[1])
            except ValueError:
                pass

    _certs["keys"] = response.json()
    _certs["expires_at"] = time.time() + max_age

    return _certs["keys"]


def verify_firebase_token(token: str) -> dict:
    if not FIREBASE_PROJECT_ID:
        raise HTTPException(
            status_code=500,
            detail="FIREBASE_PROJECT_ID is missing on the server"
        )

    try:
        key_id = jwt.get_unverified_header(token).get("kid")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid sign-in token")

    cert = _signing_certs().get(key_id)

    if not cert:
        raise HTTPException(status_code=401, detail="Invalid sign-in token")

    public_key = load_pem_x509_certificate(cert.encode()).public_key()

    try:
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}",
            leeway=60
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Your sign-in has expired. Please sign in again."
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid sign-in token")

    if not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid sign-in token")

    return claims


def current_firebase_uid(
    authorization: Optional[str] = Header(default=None)
) -> str:
    """FastAPI dependency: the Firebase uid of the signed-in caller."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Please sign in first")

    return verify_firebase_token(authorization.split(" ", 1)[1].strip())["sub"]
