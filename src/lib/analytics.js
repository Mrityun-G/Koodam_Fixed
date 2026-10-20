// Product analytics.
//
// One `track` call that the screens use, with the provider behind it.
// Set VITE_GA_MEASUREMENT_ID to send to Google Analytics 4; leave it
// unset and tracking is off, which is what local development and the
// current builds do. Swapping GA for something else means changing this
// file only, not the forty call sites.
//
// Rules this file keeps to, so analytics never becomes a privacy
// problem of its own:
//   - no names, emails, phone numbers, addresses or exact coordinates
//   - ids only where they are needed to join events, never contact data
//   - nothing at all until a measurement id is configured

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';
const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

export const isAnalyticsEnabled = Boolean(MEASUREMENT_ID);

// Anything that could identify a person, dropped before sending
const BANNED_KEYS = [
  'name', 'email', 'phone', 'address', 'avatar', 'pin', 'otp',
  'lat', 'lng', 'latitude', 'longitude', 'password', 'token'
];

const clean = (properties = {}) =>
  Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      const lower = key.toLowerCase();

      if (BANNED_KEYS.some((banned) => lower.includes(banned))) {
        return false;
      }

      return value !== undefined && value !== null;
    })
  );

let loaded = false;

const loadGtag = () => {
  if (loaded || !MEASUREMENT_ID || typeof document === 'undefined') return;

  loaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {
    app_version: APP_VERSION,
    // The app is one URL; screens are reported through track() instead
    send_page_view: false,
    anonymize_ip: true
  });
};

export const startAnalytics = () => {
  loadGtag();
};

export const track = (event, properties = {}) => {
  const payload = { ...clean(properties), app_version: APP_VERSION };

  if (import.meta.env.DEV) {
    console.debug('[analytics]', event, payload);
    return;
  }

  if (!isAnalyticsEnabled || typeof window === 'undefined' || !window.gtag) {
    return;
  }

  window.gtag('event', event, payload);
};

// Which screen someone is looking at. Called from AppContext whenever
// the screen changes, so the funnel can be followed without URLs.
export const trackScreen = (screen, role) => {
  track('screen_view', { screen_name: screen, role });
};

// The events worth counting: where people drop out of booking, and
// whether partners are getting work.
export const EVENTS = {
  signUpStarted: 'sign_up_started',
  signUpCompleted: 'sign_up_completed',
  loginCompleted: 'login_completed',
  serviceSelected: 'service_selected',
  helperSelected: 'helper_selected',
  bookingRequested: 'booking_requested',
  bookingAccepted: 'booking_accepted',
  bookingCancelled: 'booking_cancelled',
  paymentStarted: 'payment_started',
  paymentCompleted: 'payment_completed',
  reviewSubmitted: 'review_submitted',
  complaintRaised: 'complaint_raised',
  onboardingCompleted: 'onboarding_completed',
  accountDeleted: 'account_deleted'
};
