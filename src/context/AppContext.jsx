import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef
} from 'react';

import { ref, onValue, set, update, remove, push, get } from 'firebase/database';

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential
} from 'firebase/auth';

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';

import {
  db,
  auth,
  storage,
  isFirebaseConfigured,
  isStorageConfigured
} from '../lib/firebase';

import {
  haversineDistanceKm,
  estimateEtaMinutes
} from '../lib/geo';

import {
  DEFAULT_JOB_MINUTES,
  findClash,
  jobsToTimeRanges,
  toTimeRanges
} from '../lib/schedule';

import {
  supabase,
  isOAuthReturn,
  oauthReturnError
} from '../lib/supabase';

// Which login page (member or partner) started a Google sign-in; kept in
// storage because Google redirects away from the app and back
const GOOGLE_ROLE_KEY = 'koodam-google-login-role';

// Which side of the app (member or partner) the user was last using
const LAST_ROLE_KEY = 'koodam-last-role';

// Starting state, also restored on logout so the next person to log in
// on this device never sees the previous user's profile, job or chat
const EMPTY_MEMBER_PROFILE = {
  id: null,
  firebase_uid: null,
  name: '',
  email: '',
  phone: '',
  avatar: '',
  role: 'MEMBER'
};

const EMPTY_PARTNER_PROFILE = {
  ...EMPTY_MEMBER_PROFILE,
  role: 'PARTNER'
};

const EMPTY_ORDER = {
  orderId: null,

  helperName: '',
  serviceTitle: '',

  safetyPin: null,
  completionOtp: null,

  currentStep: 0,
  etaMinutes: null,
  etaTime: '',

  currentRoad: '',
  totalPaid: 0,
  totalAmount: 0,
  paymentStatus: 'PENDING',
  status: 'PENDING',

  trafficCondition: '',

  rating: null,
  feedback: ''
};

// Screens shown before login; a restored login moves past these
const SIGNED_OUT_SCREENS = [
  'landing',
  'welcome',
  'memberLogin',
  'memberSignup',
  'partnerLogin',
  'partnerSignup'
];


const AppContext = createContext(null);

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";


// Member's service address — live ETA/distance is measured against this point.
// Defaults to Indiranagar, Bengaluru; replace with the real booking address.
const DESTINATION_COORDS = {
  lat: 12.9784,
  lng: 77.6408
};


// Firebase Realtime Database keys can't contain ".", "#", "$", "[", "]"
// Order IDs like "#KD-8924" need stripping.
const toDbKey = (orderId) =>
  String(orderId).replace(/[.#$[\]]/g, '');


// Arrival and completion codes rotate while they are on screen, so a code
// that was seen or overheard earlier stops working. The phone showing the
// code replaces it every OTP_ROTATE_MS; the one just replaced still works
// for OTP_GRACE_MS so a code read out right at the switch isn't rejected.
const OTP_ROTATE_MS = 60 * 1000;
const OTP_GRACE_MS = 30 * 1000;

// Field names on the order for each code
const ARRIVAL_OTP = {
  code: 'safetyPin',
  previous: 'previousSafetyPin',
  expiresAt: 'safetyPinExpiresAt'
};

const COMPLETION_OTP = {
  code: 'completionOtp',
  previous: 'previousCompletionOtp',
  expiresAt: 'completionOtpExpiresAt'
};

const generateOtp = () => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(1000 + (value[0] % 9000));
};

// A new code, keeping the old one for the grace period
const freshOtpFields = (fields, previousCode = null) => ({
  [fields.code]: generateOtp(),
  [fields.previous]: previousCode,
  [fields.expiresAt]: Date.now() + OTP_ROTATE_MS
});

const otpMatches = (order, fields, code) => {
  if (!order || !code) return false;

  if (String(order[fields.code] ?? '') === code) {
    return true;
  }

  // The previous code was replaced when the current one was issued
  const issuedAt =
    Number(order[fields.expiresAt] || 0) - OTP_ROTATE_MS;

  return (
    Boolean(order[fields.previous]) &&
    String(order[fields.previous]) === code &&
    Date.now() - issuedAt <= OTP_GRACE_MS
  );
};


// Turns the booking screen's labels (e.g. "Tomorrow 1" and
// "10:30 AM - 11:30 AM") into a timestamp for the start of the visit.
// The date label ends with a day of the month within the next 31 days.
const getScheduledTimestamp = (dateLabel, timeLabel) => {
  const dayOfMonth = Number(String(dateLabel || '').match(/(\d{1,2})\s*$/)?.[1]);
  const time = String(timeLabel || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);

  if (!dayOfMonth || !time) {
    return null;
  }

  const today = new Date();

  for (let offset = 0; offset <= 31; offset += 1) {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset
    );

    if (date.getDate() === dayOfMonth) {
      let hours = Number(time[1]) % 12;
      const meridiem = (time[3] || '').toUpperCase();

      if (meridiem === 'PM') {
        hours += 12;
      } else if (!meridiem) {
        hours = Number(time[1]);
      }

      date.setHours(hours, Number(time[2]), 0, 0);
      return date.getTime();
    }
  }

  return null;
};


// Error codes that mean the Firebase project itself isn't fully set up.
const AUTH_SETUP_ERROR_CODES = [
  'auth/configuration-not-found',
  'auth/operation-not-allowed',
  'auth/invalid-api-key',
  'auth/api-key-not-valid',
  'auth/project-not-found'
];

const isAuthSetupError = (err) =>
  AUTH_SETUP_ERROR_CODES.includes(err?.code);


// Translates Firebase Auth error codes into friendly user-facing copy.
const authErrorMessage = (err) => {
  const code = err?.code || '';

  if (code.includes('email-already-in-use')) {
    return 'That email is already registered — try logging in instead.';
  }

  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found')
  ) {
    return 'Incorrect email or password.';
  }

  if (code.includes('weak-password')) {
    return 'Password should be at least 6 characters.';
  }

  if (code.includes('invalid-email')) {
    return 'Please enter a valid email address.';
  }

  if (code.includes('too-many-requests')) {
    return 'Too many attempts. Please try again in a moment.';
  }

  return err?.message || 'Something went wrong. Please try again.';
};


