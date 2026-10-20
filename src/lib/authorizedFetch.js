import { auth } from './firebase';

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

// Calls the backend as the signed-in user: it sends their Firebase ID
// token, which the backend checks before showing or changing their data.
// Returns the JSON body, or throws with the backend's message.
export const authorizedFetch = async (path, options = {}) => {
  const user = auth?.currentUser;

  if (!user) {
    throw new Error('Please sign in again.');
  }

  const token = await user.getIdToken();

  const response = await fetch(
    path.startsWith('http') ? path : `${BACKEND_URL}${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
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

    throw new Error(detail || `Request failed (${response.status})`);
  }

  return body;
};
