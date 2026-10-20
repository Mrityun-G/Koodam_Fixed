import React, { Suspense, lazy, useEffect } from 'react';
import { AppProvider, useApp, PORTAL } from './context/AppContext';
import { MobileFrame } from './components/MobileFrame';
import { ErrorBoundary } from './components/ErrorBoundary';
import { VerifyEmailBanner } from './components/VerifyEmailBanner';
import { LandingScreen } from './screens/LandingScreen';
import { OfflineModeScreen } from './screens/OfflineModeScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { AuthScreen } from './screens/AuthScreen';
import { ChatModal } from './components/ChatModal';
import { EmergencyModal } from './components/EmergencyModal';
import { startDomTranslator } from './lib/domTranslator';

// The four screens above are what a cold visitor sees first, so they ship
// in the main bundle. Everything below is only reachable once somebody has
// signed in, so it downloads when they go there instead of making every
// visitor wait for it. The map screens pull in Leaflet and the admin screen
// is opened by a handful of people, so those are the biggest savings.
const screen = (load, name) =>
  lazy(() => load().then((module) => ({ default: module[name] })));

const OnboardingScreen = screen(() => import('./screens/OnboardingScreen'), 'OnboardingScreen');
const UserHomeScreen = screen(() => import('./screens/UserHomeScreen'), 'UserHomeScreen');
const BookingScreen = screen(() => import('./screens/BookingScreen'), 'BookingScreen');
const DiagnoseScreen = screen(() => import('./screens/DiagnoseScreen'), 'DiagnoseScreen');
const PaymentScreen = screen(() => import('./screens/PaymentScreen'), 'PaymentScreen');
const AdminEscalationsScreen = screen(() => import('./screens/AdminEscalationsScreen'), 'AdminEscalationsScreen');
const LiveTrackingScreen = screen(() => import('./screens/LiveTrackingScreen'), 'LiveTrackingScreen');
const NearbyMapScreen = screen(() => import('./screens/NearbyMapScreen'), 'NearbyMapScreen');
const PartnerDashboard = screen(() => import('./screens/PartnerDashboard'), 'PartnerDashboard');
const ProfileScreen = screen(() => import('./screens/ProfileScreen'), 'ProfileScreen');
const EditProfileScreen = screen(() => import('./screens/EditProfileScreen'), 'EditProfileScreen');
const SettingsScreen = screen(() => import('./screens/SettingsScreen'), 'SettingsScreen');
const ResetPasswordScreen = screen(() => import('./screens/ResetPasswordScreen'), 'ResetPasswordScreen');
const FAQScreen = screen(() => import('./screens/FAQScreen'), 'FAQScreen');
const TermsScreen = screen(() => import('./screens/TermsScreen'), 'TermsScreen');
const BillingScreen = screen(() => import('./screens/BillingScreen'), 'BillingScreen');
const NotFoundScreen = screen(() => import('./screens/NotFoundScreen'), 'NotFoundScreen');

// One screen per entry, so an unknown value falls through to the not-found
// screen instead of rendering nothing. The chain of
// `currentScreen === '…' && <Screen />` this replaces had no final branch,
// which left a blank white page with no way back.
const SCREENS = {
  landing: LandingScreen,
  offline: OfflineModeScreen,
  welcome: WelcomeScreen,
  memberLogin: AuthScreen,
  memberSignup: AuthScreen,
  partnerLogin: AuthScreen,
  partnerSignup: AuthScreen,
  onboarding: OnboardingScreen,
  home: UserHomeScreen,
  booking: BookingScreen,
  diagnose: DiagnoseScreen,
  payment: PaymentScreen,
  tracking: LiveTrackingScreen,
  nearbyMap: NearbyMapScreen,
  partner: PartnerDashboard,
  profile: ProfileScreen,
  editProfile: EditProfileScreen,
  settings: SettingsScreen,
  resetPassword: ResetPasswordScreen,
  faq: FAQScreen,
  terms: TermsScreen,
  billing: BillingScreen,
  admin: AdminEscalationsScreen
};

// Shown while Firebase works out whether somebody is still logged in, and
// while a Google sign-in is being finished. Both are asynchronous, so
// without it every reload flashes the landing page first.
const BootSplash = () => (
  <main className="flex-1 flex flex-col items-center justify-center gap-5 w-full bg-white h-full px-6">
    {/* Rings travel outwards from behind the logo, a second apart, so the
        screen reads as working rather than stuck. */}
    <div className="relative flex items-center justify-center">
      <span className="absolute w-16 h-16 rounded-2xl bg-[#ff6a00]/20 animate-ring-out motion-reduce:hidden" />
      <span
        className="absolute w-16 h-16 rounded-2xl bg-[#ff6a00]/20 animate-ring-out motion-reduce:hidden"
        style={{ animationDelay: '1.1s' }}
      />

      <div className="relative p-1.5 rounded-2xl bg-white shadow-md animate-pop-in">
        <img
          src="/logo.svg"
          alt="GigEzee"
          width="64"
          height="64"
          className="w-16 h-16 rounded-xl"
        />
      </div>
    </div>

    <h1
      className="text-2xl font-extrabold tracking-tight text-[#0b1c30] animate-fade-up"
      style={{ animationDelay: '140ms' }}
    >
      GigEzee
      {PORTAL === 'partner' && <span className="text-[#1b2a5e]"> Partner</span>}
    </h1>

    {/* Indeterminate on purpose: we cannot know how long Firebase will take,
        and a bar that pretends to measure progress would be a lie. */}
    <div
      className="w-36 h-1 rounded-full bg-[#ffdbcc] overflow-hidden animate-fade-in"
      style={{ animationDelay: '260ms' }}
      role="progressbar"
      aria-label="Loading GigEzee"
    >
      <span className="block w-1/3 h-full rounded-full bg-[#ff6a00] animate-bar-slide" />
    </div>
  </main>
);

// A screen that hasn't been downloaded yet. Deliberately quieter than the
// boot splash: the app is already running, only this screen is on its way.
const ScreenLoading = () => (
  <main className="flex-1 flex items-center justify-center w-full bg-white h-full">
    <span className="w-6 h-6 rounded-full border-2 border-[#ffdbcc] border-t-[#ff6a00] animate-spin"></span>
  </main>
);

const AppContent = () => {
  const { currentScreen, toastMessage, language, isBooting } = useApp();

  // Show the whole app in the chosen language (English, Tamil or Kannada)
  useEffect(
    () => startDomTranslator(document.getElementById('root'), language),
    [language]
  );

  const Screen = SCREENS[currentScreen] || NotFoundScreen;

  return (
    <MobileFrame overlay={<ChatModal />}>
      {isBooting ? (
        <BootSplash />
      ) : (
        <>
          <VerifyEmailBanner />

          {/* Dynamic Screen Routing */}
          <Suspense fallback={<ScreenLoading />}>
            <Screen />
          </Suspense>
        </>
      )}

      {/* Global Modals & Overlays */}
      <EmergencyModal />

      {/* Global Tactile Toast Notification */}
      {toastMessage && (
        <div className="fixed inset-x-6 top-6 z-50 flex justify-center pointer-events-none animate-in fade-in slide-in-from-top-5 duration-200">
          <div className="bg-[#213145] text-[#eaf1ff] text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 border border-slate-700/80 max-w-sm pointer-events-auto">
            <span
              className="material-symbols-outlined text-[16px] text-[#ff6a00] shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              info
            </span>
            <span className="leading-snug">{toastMessage}</span>
          </div>
        </div>
      )}
    </MobileFrame>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
