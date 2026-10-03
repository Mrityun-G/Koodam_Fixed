import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import {
  getAuth,
  initializeAuth,
  browserSessionPersistence,
  browserPopupRedirectResolver
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// True only once every required key is present, so the app can run without
// crashing before .env is filled in — live-tracking features just no-op.
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId
);

export const firebaseApp = isFirebaseConfigured
  ? getApps()[0] || initializeApp(firebaseConfig)
  : null;

export const db = isFirebaseConfigured ? getDatabase(firebaseApp) : null;
// During local development (npm run dev) each tab keeps its own sign-in,
// so a customer and a partner can be tested side by side in one browser.
// Built apps keep the normal sign-in shared by every tab.
const createAuth = () => {
  if (!import.meta.env.DEV) {
    return getAuth(firebaseApp);
  }

  try {
    return initializeAuth(firebaseApp, {
      persistence: browserSessionPersistence,
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } catch {
    // Already set up (hot reload re-runs this file)
    return getAuth(firebaseApp);
  }
};

export const auth = isFirebaseConfigured ? createAuth() : null;

// Only set up once a storage bucket is actually configured — used to upload
// service partner KYC documents (Aadhaar/PAN/Voter ID).
export const isStorageConfigured = isFirebaseConfigured && Boolean(firebaseConfig.storageBucket);
export const storage = isStorageConfigured ? getStorage(firebaseApp) : null;
