import { auth } from './firebase';
import { BACKEND_URL } from './authorizedFetch';

// Crash reporting.
//
// The app had none: a render error showed a white screen and nobody
// found out. Reports go to KOODAM's own backend rather than a third
// party, so no customer data leaves our infrastructure. The backend
// groups repeats and keeps them in client_errors, and the admin console
// reads them at /admin/client-errors.
//
// Set VITE_SENTRY_DSN to also forward to Sentry; see sendToSentry below.

const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

// Don't report the same fault over and over from one session: a render
// loop could otherwise fire thousands of requests.
const seen = new Set();
const MAX_PER_SESSION = 20;

let sent = 0;
let currentScreen = 'unknown';

// Set from AppContext so a report says which screen they were on
export const setErrorScreen = (screen) => {
  currentScreen = screen || 'unknown';
};

// Noise that says nothing about our code
const IGNORED = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Load failed/i,
  /NetworkError/i,
  /Failed to fetch/i,
  /cancelled/i,
  /The play\(\) request was interrupted/i
];

const shouldIgnore = (message) =>
  !message || IGNORED.some((pattern) => pattern.test(message));

export const reportError = async (error, source = 'window') => {
  try {
    const message = String(
      error?.message || error || 'Unknown error'
    ).slice(0, 500);

    if (shouldIgnore(message) || sent >= MAX_PER_SESSION) {
      return;
    }

    const key = `${source}:${message}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    sent += 1;

    const payload = {
      message,
      stack: String(error?.stack || '').slice(0, 8000) || null,
      source,
      screen: currentScreen,
      app_version: APP_VERSION
    };

    if (import.meta.env.DEV) {
      console.error(`[tracked ${source}]`, error);
    }

    const headers = { 'Content-Type': 'application/json' };

    // Attaches the user when there is one, so a report can be matched to
    // an account - but a crash before sign-in still gets through.
    try {
      const token = await auth?.currentUser?.getIdToken();

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // No token; report anonymously
    }

    await fetch(`${BACKEND_URL}/client-errors`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true
    });

    sendToSentry(payload);

  } catch {
    // Reporting a crash must never cause one
  }
};

// Optional forwarding, using Sentry's plain HTTP envelope endpoint so no
// SDK has to be bundled. Does nothing unless VITE_SENTRY_DSN is set.
const sendToSentry = (payload) => {
  if (!SENTRY_DSN) return;

  try {
    const url = new URL(SENTRY_DSN);
    const projectId = url.pathname.replace('/', '');
    const endpoint =
      `${url.protocol}//${url.host}/api/${projectId}/envelope/` +
      `?sentry_key=${url.username}&sentry_version=7`;

    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      level: 'error',
      release: payload.app_version,
      tags: { screen: payload.screen, source: payload.source },
      exception: {
        values: [{ type: payload.source, value: payload.message }]
      }
    };

    const body =
      `${JSON.stringify({ event_id: event.event_id })}\n` +
      `${JSON.stringify({ type: 'event' })}\n` +
      `${JSON.stringify(event)}\n`;

    fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {
    // A malformed DSN should not break anything
  }
};

// Catches what React's ErrorBoundary cannot see: errors thrown outside
// rendering, and rejected promises nobody handled.
export const startErrorTracking = () => {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    reportError(event.error || new Error(event.message), 'window');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;

    reportError(
      reason instanceof Error ? reason : new Error(String(reason)),
      'promise'
    );
  });
};
