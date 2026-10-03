import json
import logging
import threading
from pathlib import Path
from typing import Optional

import firebase_admin
from firebase_admin import credentials, db

from app.config import env_setting


# =========================================================
# FIREBASE REALTIME DATABASE (server side)
# The live booking flow runs in Firebase. Phone bookings have no app on
# the customer's side, so the backend writes those bookings itself, with
# a service account (Firebase console > Project settings > Service
# accounts > Generate new private key).
#
#   FIREBASE_SERVICE_ACCOUNT  the key file's JSON, or a path to the file
#   FIREBASE_DATABASE_URL     falls back to VITE_FIREBASE_DATABASE_URL
# =========================================================

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent

_lock = threading.Lock()
_app: Optional[firebase_admin.App] = None


class FirebaseUnavailable(Exception):
    pass


def _firebase_app() -> firebase_admin.App:
    global _app

    with _lock:
        if _app is not None:
            return _app

        raw = env_setting("FIREBASE_SERVICE_ACCOUNT")
        url = env_setting("FIREBASE_DATABASE_URL", "VITE_FIREBASE_DATABASE_URL")

        if not raw or not url:
            raise FirebaseUnavailable(
                "FIREBASE_SERVICE_ACCOUNT and FIREBASE_DATABASE_URL must be set"
            )

        if raw.lstrip().startswith("{"):
            key = json.loads(raw)
        else:
            # A relative path means the backend folder, wherever it runs from
            key = Path(raw)
            key = str(key if key.is_absolute() else BACKEND_DIR / key)

        try:
            certificate = credentials.Certificate(key)
            _app = firebase_admin.initialize_app(
                certificate,
                {"databaseURL": url},
                name="koodam-backend"
            )
        except Exception as error:
            logger.exception("Firebase service account couldn't be loaded")
            raise FirebaseUnavailable(str(error)) from error

        return _app


def rtdb(path: str) -> db.Reference:
    """A reference into the live database. Raises FirebaseUnavailable."""
    return db.reference(path, app=_firebase_app())


def to_db_key(order_id: str) -> str:
    # Same rule as the app: Firebase keys can't contain . # $ [ ]
    return "".join(ch for ch in str(order_id) if ch not in ".#$[]")
