import { auth } from './firebase';

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

// Calls the backend as the signed-in user: it sends their Firebase ID
// token, which the backend checks before showing or changing their data.
// Returns the JSON body, or throws with the backend's message.
//
// Pass a FormData body to upload a file: the Content-Type header is left
// off so the browser can set its own multipart boundary.
export const authorizedFetch = async (path, options = {}) => {
  const user = auth?.currentUser;

  if (!user) {
    throw new Error('Please sign in again.');
  }

  const token = await user.getIdToken();
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const response = await fetch(
    path.startsWith('http') ? path : `${BACKEND_URL}${path}`,
    {
      ...options,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    }
  );

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // FastAPI validation errors arrive as a list
    const detail = Array.isArray(body?.detail)
      ? body.detail.map((item) => String(item.msg).replace(/^Value error, /, '')).join(' · ')
      : body?.detail;

    const error = new Error(detail || `Request failed (${response.status})`);
    error.status = response.status;

    throw error;
  }

  return body;
};

// Same thing, but returns null instead of throwing when the record isn't
// there yet — a 404 is a normal answer for "has this synced?" lookups.
export const authorizedFetchOrNull = async (path, options = {}) => {
  try {
    return await authorizedFetch(path, options);
  } catch (error) {
    if (error.status === 404) {
      return null;
    }

    throw error;
  }
};
