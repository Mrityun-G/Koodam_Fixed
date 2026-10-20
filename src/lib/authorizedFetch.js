import { auth } from './firebase';

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

// A release build that fell back to localhost, or that points at a private
// address, reaches nothing from a real phone: every call then hangs until it
// times out and the app looks frozen. Say so loudly at startup rather than
// letting it be discovered one stuck screen at a time.
if (import.meta.env.PROD && /\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(BACKEND_URL)) {
  console.error(
    `[GigEzee] VITE_BACKEND_URL is "${BACKEND_URL}" - a local address. ` +
    'This build can only reach the backend from the same network. ' +
    'Set VITE_BACKEND_URL to the public backend URL and rebuild.'
  );
}

// Measured 2026-10-20: koodam-api on Render's free plan answers in ~1.2s
// warm, but takes 64s when it has slept (~15 min idle). The timeout has to
// clear that, or the first call after a quiet spell is cancelled just before
// it would have succeeded. It still bounds a request to an unreachable
// address, which otherwise hangs for as long as the phone allows.
const DEFAULT_TIMEOUT_MS = 90000;

// Calls the backend as the signed-in user: it sends their Firebase ID
// token, which the backend checks before showing or changing their data.
// Returns the JSON body, or throws with the backend's message.
export const authorizedFetch = async (path, options = {}) => {
  const user = auth?.currentUser;

  if (!user) {
    throw new Error('Please sign in again.');
  }

  const token = await user.getIdToken();

  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;

  // Give up on our own terms. Without this the request sits open for as
  // long as the platform allows, which on Android can be minutes.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Respect a caller that wants to cancel early (e.g. a screen unmounting)
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let response;

  try {
    response = await fetch(
      path.startsWith('http') ? path : `${BACKEND_URL}${path}`,
      {
        ...rest,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {})
        }
      }
    );
  } catch (failure) {
    // A caller that cancelled deliberately wants its own error through
    if (signal?.aborted) {
      throw failure;
    }

    if (failure.name === 'AbortError') {
      throw new Error("GigEzee is taking too long to answer. Please try again.");
    }

    throw new Error("Couldn't reach GigEzee. Please check your connection.");
  } finally {
    clearTimeout(timer);
  }

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