export const AppProvider = ({ children }) => {

  // =========================================================
  // Navigation & Role State
  // =========================================================

  const [role, setRole] = useState('welcome');

  const [currentScreen, setCurrentScreen] = useState('landing');

  // Latest screen, readable inside long-lived listeners
  const currentScreenRef = useRef(currentScreen);

  useEffect(() => {
    currentScreenRef.current = currentScreen;
  }, [currentScreen]);

  const [activeTab, setActiveTab] = useState('home');

  // Remembered across reloads; the app is translated from this in App.jsx
  const [language, setLanguage] = useState(() => {
    try {
      const saved = localStorage.getItem('koodam-language');
      return ['en', 'ta', 'kn'].includes(saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('koodam-language', language);
    } catch {
      // Storage can be unavailable (e.g. private mode); the choice then lasts this session
    }

    document.documentElement.lang = language;
  }, [language]);

  const [location, setLocation] =
    useState('Indiranagar, Bengaluru');

  const [isLocationModalOpen, setIsLocationModalOpen] =
    useState(false);


  // =========================================================
  // Auth State
  // =========================================================

  const [authUser, setAuthUser] = useState(null);

  const [authLoading, setAuthLoading] =
    useState(false);


  // =========================================================
  // Partner KYC
  // =========================================================

  const [partnerKyc, setPartnerKyc] = useState(null);


  // =========================================================
  // Firebase Auth Listener
  // =========================================================

useEffect(() => {
  if (!isFirebaseConfigured || !auth) return;

  const unsubscribe = onAuthStateChanged(
    auth,
    async (user) => {

      setAuthUser(user);

      // No logged-in Firebase user
      if (!user) {
        return;
      }

      try {

        const response = await fetch(
          `${BACKEND_URL}/users/firebase/${user.uid}`
        );

        if (!response.ok) {

          console.warn(
            'Backend profile not found for Firebase user'
          );

          return;
        }

        const backendUser = await response.json();

        // -------------------------------------------------
        // MEMBER
        // -------------------------------------------------

        if (backendUser.role === 'MEMBER') {

          setUserProfile((previous) => ({
            ...previous,
            ...backendUser
          }));

        }

        // -------------------------------------------------
        // PARTNER / WORKER
        // -------------------------------------------------

        if (backendUser.role === 'PARTNER') {

          setPartnerProfile((previous) => ({
            ...previous,
            ...backendUser
          }));

        }

        // -------------------------------------------------
        // Still logged in after a page reload: go back to the
        // member home or Partner Hub instead of the landing page
        // -------------------------------------------------

        let lastRole = null;

        try {
          lastRole = localStorage.getItem(LAST_ROLE_KEY);
        } catch {
          lastRole = null;
        }

        const restoredRole =
          lastRole === 'partner' || lastRole === 'member'
            ? lastRole
            : backendUser.role === 'PARTNER'
              ? 'partner'
              : 'member';

        if (restoredRole === 'partner') {
          setPartnerProfile((previous) => ({ ...previous, ...backendUser }));
        } else {
          setUserProfile((previous) => ({ ...previous, ...backendUser }));
        }

        if (SIGNED_OUT_SCREENS.includes(currentScreenRef.current)) {
          setRole(restoredRole);
          setActiveTab('home');
          setCurrentScreen(restoredRole === 'partner' ? 'partner' : 'home');
        }

      } catch (error) {

        console.error(
          'Failed to load user profile:',
          error
        );
      }
    }
  );

  return () => unsubscribe();

}, []);

// =========================================================
// Member Profile
// =========================================================

const [userProfile, setUserProfile] = useState(EMPTY_MEMBER_PROFILE);


// =========================================================
// Service Partner Profile
// =========================================================

const [partnerProfile, setPartnerProfile] = useState(EMPTY_PARTNER_PROFILE);

const [notificationsEnabled, setNotificationsEnabled] =
  useState(true);


  // =========================================================
  // Helper & Booking State
  // =========================================================

  const [selectedHelper, setSelectedHelper] = useState({
  id: null,
  name: '',
  title: '',
  rating: 0,
  reviewsCount: 0,
  completionRate: '',
  distance: '',
  experience: '',
  avatar: '',
  hourlyRate: 0,
  vehicle: '',
  phone: ''
});


  const [selectedService, setSelectedService] = useState({
    id: 2,
    title: 'Emergency Short Circuit Diagnostic',
    price: 399,
    duration: '~45 mins',
    tag: 'POPULAR',
    desc: 'Line leakage, spark identification & testing'
  });


  // Defaults to today with no time, so the customer must pick a free slot
  const [selectedDate, setSelectedDate] =
    useState(() => `Today ${new Date().getDate()}`);

  const [selectedTime, setSelectedTime] =
    useState('');

  const [trustFee] = useState(20);


// =========================================================
// Active Order / Live Tracking
// =========================================================

const [activeOrder, setActiveOrder] = useState(EMPTY_ORDER);

  // =========================================================
  // Firebase Active Order Listener
  // =========================================================

  // Read inside Firebase callbacks, which would otherwise see a stale role
  const roleRef = useRef(role);
  roleRef.current = role;

  // Last order state seen from Firebase, used to detect status changes
  const lastOrderSnapshotRef = useRef(null);

  // Status changes are made on the partner's device, so the member's
  // notifications must be raised here, when the change arrives via Firebase.
  const notifyMemberOfOrderChange = (previous, next) => {
    const helperName = next.helperName || 'Your partner';
    const serviceTitle = next.serviceTitle || 'your service';

    if (
      next.bookingStatus !== previous.bookingStatus &&
      next.bookingStatus === 'ACCEPTED'
    ) {
      addNotification('member', {
        title: 'Booking Accepted!',
        desc: `${helperName} accepted your request for ${serviceTitle}.`,
        screen: 'tracking',
        tab: 'requests'
      });
      showToast(`${helperName} accepted your booking!`);
    }

    if (
      next.bookingStatus !== previous.bookingStatus &&
      next.bookingStatus === 'DECLINED'
    ) {
      addNotification('member', {
        title: 'Booking Declined',
        desc: `${helperName} declined your request.`
      });
      showToast(`${helperName} declined your booking.`);
    }

    if (
      next.bookingStatus !== previous.bookingStatus &&
      next.bookingStatus === 'EXPIRED'
    ) {
      addNotification('member', {
        title: 'No Response from Partner',
        desc: `${helperName} didn't respond in time. Please book another helper.`
      });
      showToast(`${helperName} didn't respond in time.`);
    }

    Object.entries(next.extraCharges || {})
      .filter(
        ([chargeId, charge]) =>
          charge.status === 'PENDING' &&
          !previous.chargeIds?.includes(chargeId)
      )
      .forEach(([, charge]) => {
        addNotification('member', {
          title: 'Extra Cost Needs Approval',
          desc: `${helperName} needs ${charge.item} (₹${charge.amount}). Approve or decline it on the Requests screen.`,
          screen: 'tracking',
          tab: 'requests'
        });
        showToast(`Extra cost requested: ${charge.item} ₹${charge.amount}`);
      });

    if (
      next.currentStep === 4 &&
      (previous.currentStep ?? 0) < 4
    ) {
      addNotification('member', {
        title: 'Work Started',
        desc: `${helperName} verified your arrival code and has started the service.`,
        screen: 'tracking',
        tab: 'requests'
      });
    }
  };

  // Last order payload sent to the backend, so unchanged snapshots are skipped
  const lastSyncedOrderRef = useRef(null);

  // Incremented after each successful sync so dependent data can reload
  const [backendSyncVersion, setBackendSyncVersion] = useState(0);

  // Keep a permanent copy of the order in Supabase (via the backend).
  // Firebase stays the live source; a failed sync never blocks the app.
  const syncOrderToBackend = (orderId, order) => {
    const payload = {
      firebase_order_id: String(orderId),
      customer_id: order.customerId || null,
      partner_id: order.partnerId || null,
      service_id: order.serviceId || null,
      booking_status: order.bookingStatus || order.status || null,
      current_step: Number.isFinite(order.currentStep)
        ? order.currentStep
        : null,
      address: order.area || null,
      latitude: order.customerLat ?? null,
      longitude: order.customerLng ?? null,
      total_amount: Number(order.totalAmount || 0),
      // The arrival code rotates every minute; storing it would only
      // trigger a sync per rotation and keep a stale secret around
      safety_pin: null,
      payment_status: order.paymentStatus || null,
      amount_paid: Number(order.totalPaid || 0),
      razorpay_payment_id: order.paymentId || null,
      scheduled_at: order.scheduledAt || null,
      created_at: order.createdAt || null,
      accepted_at: order.acceptedAt || null,
      completed_at: order.completedAt || null,
      paid_at: order.paidAt || null,
      extra_charges: Object.entries(order.extraCharges || {}).map(
        ([chargeId, charge]) => ({
          firebase_charge_id: chargeId,
          item: charge.item,
          amount: Number(charge.amount || 0),
          status: charge.status || 'PENDING',
          created_at: charge.createdAt || null,
          responded_at: charge.respondedAt || null
        })
      ),
      rating: order.rating ? Number(order.rating) : null,
      feedback: order.feedback || null
    };

    const serialized = JSON.stringify(payload);

    if (lastSyncedOrderRef.current === serialized) {
      return;
    }

    lastSyncedOrderRef.current = serialized;

    fetch(`${BACKEND_URL}/bookings/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          console.warn(
            'Booking sync to backend failed:',
            error?.detail || response.status
          );
          // Allow the same data to be retried on the next change
          lastSyncedOrderRef.current = null;
          return;
        }

        // Let the partner overview reload the new numbers
        setBackendSyncVersion((version) => version + 1);
      })
      .catch((error) => {
        console.warn('Booking sync to backend failed:', error);
        lastSyncedOrderRef.current = null;
      });
  };

  useEffect(() => {
    // Firebase only allows signed-in users; stop listening after logout
    if (
      !isFirebaseConfigured ||
      !db ||
      !authUser?.uid ||
      !activeOrder.orderId
    ) {
      return;
    }

    const orderRef = ref(
      db,
      `orders/${toDbKey(activeOrder.orderId)}`
    );

    // The first snapshot is the baseline; only later changes notify
    lastOrderSnapshotRef.current = null;

    const unsubscribe = onValue(
      orderRef,
      (snapshot) => {
        const val = snapshot.val();

        if (val) {
          if (
            lastOrderSnapshotRef.current &&
            roleRef.current !== 'partner'
          ) {
            notifyMemberOfOrderChange(
              lastOrderSnapshotRef.current,
              val
            );
          }

          lastOrderSnapshotRef.current = {
            bookingStatus: val.bookingStatus,
            currentStep: val.currentStep,
            chargeIds: Object.keys(val.extraCharges || {})
          };

          syncOrderToBackend(activeOrder.orderId, val);

          setActiveOrder((prev) => ({
            ...prev,
            ...val
          }));
        }
      },
      (error) => {
        console.warn('Order listener stopped:', error.message);
      }
    );

    return () => unsubscribe();
  }, [activeOrder.orderId, authUser?.uid]);


  // =========================================================
  // Update Active Order
  // =========================================================

  const updateActiveOrder = (patch) => {
    // Keep local UI state and the shared Firebase order synchronized.
    setActiveOrder((prev) => ({
      ...prev,
      ...patch
    }));

    if (
      isFirebaseConfigured &&
      db &&
      (patch.orderId || activeOrder.orderId)
    ) {
      const orderId =
        patch.orderId || activeOrder.orderId;

      update(
        ref(
          db,
          `orders/${toDbKey(orderId)}`
        ),
        patch
      ).catch((error) => {
        console.error(
          '❌ Failed to update Firebase order:',
          error
        );
      });
    }
  };

  const activeOrderRef = useRef(activeOrder);
  activeOrderRef.current = activeOrder;

  // Rotate the code shown on this phone: the customer holds the arrival
  // code until work starts, the partner holds the completion code while
  // the job is in progress.
  const otpHolderFields =
    role !== 'partner' &&
    activeOrder.bookingStatus === 'ACCEPTED' &&
    Number(activeOrder.currentStep || 0) < 4
      ? ARRIVAL_OTP
      : role === 'partner' &&
        activeOrder.currentStep === 4
        ? COMPLETION_OTP
        : null;

  useEffect(() => {
    if (!otpHolderFields || !activeOrder.orderId) {
      return;
    }

    const rotateIfDue = () => {
      const order = activeOrderRef.current;

      if (
        Date.now() <
        Number(order[otpHolderFields.expiresAt] || 0)
      ) {
        return;
      }

      updateActiveOrder({
        orderId: order.orderId,
        ...freshOtpFields(
          otpHolderFields,
          order[otpHolderFields.code] || null
        )
      });
    };

    rotateIfDue();

    const timer = setInterval(rotateIfDue, 1000);

    return () => clearInterval(timer);
  }, [otpHolderFields, activeOrder.orderId]);

  // =========================================================
  // Live GPS Tracking
  // =========================================================

  const [partnerLocation, setPartnerLocation] =
    useState(null);

  const [isSharingLocation, setIsSharingLocation] =
    useState(false);

  const geoWatchIdRef = useRef(null);


  // Member side: subscribe to partner live location
  useEffect(() => {
    if (
      !isFirebaseConfigured ||
      !db ||
      !authUser?.uid ||
      !activeOrder.orderId
    ) {
      return;
    }

    const locRef = ref(
      db,
      `liveLocations/${toDbKey(activeOrder.orderId)}`
    );

    const unsubscribe = onValue(
      locRef,
      (snapshot) => {
        setPartnerLocation(snapshot.val());
      },
      (error) => {
        console.warn('Live location listener stopped:', error.message);
      }
    );

    return () => unsubscribe();
  }, [activeOrder.orderId, authUser?.uid]);


  // Stop GPS watch on unmount
  useEffect(() => {
    return () => {
      if (geoWatchIdRef.current != null) {
        navigator.geolocation?.clearWatch(
          geoWatchIdRef.current
        );
      }
    };
  }, []);


  const startSharingLocation = () => {
    if (!isFirebaseConfigured || !db) {
      showToast(
        'Live GPS needs Firebase setup — add keys to .env.local first.'
      );
      return;
    }

    if (!navigator.geolocation) {
      showToast(
        'Geolocation is not supported on this device/browser.'
      );
      return;
    }

    const watchId =
      navigator.geolocation.watchPosition(
        (pos) => {
          const {
            latitude,
            longitude,
            heading,
            speed
          } = pos.coords;

          set(
            ref(
              db,
              `liveLocations/${toDbKey(activeOrder.orderId)}`
            ),
            {
              lat: latitude,
              lng: longitude,
              heading: heading ?? null,
              speed: speed ?? null,
              updatedAt: Date.now()
            }
          );
        },

        (err) => {
          const messages = {
            1: 'Location is blocked. Allow location for this site in your browser (and turn on Windows location services), then tap Start again.',
            2: 'Your location is unavailable right now. Check that device location is turned on.',
            3: 'Getting your location timed out. Please tap Start again.'
          };

          showToast(
            messages[err.code] ||
            `Location error: ${err.message}`
          );

          // Stop the watch too, or it keeps running while the UI shows stopped
          navigator.geolocation.clearWatch(watchId);
          geoWatchIdRef.current = null;
          setIsSharingLocation(false);
        },

        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000
        }
      );

    geoWatchIdRef.current = watchId;

    setIsSharingLocation(true);

    showToast(
      'Sharing your live location with the customer.'
    );
  };


  const stopSharingLocation = () => {
    if (geoWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(
        geoWatchIdRef.current
      );

      geoWatchIdRef.current = null;
    }

    setIsSharingLocation(false);

    if (
      isFirebaseConfigured &&
      db &&
      activeOrder.orderId
    ) {
      remove(
        ref(
          db,
          `liveLocations/${toDbKey(activeOrder.orderId)}`
        )
      );
    }

    showToast('Stopped sharing live location.');
  };


  const liveDistanceKm = partnerLocation
    ? haversineDistanceKm(
        partnerLocation,
        DESTINATION_COORDS
      )
    : null;


  const liveEtaMinutes =
    liveDistanceKm != null
      ? estimateEtaMinutes(liveDistanceKm)
      : null;


  // =========================================================
  // Service Partner State
  // =========================================================

  const [isPartnerOnline, setIsPartnerOnline] =
    useState(true);


  const [partnerStats, setPartnerStats] =
    useState({
      // Loaded from Supabase via GET /partners/{id}/overview
      todayEarnings: 0,
      completedJobs: 0,
      weeklyBalance: 0,
      rating: 0,
      reviews: 0,
      serviceRadiusKm: 5
    });

  // Accepted / in-progress bookings, soonest first (from Supabase)
  const [partnerUpcomingJobs, setPartnerUpcomingJobs] =
    useState([]);

  // Request IDs already known to be rated, so only new ratings notify
  const knownRatedRequestIdsRef = useRef(null);


  const [hasIncomingJob, setHasIncomingJob] =
  useState(false);

  const [incomingCountdown, setIncomingCountdown] =
    useState(105);


  const [incomingJobDetails, setIncomingJobDetails] =
    useState({
      requestId: null,
      partnerId: null,
      category: '',
      title: '',
      distance: '',
      etaMins: 0,
      area: '',
      payout: 0,
      customerName: '',
      customerAvatar: '',
      customerRating: 0
    });


  // Countdown timer
  useEffect(() => {
    let timer;

    if (
      hasIncomingJob &&
      incomingCountdown > 0
    ) {
      timer = setInterval(() => {
        setIncomingCountdown(
          (prev) => (prev > 0 ? prev - 1 : 0)
        );
      }, 1000);
    }

    return () => clearInterval(timer);
  }, [
    hasIncomingJob,
    incomingCountdown
  ]);

// ==========================================
// PARTNER: REVIEWS & RATING FROM BOOKING REQUESTS
// ==========================================
const syncPartnerReviews = (data) => {
  const ratedRequests = Object.entries(data || {})
    .map(([requestId, request]) => ({
      requestId,
      ...request
    }))
    .filter((request) => Number(request.rating) > 0)
    .sort(
      (a, b) =>
        (b.ratedAt || 0) -
        (a.ratedAt || 0)
    );

  setReviews(
    ratedRequests.map((request) => ({
      id: request.requestId,
      orderId: request.requestId,
      serviceTitle:
        request.serviceTitle || 'Service Request',
      stars: Number(request.rating),
      feedback: request.feedback || '',
      time: request.ratedAt
        ? new Date(request.ratedAt).toLocaleDateString()
        : ''
    }))
  );

  // The rating and review count shown on the dashboard come from
  // Supabase (see refreshPartnerOverview)

  // The first snapshot is the baseline; notify only for new ratings
  if (knownRatedRequestIdsRef.current) {
    ratedRequests
      .filter(
        (request) =>
          !knownRatedRequestIdsRef.current.has(request.requestId)
      )
      .forEach((request) => {
        addNotification('partner', {
          title: 'New Rating Received',
          desc:
            `You were rated ${request.rating}★ for ${request.serviceTitle || 'a service'}${
              request.feedback
                ? `: "${request.feedback}"`
                : '.'
            }`
        });
      });
  }

  knownRatedRequestIdsRef.current = new Set(
    ratedRequests.map((request) => request.requestId)
  );
};

// ==========================================
// PARTNER: TODAY'S OVERVIEW FROM SUPABASE
// ==========================================
const refreshPartnerOverview = async () => {
  if (!partnerProfile?.id) {
    return;
  }

  try {
    const response = await fetch(
      `${BACKEND_URL}/partners/${partnerProfile.id}/overview` +
      `?tz_offset_minutes=${new Date().getTimezoneOffset()}`
    );

    if (!response.ok) {
      throw new Error(`Overview request failed: ${response.status}`);
    }

    const overview = await response.json();

    setPartnerStats((prev) => ({
      ...prev,
      todayEarnings: overview.today_earnings,
      completedJobs: overview.today_completed_jobs,
      weeklyBalance: overview.week_earnings,
      rating: overview.rating,
      reviews: overview.reviews_count,
      serviceRadiusKm: overview.service_radius_km || 5
    }));

    setPartnerUpcomingJobs(overview.upcoming_jobs || []);
  } catch (error) {
    console.error('Failed to load partner overview:', error);
  }
};

const SERVICE_RADIUS_OPTIONS_KM = [3, 5, 10, 15];

// Moves to the next radius option and saves it to Supabase
const cycleServiceRadius = async () => {
  if (!partnerProfile?.id) {
    return;
  }

  const current = partnerStats.serviceRadiusKm || 5;
  const index = SERVICE_RADIUS_OPTIONS_KM.indexOf(current);
  const next =
    SERVICE_RADIUS_OPTIONS_KM[(index + 1) % SERVICE_RADIUS_OPTIONS_KM.length];

  try {
    const response = await fetch(
      `${BACKEND_URL}/partners/${partnerProfile.id}/service-radius`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_radius_km: next })
      }
    );

    if (!response.ok) {
      throw new Error(`Radius update failed: ${response.status}`);
    }

    setPartnerStats((prev) => ({ ...prev, serviceRadiusKm: next }));
    showToast(`Service radius set to ${next} km`);
  } catch (error) {
    console.error('Failed to update service radius:', error);
    showToast('Could not update service radius. Please try again.');
  }
};

// Reload when the dashboard opens, after each booking sync, and every
// minute (to pick up changes synced from the customer's device)
useEffect(() => {
  if (role !== 'partner' || !partnerProfile?.id) {
    return;
  }

  refreshPartnerOverview();

  const timer = setInterval(refreshPartnerOverview, 60000);

  return () => clearInterval(timer);
}, [role, partnerProfile?.id, backendSyncVersion]);

// ==========================================
// PARTNER: EXPIRE UNANSWERED BOOKING REQUESTS
// ==========================================
const DEFAULT_REQUEST_EXPIRY_SECONDS = 105;

// Seconds left to answer a request, measured from when it was sent
const getRequestSecondsLeft = (request) => {
  const expiresIn =
    request.expiresIn || DEFAULT_REQUEST_EXPIRY_SECONDS;

  if (!request.createdAt) {
    return expiresIn;
  }

  return Math.max(
    0,
    Math.round(
      (request.createdAt + expiresIn * 1000 - Date.now()) / 1000
    )
  );
};

// Mark an unanswered request as expired so it stops reappearing,
// and let the member's order listener know the partner didn't respond
const expireBookingRequest = (partnerId, requestId) => {
  if (!isFirebaseConfigured || !db || !partnerId || !requestId) {
    return;
  }

  const expiredAt = Date.now();

  Promise.all([
    update(
      ref(db, `bookingRequests/${partnerId}/${requestId}`),
      {
        status: 'EXPIRED',
        bookingStatus: 'EXPIRED',
        expiredAt
      }
    ),
    update(
      ref(db, `orders/${toDbKey(requestId)}`),
      {
        status: 'EXPIRED',
        bookingStatus: 'EXPIRED',
        expiredAt
      }
    )
  ]).catch((error) => {
    console.error(
      '❌ Failed to expire booking request:',
      error
    );
  });
};

// When the countdown runs out on screen, expire the request
useEffect(() => {
  if (
    hasIncomingJob &&
    incomingCountdown === 0 &&
    incomingJobDetails.requestId
  ) {
    setHasIncomingJob(false);

    expireBookingRequest(
      incomingJobDetails.partnerId,
      incomingJobDetails.requestId
    );

    showToast('Job request expired.');
  }
}, [hasIncomingJob, incomingCountdown]);

// ==========================================
// PARTNER: LISTEN FOR INCOMING BOOKING REQUESTS
// ==========================================
useEffect(() => {
  // Only while a partner is signed in; logging out stops the listener
  if (
    !isFirebaseConfigured ||
    !db ||
    !authUser?.uid ||
    role !== 'partner' ||
    !partnerProfile?.id
  ) {
    console.log('⏳ Booking listener waiting:', {
      firebaseConfigured: isFirebaseConfigured,
      hasDatabase: !!db,
      userId: partnerProfile?.id
    });
    return;
  }

  let unsubscribe = null;
  let cancelled = false;

  const startBookingListener = async () => {
    try {
      // Resolve the actual Partner ID from the logged-in User ID.
      // Every partner account has one, even before adding a service, so a
      // new partner starts listening right away and gets requests as soon
      // as they add their first service (no page reload needed).
const response = await fetch(
  `${API_BASE_URL}/partners/${partnerProfile.id}`
);

if (!response.ok) {
  throw new Error(
    `Partner lookup failed: ${response.status}`
  );
}

const partnerId = (await response.json()).id;

if (cancelled) return;

console.log("👤 Logged-in User ID:", partnerProfile.id);
console.log("🆔 Resolved Partner ID:", partnerId);

const requestPath = `bookingRequests/${partnerId}`;

console.log(
  "👂 Listening for booking requests:",
  requestPath
);

const requestsRef = ref(db, requestPath);

      knownRatedRequestIdsRef.current = null;

      unsubscribe = onValue(
        requestsRef,
        (snapshot) => {
          const data = snapshot.val();

          console.log('📥 PARTNER BOOKING DATA:', data);

          syncPartnerReviews(data);

          if (!data) {
            setHasIncomingJob(false);
            return;
          }

          const pendingRequests = Object.entries(data)
            .map(([requestId, request]) => ({
              requestId,
              ...request
            }))
            .filter(
              (request) =>
                request.status === 'PENDING'
            );

          // Requests left unanswered past their time limit are expired,
          // otherwise they would reappear on every reload
          pendingRequests
            .filter(
              (request) =>
                getRequestSecondsLeft(request) === 0
            )
            .forEach((request) =>
              expireBookingRequest(
                partnerId,
                request.requestId
              )
            );

          const requests = pendingRequests
            .filter(
              (request) =>
                getRequestSecondsLeft(request) > 0
            )
            .sort(
              (a, b) =>
                (b.createdAt || 0) -
                (a.createdAt || 0)
            );

          console.log('📋 PENDING REQUESTS:', requests);

          if (requests.length === 0) {
            setHasIncomingJob(false);
            return;
          }

          const latestRequest = requests[0];

          setIncomingJobDetails({
            requestId:
              latestRequest.requestId || null,
            partnerId:
              latestRequest.partnerId || partnerId,
            category:
              latestRequest.category || 'Home Services',
            title:
              latestRequest.serviceTitle || 'Service Request',
            distance:
              latestRequest.distance || 'Nearby',
            etaMins:
              latestRequest.etaMins || 7,
            area:
              latestRequest.area || 'Nearby',
            payout:
              Number(latestRequest.payout || 0),
            customerName:
              latestRequest.customerName || 'KOODAM Customer',
            customerAvatar:
              latestRequest.customerAvatar || '',
            customerRating:
              latestRequest.customerRating || 5,
            scheduledAt:
              latestRequest.scheduledAt || null,
            customerId:
              latestRequest.customerId || null
          });

          setHasIncomingJob(true);

          setIncomingCountdown(
            getRequestSecondsLeft(latestRequest)
          );

          console.log(
            '🚨 NEW PARTNER REQUEST:',
            latestRequest
          );
        },
        (error) => {
          console.warn(
            'Booking request listener stopped:',
            error.message
          );
        }
      );
    } catch (error) {
      console.error(
        '❌ Failed to start booking listener:',
        error
      );
    }
  };

  startBookingListener();

  return () => {
    cancelled = true;
    if (unsubscribe) {
      unsubscribe();
    }
  };
}, [
  isFirebaseConfigured,
  db,
  authUser?.uid,
  role,
  partnerProfile?.id
]);
  // =========================================================
  // Chat
  // =========================================================

  const [isChatOpen, setIsChatOpen] =
    useState(false);

  const [chatPartner, setChatPartner] =
    useState('KOODAM Customer');


  const [messages, setMessages] =
    useState([
      {
        id: 1,
        sender: 'partner',
        text:
          'Namaskara! I am at 12th Main cross, reaching in about 10 minutes.',
        time: '10:35 AM'
      },
      {
        id: 2,
        sender: 'member',
        text:
          'Sounds great Arun! Please ring the bell on the 2nd floor.',
        time: '10:36 AM'
      },
      {
        id: 3,
        sender: 'partner',
        text:
          'Sure thing, will do! I have the multimeter and safety gear ready.',
        time: '10:37 AM'
      }
    ]);


  // Firebase chat listener
  useEffect(() => {
    if (
      !isFirebaseConfigured ||
      !db ||
      !authUser?.uid ||
      !activeOrder.orderId
    ) {
      return;
    }

    const msgsRef = ref(
      db,
      `chats/${toDbKey(activeOrder.orderId)}/messages`
    );

    const unsubscribe = onValue(
      msgsRef,
      (snapshot) => {
        const val = snapshot.val() || {};

        const list = Object.entries(val)
          .map(([id, msg]) => ({
            id,
            ...msg
          }))
          .sort(
            (a, b) => (a.ts || 0) - (b.ts || 0)
          );

        setMessages(list);
      },
      (error) => {
        console.warn('Chat listener stopped:', error.message);
      }
    );

    return () => unsubscribe();
  }, [activeOrder.orderId, authUser?.uid]);


  // =========================================================
  // Emergency Modal
  // =========================================================

  const [isEmergencyModalOpen, setIsEmergencyModalOpen] =
    useState(false);


  // =========================================================
  // Toast
  // =========================================================

  const [toastMessage, setToastMessage] =
    useState(null);


  const showToast = (msg, duration = 3000) => {
    setToastMessage(msg);

    setTimeout(() => {
      setToastMessage(null);
    }, duration);
  };


  // =========================================================
  // Notifications
  // =========================================================

  const [notifications, setNotifications] =
    useState([]);


  const addNotification = (
    target,
    {
      title,
      desc,
      screen = null,
      tab = null
    }
  ) => {
    setNotifications((prev) => [
      {
        id: Date.now() + Math.random(),
        target,
        title,
        desc,
        time: 'Just now',
        unread: true,
        screen,
        tab
      },
      ...prev
    ]);
  };


  const markNotificationsRead = (target) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.target === target
          ? { ...n, unread: false }
          : n
      )
    );
  };


  // =========================================================
  // Reviews
  // =========================================================

  const [reviews, setReviews] = useState([]);


  // =========================================================
  // Navigation
  // =========================================================

  // Member-only screens that a partner should see as a
  // tab of the partner dashboard instead
  const PARTNER_SCREEN_TABS = {
    home: 'home',
    profile: 'profile',
    tracking: 'jobs'
  };

  const navigateTo = (
    screen,
    tab = null
  ) => {
    if (
      role === 'partner' &&
      PARTNER_SCREEN_TABS[screen]
    ) {
      tab = PARTNER_SCREEN_TABS[screen];
      screen = 'partner';
    }

    setCurrentScreen(screen);

    if (tab) {
      setActiveTab(tab);
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };


  // =========================================================
  // Role
  // =========================================================

  const enterRole = (targetRole) => {
    setRole(targetRole);

    // Remembered so a page reload returns to the same side of the app
    try {
      localStorage.setItem(LAST_ROLE_KEY, targetRole);
    } catch {
      // Without storage a reload falls back to the account's own role
    }

    if (targetRole === 'partner') {
      setCurrentScreen('partner');
    } else {
      setCurrentScreen('home');
      setActiveTab('home');
    }
  };


  const handleSelectMember = () => {
    enterRole('member');
    showToast(
      'Switched to Community Member View'
    );
  };


  const handleSelectPartner = () => {
    enterRole('partner');
    showToast(
      'Switched to Service Partner Dashboard'
    );
  };


  // =========================================================
  // Backend User Sync
  // =========================================================

  const syncUserWithBackend = async (
  firebaseUser,
  targetRole,
  extraData = {}
) => {
  if (!firebaseUser) {
    return null;
  }

  const idToken = await firebaseUser.getIdToken();

  const response = await fetch(
    `${BACKEND_URL}/users/sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        firebase_uid: firebaseUser.uid,
        name:
          firebaseUser.displayName ||
          extraData.name ||
          'KOODAM User',
        email: firebaseUser.email,
        phone: extraData.phone || null,
        avatar:
          firebaseUser.photoURL ||
          extraData.avatar ||
          null,
        role:
          targetRole === 'partner'
            ? 'PARTNER'
            : 'MEMBER',
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Backend sync failed: ${errorText}`
    );
  }

  const backendUser = await response.json();

  return backendUser;
};


 // =========================================================
// Sign Up
// =========================================================

const signUp = async (
  targetRole,
  {
    name,
    email,
    phone,
    password,
    aadhaarFile,
    panFile,
    voterIdFile,
    policeFile
  }
) => {
  setAuthLoading(true);

  try {
    let cred = null;
    let backendUser = null;

    // -------------------------------------------------------
    // Firebase Sign Up
    // -------------------------------------------------------

    if (
      isFirebaseConfigured &&
      auth
    ) {
      try {
        cred =
          await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );

        // Set Firebase display name
        if (name) {
          await updateProfile(
            cred.user,
            {
              displayName: name
            }
          );
        }

        // Sync Firebase user with KOODAM backend
        backendUser =
          await syncUserWithBackend(
            cred.user,
            targetRole,
            {
              name,
              phone
            }
          );

      } catch (err) {

        if (!isAuthSetupError(err)) {
          throw err;
        }
      }
    }

    // -------------------------------------------------------
    // Update local profile
    // -------------------------------------------------------

    setUserProfile((prev) => ({
      ...prev,

      ...(backendUser || {}),

      name:
        backendUser?.name ||
        name ||
        prev.name,

      email:
        backendUser?.email ||
        email ||
        prev.email,

      phone:
        backendUser?.phone ||
        phone ||
        prev.phone
    }));

    // -------------------------------------------------------
    // Partner KYC
    // -------------------------------------------------------

    if (
      targetRole === 'partner' &&
      (
        aadhaarFile ||
        panFile ||
        voterIdFile
      )
    ) {
      await uploadPartnerKyc(
        cred?.user?.uid,
        {
          aadhaarFile,
          panFile,
          voterIdFile
        }
      );
    }

    // -------------------------------------------------------
    // Police clearance certificate (optional) -> Supabase review
    // -------------------------------------------------------

    let policeUploadFailed = false;

    if (
      targetRole === 'partner' &&
      policeFile &&
      backendUser?.id
    ) {
      try {
        const formData = new FormData();
        formData.append('file', policeFile);

        const response = await fetch(
          `${BACKEND_URL}/partners/${backendUser.id}/police-verification`,
          { method: 'POST', body: formData }
        );

        if (!response.ok) {
          throw new Error(`Police certificate upload failed: ${response.status}`);
        }
      } catch (error) {
        // The account is still created; the partner can re-upload from Profile
        console.error('Police certificate upload failed:', error);
        policeUploadFailed = true;
      }
    }

    // -------------------------------------------------------
    // Existing KOODAM navigation
    // -------------------------------------------------------

    enterRole(targetRole);

    showToast(
      policeUploadFailed
        ? 'Account created, but the police certificate upload failed — you can upload it from your Profile.'
        : `Welcome to KOODAM, ${name || 'there'}!`
    );

    return true;

  } catch (err) {

    console.error(
      'Sign up error:',
      err
    );

    showToast(
      authErrorMessage(err)
    );

    return false;

  } finally {

    setAuthLoading(false);
  }
};


  // =========================================================
  // Partner KYC Upload
  // =========================================================

  const uploadPartnerKyc = async (
    uid,
    {
      aadhaarFile,
      panFile,
      voterIdFile
    }
  ) => {

    const docs = {
      aadhaar: aadhaarFile,
      pan: panFile,
      voterId: voterIdFile
    };


    if (
      !isStorageConfigured ||
      !storage ||
      !uid
    ) {
      setPartnerKyc(docs);
      return;
    }


    try {

      const uploaded = {};


      for (
        const [key, file]
        of Object.entries(docs)
      ) {

        if (!file) continue;


        const path =
          `partnerDocuments/${uid}/${key}-${Date.now()}-${file.name}`;


        const fileRef =
          storageRef(storage, path);


        await uploadBytes(
          fileRef,
          file
        );


        uploaded[key] =
          await getDownloadURL(fileRef);
      }


      setPartnerKyc(uploaded);

    } catch (err) {

      setPartnerKyc(docs);

      showToast(
        'Account created, but document upload failed — you can re-upload documents later.'
      );
    }
  };


  // =========================================================
  // Sign In
  // =========================================================

const signIn = async (
  targetRole,
  {
    email,
    password
  }
) => {

  setAuthLoading(true);

  try {

    let firebaseUser = null;

    // -------------------------------------------------------
    // Firebase Sign In
    // -------------------------------------------------------

    if (
      isFirebaseConfigured &&
      auth
    ) {

      try {

        const credential =
          await signInWithEmailAndPassword(
            auth,
            email,
            password
          );

        firebaseUser = credential.user;

      } catch (err) {

        // If Firebase itself is not configured correctly,
        // keep the existing local/demo fallback behavior.
        if (!isAuthSetupError(err)) {
          throw err;
        }
      }
    }


    // -------------------------------------------------------
    // Sync Firebase User with KOODAM Backend
    // -------------------------------------------------------

    if (
      firebaseUser &&
      isFirebaseConfigured
    ) {

      const backendUser =
        await syncUserWithBackend(
          firebaseUser,
          targetRole
        );

      if (backendUser) {

  console.log(
    '🔥 BACKEND USER AFTER LOGIN:',
    backendUser
  );

  setUserProfile((prev) => ({
    ...prev,
    ...backendUser
  }));
}
    }


    // -------------------------------------------------------
    // Existing local profile behavior
    // -------------------------------------------------------

    if (email) {

      setUserProfile((prev) => ({
        ...prev,
        email
      }));
    }


    // -------------------------------------------------------
    // Existing KOODAM navigation
    // -------------------------------------------------------

    enterRole(targetRole);

    showToast(
      'Logged in successfully!'
    );

    return true;

  } catch (err) {

    console.error(
      'Sign in error:',
      err
    );

    showToast(
      authErrorMessage(err)
    );

    return false;

  } finally {

    setAuthLoading(false);
  }
};


  // =========================================================
  // Google Sign-In (Supabase OAuth)
  // =========================================================

  // Step 1: remember which login page was used, then go to Google
  const signInWithGoogle = async (targetRole) => {
    try {
      localStorage.setItem(GOOGLE_ROLE_KEY, targetRole);
    } catch {
      // Without storage the role can't survive the redirect; member is the fallback
    }

    setAuthLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' }
      }
    });

    if (error) {
      console.error('Google sign-in error:', error);
      setAuthLoading(false);
      showToast('Could not start Google sign-in. Please try again.');
    }
  };

  // Step 2: Google sends the user back here with a Supabase session.
  // The same Google login is used to sign in to Firebase, which the
  // bookings, chat and live GPS data require.
  const completeGoogleSignIn = async (session) => {
    let targetRole = 'member';

    try {
      targetRole = localStorage.getItem(GOOGLE_ROLE_KEY) || 'member';
      localStorage.removeItem(GOOGLE_ROLE_KEY);
    } catch {
      // Fall back to member
    }

    setAuthLoading(true);

    try {
      if (!session.provider_token) {
        throw new Error('Google did not return an access token.');
      }

      if (!isFirebaseConfigured || !auth) {
        throw new Error('Firebase is not configured.');
      }

      const credential = await signInWithCredential(
        auth,
        GoogleAuthProvider.credential(null, session.provider_token)
      );

      const googleUser = session.user?.user_metadata || {};

      const backendUser = await syncUserWithBackend(
        credential.user,
        targetRole,
        {
          name: googleUser.full_name || googleUser.name,
          avatar: googleUser.avatar_url || googleUser.picture
        }
      );

      if (backendUser) {
        if (targetRole === 'partner') {
          setPartnerProfile((prev) => ({ ...prev, ...backendUser }));
        } else {
          setUserProfile((prev) => ({ ...prev, ...backendUser }));
        }
      }

      enterRole(targetRole);

      showToast(
        `Welcome to KOODAM, ${backendUser?.name || googleUser.full_name || 'there'}!`
      );
    } catch (err) {
      console.error('Google sign-in could not be completed:', err);

      await supabase.auth.signOut().catch(() => {});

      // Don't leave a half-finished Firebase login behind
      if (auth) {
        await signOut(auth).catch(() => {});
      }

      // Say what actually went wrong instead of a generic failure
      const isServerUnreachable =
        err instanceof TypeError ||
        /failed to fetch|networkerror/i.test(err?.message || '');

      let message = 'Google sign-in failed. Please try again.';

      if (err?.code === 'auth/operation-not-allowed') {
        message = 'Google sign-in is not enabled in Firebase. Enable Google under Firebase Authentication > Sign-in method.';
      } else if (err?.code === 'auth/account-exists-with-different-credential') {
        message = 'This email already has a KOODAM password. Please log in with your email and password.';
      } else if (err?.code === 'auth/invalid-credential') {
        message = 'Google sign-in is not set up correctly. Please log in with your email and password.';
      } else if (isServerUnreachable) {
        message = "Can't reach the KOODAM server. Make sure the backend is running, then try again.";
      } else if (/Backend sync failed/.test(err?.message || '')) {
        message = "Signed in with Google, but your KOODAM account couldn't be loaded. Please try again.";
      }

      showToast(message);

      navigateTo(targetRole === 'partner' ? 'partnerLogin' : 'memberLogin');
    } finally {
      setAuthLoading(false);

      // Remove the OAuth tokens/code from the address bar
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  useEffect(() => {
    let handled = false;

    // A normal page load (not a return from Google): clear any leftover
    // "Google login in progress" note from a sign-in that was abandoned,
    // so it can't trigger a failed Google login later
    if (!isOAuthReturn) {
      try {
        localStorage.removeItem(GOOGLE_ROLE_KEY);
      } catch {
        // Nothing to clear
      }
      return undefined;
    }

    // The user cancelled on Google's page
    if (oauthReturnError) {
      try {
        localStorage.removeItem(GOOGLE_ROLE_KEY);
      } catch {
        // Nothing to clear
      }

      window.history.replaceState(null, '', window.location.pathname);

      if (oauthReturnError !== 'access_denied') {
        showToast('Google sign-in failed. Please try again.');
      }

      return undefined;
    }

    const handle = (session) => {
      // Only finish sign-ins this app started (the role key is set in step 1)
      let pending = false;

      try {
        pending = Boolean(localStorage.getItem(GOOGLE_ROLE_KEY));
      } catch {
        pending = false;
      }

      if (!session || !pending || handled) {
        return;
      }

      handled = true;
      completeGoogleSignIn(session);
    };

    supabase.auth.getSession().then(({ data }) => handle(data.session));

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        handle(session);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);


  // =========================================================
  // Logout
  // =========================================================

  const logout = async () => {

    // Also end a Google (Supabase) session, if there is one
    await supabase.auth.signOut().catch(() => {});

    if (
      isFirebaseConfigured &&
      auth
    ) {

      try {

        await signOut(auth);

      } catch (err) {

        showToast(
          authErrorMessage(err)
        );
      }
    }


    // A reload after logging out should stay on the welcome screen
    try {
      localStorage.removeItem(LAST_ROLE_KEY);
    } catch {
      // Nothing to clear
    }

    // Forget this user's data, so whoever logs in next on this device
    // doesn't see their profile, job, chat or earnings
    setUserProfile(EMPTY_MEMBER_PROFILE);
    setPartnerProfile(EMPTY_PARTNER_PROFILE);
    setActiveOrder(EMPTY_ORDER);
    setMessages([]);
    setIsChatOpen(false);
    setChatPartner('KOODAM Customer');
    setHasIncomingJob(false);
    setPartnerUpcomingJobs([]);
    setReviews([]);

    setRole('welcome');

    navigateTo('welcome');

    showToast(
      'Logged out.'
    );
  };


  // =========================================================
// Password Reset
// =========================================================

const requestPasswordReset = async (email) => {

  if (!email) {
    showToast(
      'Enter your email address first.'
    );
    return;
  }

  if (
    isFirebaseConfigured &&
    auth
  ) {

    try {

      await sendPasswordResetEmail(
        auth,
        email.trim()
      );

      showToast(
        'Password reset email sent — check your inbox.'
      );

    } catch (err) {

      console.error(
        'Password reset error:',
        err
      );

      console.error(
        'Firebase error code:',
        err.code
      );

      console.error(
        'Firebase error message:',
        err.message
      );

      showToast(
        `${err.code}: ${err.message}`
      );
    }

  } else {

    showToast(
      `Demo mode: a password reset link would be sent to ${email}.`
    );
  }
};


  // =========================================================
  // Profile Updates
  // =========================================================

 const updateUserProfile = async (updates) => {
  try {
    if (!authUser) {
      showToast('Please login first');
      return false;
    }

    let userId = userProfile?.id;

// If the profile ID is missing, recover it
// using the Firebase UID.
if (!userId && authUser?.uid) {
  try {
    const profileResponse = await fetch(
      `${BACKEND_URL}/users/firebase/${authUser.uid}`
    );

    if (profileResponse.ok) {
      const backendUser =
        await profileResponse.json();

      userId = backendUser?.id;

      if (backendUser?.id) {
        setUserProfile((previous) => ({
          ...previous,
          ...backendUser,
        }));
      }
    }
  } catch (syncError) {
    console.error(
      'Profile re-sync failed:',
      syncError
    );
  }
}

if (!userId) {
  showToast(
    'User profile is not synced yet'
  );
  return false;
}

    const response = await fetch(
      `${BACKEND_URL}/users/${userId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: updates.name,
          phone: updates.phone,
          avatar: updates.avatar ?? null,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        'Profile update failed:',
        response.status,
        errorText
      );

      showToast('Failed to update profile');
      return false;
    }

    const updatedUser = await response.json();

    setUserProfile((previous) => ({
      ...previous,
      ...updatedUser,
    }));

    showToast(
      'Profile updated successfully!'
    );

    return true;

  } catch (error) {
    console.error(
      'Profile update error:',
      error
    );

    showToast(
      'Unable to update profile'
    );

    return false;
  }
};

const updatePartnerProfile = async (
  updates
) => {
  try {
    if (!authUser) {
      showToast('Please login first');
      return false;
    }

    const userId = partnerProfile?.id;

    if (!userId) {
      showToast(
        'Partner profile is not synced yet'
      );
      return false;
    }

    const response = await fetch(
      `${BACKEND_URL}/users/${userId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: updates.name,
          phone: updates.phone,
          avatar: updates.avatar ?? null,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        'Partner profile update failed:',
        response.status,
        errorText
      );

      showToast(
        'Failed to update partner profile'
      );

      return false;
    }

    const updatedUser =
      await response.json();

    setPartnerProfile((previous) => ({
      ...previous,
      ...updatedUser,
    }));

    showToast(
      'Profile updated successfully!'
    );

    return true;

  } catch (error) {
    console.error(
      'Partner profile update error:',
      error
    );

    showToast(
      'Unable to update partner profile'
    );

    return false;
  }
};


  // =========================================================
  // Change Password
  // =========================================================

  const changePassword = (
    currentPassword,
    newPassword
  ) => {

    if (
      !currentPassword ||
      !newPassword
    ) {

      showToast(
        'Please fill in all password fields.'
      );

      return false;
    }


    if (newPassword.length < 6) {

      showToast(
        'New password must be at least 6 characters.'
      );

      return false;
    }


    showToast(
      'Password updated successfully!'
    );

    return true;
  };


  // =========================================================
  // Booking Helpers
  // =========================================================

  const handleBookHelper = (
    helperData = null
  ) => {

    if (helperData) {
      setSelectedHelper(
        helperData
      );
    }

    navigateTo('booking');
  };


  // =========================================================
  // Voice Booking
  // =========================================================

  const handleVoiceBooking = (
    spokenText
  ) => {

    const text =
      spokenText.toLowerCase();


    const budgetMatch =
      text.match(
        /(?:₹\s*|rs\.?\s*|(?:cost|price|budget)\s*(?:of|is)?\s*)(\d{2,5})|(\d{2,5})\s*rupees?/i
      );


    const budget =
      budgetMatch
        ? Number(
            budgetMatch[1] ||
            budgetMatch[2]
          )
        : null;


    const isPlumbing =
      /plumb|tap|pipe|leak|water/.test(
        text
      );


    const isMorning =
      /morning|today|asap|now/.test(
        text
      );


    const servicePrice =
      budget ||
      (isPlumbing ? 500 : 399);


    setSelectedHelper(
      (prev) => ({
        ...prev,

        title: isPlumbing
          ? 'Verified Plumber & Water Systems Specialist'
          : prev.title
      })
    );


    setSelectedService({
      id: `voice-${Date.now()}`,

      title:
        isPlumbing
          ? 'Plumbing Service Visit'
          : 'On-demand Home Service Visit',

      price: servicePrice,

      duration: '~60 mins',

      tag: 'VOICE MATCHED',

      desc:
        budget
          ? `Matched to your ₹${budget} budget`
          : 'Verified local partner dispatch'
    });


    if (isMorning) {

      setSelectedDate(
        `Today ${new Date().getDate()}`
      );

      setSelectedTime(
        '10:30 AM - 11:30 AM'
      );
    }


    showToast(
      `Voice request understood: ${
        isPlumbing
          ? 'plumber'
          : 'home service'
      } • ₹${servicePrice}`
    );


    navigateTo('payment');
  };


  const handleProceedToPayment =
    () => navigateTo('payment');



// =========================================================
// Confirm Booking
// =========================================================

const handleConfirmBooking = async () => {
  const finalTotal =
    Number(selectedService?.price || 0) +
    Number(trustFee || 0);

  const targetPartnerId =
    selectedHelper?.partnerId ||
    selectedHelper?.partner_id;

  if (!targetPartnerId) {
    showToast(
      'Please select a valid service partner first.'
    );
    return;
  }

  if (!selectedService || !selectedHelper) {
    showToast(
      'Please select a service and partner first.'
    );
    return;
  }

  // Generate a request ID and write the request to Firebase.
  // The initial status must remain PENDING until the partner accepts.
  let createdRequestId = null;
  let safetyPin = null;

  // The partner's real details, shown on the customer's tracking card
  const helperDetails = {
    helperAvatar:
      selectedHelper?.avatar && selectedHelper.avatar !== '/logo.svg'
        ? selectedHelper.avatar
        : '',
    helperRating: Number(selectedHelper?.rating || 0),
    helperPhone: selectedHelper?.phone || '',
    helperVehicle: selectedHelper?.vehicle || '',
    helperVehicleNumber: selectedHelper?.vehicleNumber || '',
    helperVerified: Boolean(
      selectedHelper?.policeVerified || selectedHelper?.isVerified
    )
  };

  if (isFirebaseConfigured && db) {
    try {
      const requestRef = push(
        ref(
          db,
          `bookingRequests/${targetPartnerId}`
        )
      );

      const bookingRequest = {
  status: 'PENDING',
  bookingStatus: 'PENDING',
  paymentStatus: 'PENDING',

        orderId:
          requestRef.key,

        partnerId:
          targetPartnerId,

        customerId:
          userProfile?.id ||
          authUser?.uid ||
          null,

        customerFirebaseUid:
          authUser?.uid ||
          null,

        customerName:
          userProfile?.name ||
          authUser?.displayName ||
          'KOODAM Customer',

        customerEmail:
          userProfile?.email ||
          authUser?.email ||
          '',

        customerPhone:
          userProfile?.phone ||
          '',

        customerAvatar:
          userProfile?.avatar ||
          authUser?.photoURL ||
          '',

        customerRating: 5,

        serviceId:
          selectedService?.id || null,

        serviceTitle:
          selectedService.title,

        category:
          selectedService.tag ||
          'Home Services',

        payout:
          finalTotal,

        distance:
          selectedHelper?.distance ||
          'Nearby',

        etaMins: 7,

        area:
          location || 'Nearby',

        // Lets the partner see the visit time and spot clashes
        scheduledAt: getScheduledTimestamp(
          selectedDate,
          selectedTime
        ),

        scheduledLabel: [selectedDate, selectedTime]
          .filter(Boolean)
          .join(', '),

        createdAt:
          Date.now(),

        expiresIn: 105
      };

      await set(requestRef, bookingRequest);

      createdRequestId = requestRef.key;

      // One canonical order is shared by the customer and partner.
      // The code rotates on the customer's phone once the partner accepts.
      safetyPin = generateOtp();

      await set(
        ref(
          db,
          `orders/${toDbKey(createdRequestId)}`
        ),
        {
          orderId: createdRequestId,
          requestId: createdRequestId,
          partnerId: targetPartnerId,
          customerId:
            userProfile?.id ||
            authUser?.uid ||
            null,
          customerName:
            userProfile?.name ||
            authUser?.displayName ||
            'KOODAM Customer',
          customerAvatar:
            userProfile?.avatar ||
            authUser?.photoURL ||
            '',
          helperName: selectedHelper.name,
          ...helperDetails,
          serviceTitle: selectedService.title,
          serviceId: selectedService?.id || null,
          category:
            selectedService?.tag ||
            'Home Services',
          totalAmount: finalTotal,
          totalPaid: 0,
          paymentStatus: 'PENDING',
          bookingStatus: 'PENDING',
          status: 'PENDING',
          serviceStatus: 'pending',
          currentStep: 1,
          safetyPin,
          completionOtp: null,
          etaMinutes: 12,
          area: location || 'Nearby',
          scheduledAt: getScheduledTimestamp(
            selectedDate,
            selectedTime
          ),
          scheduledLabel: [selectedDate, selectedTime]
            .filter(Boolean)
            .join(', '),
          createdAt: Date.now()
        }
      );

      // Save where the customer is so the partner can navigate there.
      // Runs in the background; the booking never waits on it.
      if (navigator.geolocation) {
        const orderIdForLocation = createdRequestId;

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            update(
              ref(
                db,
                `orders/${toDbKey(orderIdForLocation)}`
              ),
              {
                customerLat: pos.coords.latitude,
                customerLng: pos.coords.longitude
              }
            ).catch((error) => {
              console.error(
                '❌ Failed to save customer location:',
                error
              );
            });
          },
          (error) => {
            // The partner falls back to navigating by area name
            console.warn(
              'Customer location unavailable:',
              error?.message
            );
          },
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 60000
          }
        );
      }

      console.log(
        '✅ BOOKING REQUEST SAVED AS PENDING:',
        {
          requestId: createdRequestId,
          partnerId: targetPartnerId,
          status: bookingRequest.status
        }
      );
    } catch (error) {
      console.error(
        '❌ FAILED TO SEND BOOKING REQUEST:',
        error
      );

      console.error(
        'Firebase error code:',
        error?.code
      );

      console.error(
        'Firebase error message:',
        error?.message
      );

      showToast(
        `Booking failed: ${
          error?.message || 'Unknown Firebase error'
        }`
      );

      return;
    }
  } else {
    console.error(
      '❌ Firebase is not configured; booking was not saved remotely.'
    );

    showToast(
      'Unable to send booking request. Please check your connection and try again.'
    );

    return;
  }

  // IMPORTANT:
  // The request remains pending until the partner accepts it.
  updateActiveOrder({
    orderId:
      createdRequestId ||
      activeOrder?.orderId,

    requestId:
      createdRequestId,

    partnerId:
      targetPartnerId,

    helperName:
      selectedHelper.name,

    ...helperDetails,

    serviceTitle:
      selectedService.title,

    status: 'PENDING',
    bookingStatus: 'PENDING',
    serviceStatus: 'pending',
    currentStep: 1,

    safetyPin,
    completionOtp: null,

    paymentStatus: 'PENDING',
    totalPaid: 0,
    totalAmount: finalTotal,

    etaMinutes: 12,

    rating: null,
    feedback: ''
  });

  // Member notification: request sent, awaiting partner response.
  addNotification(
    'member',
    {
      title: 'Request Sent',

      desc:
        `Your booking request has been sent to ${selectedHelper.name}. Waiting for the partner to accept.`,

      screen: 'tracking',

      tab: 'requests'
    }
  );

  // Keep the partner notification, but do not mark their
  // incoming-job state as accepted or active here.
  addNotification(
    'partner',
    {
      title: 'New Request Nearby!',

      desc:
        `${selectedService.title} • Accept or reject within 01:45`
    }
  );

  showToast(
    `Booking request sent to ${selectedHelper.name}! Waiting for acceptance...`
  );

  // Navigate to tracking after the request has been saved.
  setTimeout(() => {
    navigateTo(
      'tracking',
      'requests'
    );
  }, 1200);
};

// =========================================================
// Order Status — Controlled Progression
// =========================================================

const advanceOrderStatus = () => {
  // Do not advance until the partner accepts the request
  if (activeOrder.bookingStatus !== 'ACCEPTED') {
    showToast(
      'Waiting for the partner to accept your booking request.'
    );
    return;
  }

  // Prevent restarting an already completed order
  if (activeOrder.currentStep >= 5) {
    showToast('Service has already been completed.');
    return;
  }

  // OTP verification controls service start and completion.
  // This function only handles the existing pre-service steps.
  if (activeOrder.currentStep >= 3) {
    showToast(
      'Use the arrival and completion OTP verification to update service progress.'
    );
    return;
  }

  const nextStep = activeOrder.currentStep + 1;

  const stepNames = [
    'Booking Confirmed',
    'Helper Assigned',
    'Helper En Route'
  ];

  const nextStatus = {
    currentStep: nextStep,
    etaMinutes: nextStep === 3 ? 12 : 20
  };

  updateActiveOrder(nextStatus);

  showToast(
    `Order Status Updated: ${stepNames[nextStep - 1]}`
  );
};


// =========================================================
// Verify Arrival OTP
// =========================================================

// The partner may have accepted several bookings, and the job on screen
// is only the last one accepted. Look through every accepted, unstarted
// order for this partner (freshly read, since the code rotates) and
// return the one whose current or just-replaced code matches.
const findAcceptedOrderByPin = async (code) => {
  const partnerId =
    activeOrder.partnerId || partnerProfile?.id;

  if (!isFirebaseConfigured || !db || !partnerId) {
    return null;
  }

  const requestsSnap = await get(
    ref(db, `bookingRequests/${partnerId}`)
  );

  const acceptedIds = Object.entries(requestsSnap.val() || {})
    .filter(([, request]) => request?.status === 'ACCEPTED')
    .map(([requestId]) => requestId);

  // Check the job on screen first
  const candidateIds = [
    ...new Set(
      [activeOrder.orderId, ...acceptedIds].filter(Boolean)
    )
  ];

  for (const requestId of candidateIds) {
    const orderSnap = await get(
      ref(db, `orders/${toDbKey(requestId)}`)
    );
    const order = orderSnap.val();

    if (
      order &&
      order.bookingStatus === 'ACCEPTED' &&
      Number(order.currentStep || 0) < 4 &&
      otpMatches(order, ARRIVAL_OTP, code)
    ) {
      return { ...order, orderId: order.orderId || requestId };
    }
  }

  return null;
};

const verifyArrivalOtp = async (rawCode) => {
  const code = String(rawCode).trim();

  let matchedOrder = null;

  try {
    matchedOrder = await findAcceptedOrderByPin(code);
  } catch (error) {
    console.warn('Arrival code lookup failed:', error);
  }

  if (!matchedOrder) {
    showToast(
      activeOrder.bookingStatus === 'ACCEPTED'
        ? 'Incorrect or expired arrival code — ask the customer for the code on their screen now.'
        : 'Waiting for the partner to accept your booking request.'
    );
    return false;
  }

  const targetOrderId = matchedOrder.orderId;

  if (targetOrderId !== activeOrder.orderId) {
    // Switch the partner to the job the customer is actually on
    setActiveOrder((prev) => ({
      ...prev,
      ...matchedOrder
    }));

    setChatPartner({
      name: matchedOrder.customerName || 'KOODAM Customer',
      avatar: matchedOrder.customerAvatar || '',
      customerId: matchedOrder.customerId
    });
  }

  // Mark service as started, not completed or paid.
  // The completion code starts here and rotates on the partner's phone.
  updateActiveOrder({
    orderId: targetOrderId,
    currentStep: 4,
    ...freshOtpFields(COMPLETION_OTP),
    serviceStatus: 'in_progress',
    etaMinutes: 0,
    rating: null,
    feedback: ''
  });

  // The customer is notified by their own Firebase order listener

  showToast(
    'Arrival code verified — work has started!'
  );

  return true;
};

// =========================================================
// Verify Completion OTP
// =========================================================

// =========================================================
// Extra Parts Cost (added by partner during the work)
// =========================================================

// Partner: request an extra cost for a component/part found during the job.
// It is only added to the bill once the member approves it.
const requestExtraCharge = (item, amount) => {
  const name = String(item || '').trim();
  const value = Math.round(Number(amount));

  if (!name || !Number.isFinite(value) || value <= 0) {
    showToast('Enter the part name and a valid amount.');
    return false;
  }

  if (activeOrder.currentStep !== 4) {
    showToast('Extra costs can only be added while the work is in progress.');
    return false;
  }

  if (!isFirebaseConfigured || !db || !activeOrder.orderId) {
    showToast('Unable to send the extra cost. Please check your connection.');
    return false;
  }

  push(
    ref(db, `orders/${toDbKey(activeOrder.orderId)}/extraCharges`),
    {
      item: name,
      amount: value,
      status: 'PENDING',
      createdAt: Date.now()
    }
  ).catch((error) => {
    console.error('❌ Failed to add extra cost:', error);
    showToast('Unable to send the extra cost. Please try again.');
  });

  showToast(`Sent ₹${value} for ${name} to the customer for approval.`);
  return true;
};

// Member: approve or decline an extra cost. Approving adds it to the bill.
const respondToExtraCharge = (chargeId, approve) => {
  const charge = activeOrder.extraCharges?.[chargeId];

  if (!charge || charge.status !== 'PENDING') {
    return;
  }

  const patch = {
    [`extraCharges/${chargeId}/status`]:
      approve ? 'APPROVED' : 'DECLINED',
    [`extraCharges/${chargeId}/respondedAt`]:
      Date.now()
  };

  if (approve) {
    patch.totalAmount =
      Number(activeOrder.totalAmount || 0) +
      Number(charge.amount || 0);
  }

  if (isFirebaseConfigured && db && activeOrder.orderId) {
    update(
      ref(db, `orders/${toDbKey(activeOrder.orderId)}`),
      patch
    ).catch((error) => {
      console.error('❌ Failed to respond to extra cost:', error);
      showToast('Unable to update the extra cost. Please try again.');
    });
  }

  showToast(
    approve
      ? `Approved ₹${charge.amount} for ${charge.item}.`
      : `Declined ${charge.item}.`
  );
};

const verifyCompletionOtp = async (rawCode) => {
  const code = String(rawCode).trim();

  // The code rotates on the partner's phone, so check the live value
  let order = activeOrder;

  if (isFirebaseConfigured && db && activeOrder.orderId) {
    try {
      const snap = await get(
        ref(db, `orders/${toDbKey(activeOrder.orderId)}`)
      );
      order = snap.val() || activeOrder;
    } catch (error) {
      console.warn('Completion code lookup failed:', error);
    }
  }

  if (
    order.currentStep !== 4 ||
    !order.completionOtp
  ) {
    showToast(
      'The service must be in progress before completion can be verified.'
    );
    return false;
  }

  if (!otpMatches(order, COMPLETION_OTP, code)) {
    showToast(
      'Incorrect or expired completion code — ask your service partner for the code on their screen now.'
    );
    return false;
  }

  // Service is completed, but PAYMENT is still pending.
  updateActiveOrder({
    currentStep: 5,
    bookingStatus: 'COMPLETED',
    serviceStatus: 'completed',
    paymentStatus: 'PENDING',
    totalPaid: 0,
    completedAt: new Date().toISOString()
  });

  addNotification('member', {
    title: 'Service Completed — Payment Required',
    desc:
      `${activeOrder.helperName} has completed ${activeOrder.serviceTitle}. Please proceed to payment.`,
    screen: 'tracking',
    tab: 'requests'
  });

  showToast(
    'Completion code verified! Please complete the payment.'
  );

  return true;
};

const markPaymentCompleted = (paymentResponse = {}) => {
  updateActiveOrder({
    paymentStatus: 'PAID',
    totalPaid: Number(activeOrder.totalAmount || 0),
    paymentId:
      paymentResponse?.razorpay_payment_id || null,
    bookingStatus: 'COMPLETED',
    serviceStatus: 'completed',
    currentStep: 5,
    paidAt: new Date().toISOString()
  });

  addNotification('partner', {
    title: 'Payment Received',
    desc:
      `${activeOrder.customerName || 'Customer'} has completed payment for ${activeOrder.serviceTitle}.`,
    screen: 'partner',
    tab: 'jobs'
  });

  addNotification('member', {
    title: 'Payment Successful',
    desc:
      `Payment received successfully for ${activeOrder.serviceTitle}.`,
    screen: 'tracking',
    tab: 'requests'
  });

  showToast('Payment successful!');

  return true;
};

  // =========================================================
  // Rating
  // =========================================================

  const submitRating = (
    stars,
    feedback = ''
  ) => {

    updateActiveOrder({
      rating: stars,
      feedback
    });


    // Save the rating on the partner's booking request. The partner's
    // device listens there and builds its reviews and rating from it.
    const requestId =
      activeOrder.requestId ||
      activeOrder.orderId;

    if (
      isFirebaseConfigured &&
      db &&
      activeOrder.partnerId &&
      requestId
    ) {
      update(
        ref(
          db,
          `bookingRequests/${activeOrder.partnerId}/${requestId}`
        ),
        {
          rating: stars,
          feedback,
          ratedAt: Date.now()
        }
      ).catch((error) => {
        console.error(
          '❌ Failed to save rating:',
          error
        );
      });
    }


    showToast(
      'Thanks for your feedback! Rating submitted.'
    );
  };


  // =========================================================
  // Partner Duty
  // =========================================================

  const togglePartnerDuty = () => {

    setIsPartnerOnline(
      (prev) => {

        const newState =
          !prev;


        showToast(
          newState
            ? 'You are now ONLINE. Receiving local orders within 5km.'
            : 'You are now OFFLINE.'
        );


        return newState;
      }
    );
  };


  // =========================================================
// Accept / Decline Job
// =========================================================

const acceptIncomingJob = async () => {
  const requestId =
    incomingJobDetails?.requestId;

  const partnerId =
    incomingJobDetails?.partnerId ||
    partnerProfile?.id;

  if (!requestId) {
    showToast(
      'This job request is missing its booking ID. Please refresh and try again.'
    );
    return;
  }

  const acceptedPartnerName =
    partnerProfile?.name?.trim() ||
    authUser?.displayName?.trim() ||
    'KOODAM Partner';

  // Never accept a job that overlaps one the partner already has
  const requestedStart = Number(incomingJobDetails?.scheduledAt);

  if (Number.isFinite(requestedStart) && requestedStart > 0) {
    let bookedRanges = jobsToTimeRanges(partnerUpcomingJobs);

    try {
      const response = await fetch(
        `${BACKEND_URL}/partners/${partnerId}/busy-slots`
      );

      if (response.ok) {
        bookedRanges = toTimeRanges(await response.json());
      }
    } catch (error) {
      console.error('Failed to check partner schedule:', error);
    }

    const clash = findClash(
      requestedStart,
      DEFAULT_JOB_MINUTES,
      bookedRanges
    );

    if (clash) {
      const clashTime = new Date(clash.start).toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit'
      });

      showToast(
        `You already have a job at ${clashTime}. Decline this request to avoid a double booking.`
      );
      return;
    }
  }

  try {
    if (isFirebaseConfigured && db) {
      await update(
        ref(
          db,
          `bookingRequests/${partnerId}/${requestId}`
        ),
        {
          status: 'ACCEPTED',
          bookingStatus: 'ACCEPTED',
          acceptedAt: Date.now(),
          acceptedPartnerId: partnerId,
          acceptedPartnerName
        }
      );

      await update(
        ref(
          db,
          `orders/${toDbKey(requestId)}`
        ),
        {
          orderId: requestId,
          requestId,
          partnerId,
          helperName: acceptedPartnerName,
          bookingStatus: 'ACCEPTED',
          status: 'ACCEPTED',
          currentStep: 3,
serviceStatus: 'en_route',
etaMinutes: 12,
          acceptedAt: Date.now()
        }
      );
    }

    setHasIncomingJob(false);

    setActiveOrder((prev) => ({
      ...prev,
      orderId: requestId,
      requestId,
      partnerId,
      helperName: acceptedPartnerName,
      customerName: incomingJobDetails.customerName,
      customerAvatar: incomingJobDetails.customerAvatar,
      bookingStatus: 'ACCEPTED',
      status: 'ACCEPTED',
      currentStep: 3,
serviceStatus: 'en_route',
etaMinutes: 12,
    }));

    setChatPartner({
      name: incomingJobDetails.customerName || 'KOODAM Customer',
      avatar: incomingJobDetails.customerAvatar || '',
      customerId: incomingJobDetails.customerId
    });

    // The member is notified by their own Firebase order listener

    showToast(
      `Job accepted! ${acceptedPartnerName} is on the way.`
    );
  } catch (error) {
    console.error(
      '❌ Failed to accept booking:',
      error
    );

    showToast(
      error?.message ||
      'Unable to accept this booking request. Please try again.'
    );
  }
};

const declineIncomingJob = async () => {
  const requestId =
    incomingJobDetails?.requestId;

  const partnerId =
    incomingJobDetails?.partnerId ||
    partnerProfile?.id;

  if (requestId && isFirebaseConfigured && db) {
    try {
      await update(
        ref(
          db,
          `bookingRequests/${partnerId}/${requestId}`
        ),
        {
          status: 'DECLINED',
          bookingStatus: 'DECLINED',
          declinedAt: Date.now(),
          declinedPartnerId: partnerId
        }
      );

      await update(
        ref(
          db,
          `orders/${toDbKey(requestId)}`
        ),
        {
          bookingStatus: 'DECLINED',
          status: 'DECLINED',
          declinedAt: Date.now()
        }
      );
    } catch (error) {
      console.error(
        '❌ Failed to decline booking:',
        error
      );
      showToast(
        error?.message ||
        'Unable to decline this request.'
      );
      return;
    }
  }

  setHasIncomingJob(false);

  // The member is notified by their own Firebase order listener

  showToast('Job request declined.');
};

// =========================================================
  // Chat
  // =========================================================

  const sendChatMessage = (
    text
  ) => {

    if (!text.trim()) {
      return;
    }


    const now =
      new Date();


    const timeStr =
      now.toLocaleTimeString(
        [],
        {
          hour: '2-digit',
          minute: '2-digit'
        }
      );


    const senderRole =
      role === 'partner'
        ? 'partner'
        : 'member';


    const newMsg = {

      sender:
        senderRole,

      text:
        text.trim(),

      time:
        timeStr,

      ts:
        Date.now()
    };


    if (
      isFirebaseConfigured &&
      db &&
      activeOrder.orderId
    ) {

      push(
        ref(
          db,
          `chats/${toDbKey(activeOrder.orderId)}/messages`
        ),
        newMsg
      );

    } else {

      setMessages(
        (prev) => [
          ...prev,
          {
            id: Date.now(),
            ...newMsg
          }
        ]
      );


      // Offline demo fallback only
      setTimeout(() => {

        const replyRole =
          senderRole === 'member'
            ? 'partner'
            : 'member';


        setMessages(
          (prev) => [
            ...prev,

            {
              id:
                Date.now() + 1,

              sender:
                replyRole,

              text:
                'Got it! I am right outside your apartment gate.',

              time:
                new Date().toLocaleTimeString(
                  [],
                  {
                    hour: '2-digit',
                    minute: '2-digit'
                  }
                )
            }
          ]
        );

      }, 1800);
    }
  };


// =========================================================
// Provider
// =========================================================

return (
  <AppContext.Provider
    value={{

      role,
      setRole,

      currentScreen,
      setCurrentScreen,

      activeTab,
      setActiveTab,

      language,
      setLanguage,

      location,
      setLocation,

      isLocationModalOpen,
      setIsLocationModalOpen,

      authUser,
      authLoading,

      partnerKyc,

      signUp,
      signIn,
      signInWithGoogle,
      logout,
      requestPasswordReset,

      userProfile,
      updateUserProfile,

      partnerProfile,
      updatePartnerProfile,

      notificationsEnabled,
      setNotificationsEnabled,

      changePassword,

      selectedHelper,
      setSelectedHelper,

      selectedService,
      setSelectedService,

      selectedDate,
      setSelectedDate,

      selectedTime,
      setSelectedTime,

      trustFee,

      activeOrder,
      setActiveOrder,

      partnerLocation,
      isSharingLocation,

      startSharingLocation,
      stopSharingLocation,

      liveDistanceKm,
      liveEtaMinutes,

      destinationCoords:
        DESTINATION_COORDS,

      isFirebaseConfigured,

      isPartnerOnline,

      partnerStats,
      partnerUpcomingJobs,
      refreshPartnerOverview,
      cycleServiceRadius,

      hasIncomingJob,
      incomingCountdown,
      incomingJobDetails,

      notifications,
      addNotification,
      markNotificationsRead,

      reviews,

      isChatOpen,
      setIsChatOpen,

      chatPartner,
      setChatPartner,

      messages,

      isEmergencyModalOpen,
      setIsEmergencyModalOpen,

      toastMessage,
      showToast,

      navigateTo,

      handleSelectMember,
      handleSelectPartner,

      handleBookHelper,
      handleVoiceBooking,

      handleProceedToPayment,
      handleConfirmBooking,

      advanceOrderStatus,

      verifyArrivalOtp,
      verifyCompletionOtp,
      requestExtraCharge,
      respondToExtraCharge,
      markPaymentCompleted,

      submitRating,

      togglePartnerDuty,

      acceptIncomingJob,
      declineIncomingJob,

      sendChatMessage
    }}
  >
    {children}
  </AppContext.Provider>
);
};


// =========================================================
// useApp
// =========================================================

export const useApp = () => {

  const context =
    useContext(AppContext);

  if (!context) {
    throw new Error(
      'useApp must be used within an AppProvider'
    );
  }

  return context;
};