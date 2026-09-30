import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef
} from 'react';

import { ref, onValue, set, update, remove, push } from 'firebase/database';

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile
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

  const [activeTab, setActiveTab] = useState('home');

  const [language, setLanguage] = useState('en');

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

const [userProfile, setUserProfile] = useState({
  id: null,
  firebase_uid: null,
  name: '',
  email: '',
  phone: '',
  avatar: '',
  role: 'MEMBER'
});


// =========================================================
// Service Partner Profile
// =========================================================

const [partnerProfile, setPartnerProfile] = useState({
  id: null,
  firebase_uid: null,
  name: '',
  email: '',
  phone: '',
  avatar: '',
  role: 'PARTNER'
});

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


  const [selectedDate, setSelectedDate] =
    useState('Today 22');

  const [selectedTime, setSelectedTime] =
    useState('10:30 AM - 11:30 AM');

  const [trustFee] = useState(20);


// =========================================================
// Active Order / Live Tracking
// =========================================================

const [activeOrder, setActiveOrder] = useState({
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
});

  // =========================================================
  // Firebase Active Order Listener
  // =========================================================

  useEffect(() => {
    if (
      !isFirebaseConfigured ||
      !db ||
      !activeOrder.orderId
    ) {
      return;
    }

    const orderRef = ref(
      db,
      `orders/${toDbKey(activeOrder.orderId)}`
    );

    const unsubscribe = onValue(
      orderRef,
      (snapshot) => {
        const val = snapshot.val();

        if (val) {
          setActiveOrder((prev) => ({
            ...prev,
            ...val
          }));
        }
      }
    );

    return () => unsubscribe();
  }, [activeOrder.orderId]);


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
      }
    );

    return () => unsubscribe();
  }, [activeOrder.orderId]);


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
          showToast(
            `Location error: ${err.message}`
          );

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
      todayEarnings: 1850,
      completedJobs: 3,
      weeklyBalance: 9420,
      rating: 4.9,
      reviews: 184
    });


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
// PARTNER: LISTEN FOR INCOMING BOOKING REQUESTS
// ==========================================
useEffect(() => {
  if (
    !isFirebaseConfigured ||
    !db ||
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
      // Resolve the actual Partner ID from the logged-in User ID
      
const response = await fetch(
  `${API_BASE_URL}/partner-services/user/${partnerProfile.id}`
);

if (!response.ok) {
  throw new Error(
    `Partner services lookup failed: ${response.status}`
  );
}

const partnerServices = await response.json();

// Find an active service and extract its actual Partner ID
const activeService = partnerServices.find(
  (service) => service.is_active && service.partner_id
);

if (!activeService) {
  throw new Error(
    "No active partner service found for this user"
  );
}

const partnerId = activeService.partner_id;

if (cancelled) return;

console.log("👤 Logged-in User ID:", partnerProfile.id);
console.log("🆔 Resolved Partner ID:", partnerId);

const requestPath = `bookingRequests/${partnerId}`;

console.log(
  "👂 Listening for booking requests:",
  requestPath
);

const requestsRef = ref(db, requestPath);

      unsubscribe = onValue(
        requestsRef,
        (snapshot) => {
          const data = snapshot.val();

          console.log('📥 PARTNER BOOKING DATA:', data);

          if (!data) {
            setHasIncomingJob(false);
            return;
          }

          const requests = Object.entries(data)
            .map(([requestId, request]) => ({
              requestId,
              ...request
            }))
            .filter(
              (request) =>
                request.status === 'PENDING'
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
              latestRequest.partnerId || null,
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
            customerRating:
              latestRequest.customerRating || 5
          });

          setHasIncomingJob(true);

          setIncomingCountdown(
            latestRequest.expiresIn || 105
          );

          console.log(
            '🚨 NEW PARTNER REQUEST:',
            latestRequest
          );
        },
        (error) => {
          console.error(
            '❌ Booking request listener error:',
            error
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
      }
    );

    return () => unsubscribe();
  }, [activeOrder.orderId]);


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

  const navigateTo = (
    screen,
    tab = null
  ) => {
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
    voterIdFile
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
    // Existing KOODAM navigation
    // -------------------------------------------------------

    enterRole(targetRole);

    showToast(
      `Welcome to KOODAM, ${name || 'there'}!`
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
  // Logout
  // =========================================================

  const logout = async () => {

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
        'Today 22'
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

        createdAt:
          Date.now(),

        expiresIn: 105
      };

      await set(requestRef, bookingRequest);

      createdRequestId = requestRef.key;

      // One canonical order is shared by the customer and partner.
      safetyPin = String(
        Math.floor(1000 + Math.random() * 9000)
      );

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
          helperName: selectedHelper.name,
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
          createdAt: Date.now()
        }
      );

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

const verifyArrivalOtp = (code) => {
  // Ensure the partner has accepted the booking
  if (activeOrder.bookingStatus !== 'ACCEPTED') {
    showToast(
      'Waiting for the partner to accept your booking request.'
    );
    return false;
  }

  // Verify the customer's arrival OTP
  if (
    String(code).trim() !==
    String(activeOrder.safetyPin)
  ) {
    showToast(
      'Incorrect arrival code — ask the customer to confirm it.'
    );
    return false;
  }

  // Generate the completion OTP for the service
  const completionOtp = String(
    Math.floor(1000 + Math.random() * 9000)
  );

  // Mark service as started, not completed or paid
  updateActiveOrder({
    currentStep: 4,
    completionOtp,
    serviceStatus: 'in_progress',
    etaMinutes: 0,
    rating: null,
    feedback: ''
  });

  // Notify customer that the service has started
  addNotification('member', {
    title: 'Work Started',
    desc:
      `${activeOrder.helperName} verified your arrival code and has started the service.`,
    screen: 'tracking',
    tab: 'requests'
  });

  showToast(
    'Arrival code verified — work has started!'
  );

  return true;
};

// =========================================================
// Verify Completion OTP
// =========================================================

const verifyCompletionOtp = (code) => {
  if (
    activeOrder.currentStep !== 4 ||
    !activeOrder.completionOtp
  ) {
    showToast(
      'The service must be in progress before completion can be verified.'
    );
    return false;
  }

  if (
    String(code).trim() !==
    String(activeOrder.completionOtp)
  ) {
    showToast(
      'Incorrect completion code — ask your service partner to confirm it.'
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


    setReviews(
      (prev) => [
        {
          id:
            Date.now() +
            Math.random(),

          orderId:
            activeOrder.orderId,

          serviceTitle:
            activeOrder.serviceTitle,

          stars,

          feedback,

          time:
            'Just now'
        },

        ...prev
      ]
    );


    setPartnerStats(
      (prev) => {

        const totalScore =
          prev.rating *
          prev.reviews +
          stars;


        const newReviews =
          prev.reviews + 1;


        return {
          ...prev,

          rating:
            Math.round(
              (
                totalScore /
                newReviews
              ) * 100
            ) / 100,

          reviews:
            newReviews
        };
      }
    );


    addNotification(
      'partner',
      {
        title:
          'New Rating Received',

        desc:
          `You were rated ${stars}★ for ${activeOrder.serviceTitle}${
            feedback
              ? `: "${feedback}"`
              : '.'
          }`
      }
    );


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
      bookingStatus: 'ACCEPTED',
      status: 'ACCEPTED',
      currentStep: 3,
serviceStatus: 'en_route',
etaMinutes: 12,
    }));

    setChatPartner(acceptedPartnerName);

    addNotification(
      'member',
      {
        title: 'Booking Accepted!',
        desc:
          `${acceptedPartnerName} accepted your request for ${incomingJobDetails.title}.`,
        screen: 'tracking',
        tab: 'requests'
      }
    );

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

  addNotification(
    'member',
    {
      title: 'Booking Declined',
      desc:
        `${partnerProfile?.name || 'The selected partner'} declined your request.`
    }
  );

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