"""
Uploading files to Supabase Storage from the backend.

The app used to upload avatars straight from the browser with the anon
key. That could not be secured: people sign in to KOODAM with Firebase,
so Supabase sees no session, `auth.uid()` is null, and any storage policy
tight enough to stop a stranger would also stop the real user. Uploading
here instead means the Firebase token is checked first and the bucket can
refuse every write that doesn't come from this server.
"""

import mimetypes
from typing import Optional

import requests

from app.config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL


class StorageUnavailable(RuntimeError):
    """Supabase storage isn't configured, or wouldn't take the file."""


def is_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def upload(
    bucket: str,
    path: str,
    data: bytes,
    content_type: Optional[str] = None,
    upsert: bool = True
) -> str:
    """Store `data` at `path` and return the URL it can be read from."""
    if not is_configured():
        raise StorageUnavailable(
            "File storage isn't set up on the server yet."
        )

    content_type = (
        content_type
        or mimetypes.guess_type(path)[0]
        or "application/octet-stream"
    )

    endpoint = f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{bucket}/{path}"

    try:
        response = requests.post(
            endpoint,
            data=data,
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": content_type,
                # Replaces the previous file instead of erroring, so a
                # member can change their photo more than once
                "x-upsert": "true" if upsert else "false",
            },
            timeout=30
        )
    except requests.RequestException as error:
        raise StorageUnavailable(
            "Couldn't reach file storage. Please try again."
        ) from error

    if response.status_code >= 400:
        raise StorageUnavailable(
            f"File storage refused the upload ({response.status_code})."
        )

    return public_url(bucket, path)


def public_url(bucket: str, path: str) -> str:
    return f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{bucket}/{path}"


def remove(bucket: str, path: str) -> None:
    """Best-effort delete; a leftover file is not worth failing a request."""
    if not is_configured():
        return

    try:
        requests.delete(
            f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{bucket}/{path}",
            headers={"Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"},
            timeout=15
        )
    except requests.RequestException:
        pass
