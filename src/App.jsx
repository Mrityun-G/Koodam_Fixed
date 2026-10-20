import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { MobileFrame } from './components/MobileFrame';
import { ErrorBoundary } from './components/ErrorBoundary';
import { VerifyEmailBanner } from './components/VerifyEmailBanner';
import { LandingScreen } from './screens/LandingScreen';
import { OfflineModeScreen } from './screens/OfflineModeScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { UserHomeScreen } from './screens/UserHomeScreen';
import { BookingScreen } from './screens/BookingScreen';
import { PaymentScreen } from './screens/PaymentScreen';
import { AdminEscalationsScreen } from './screens/AdminEscalationsScreen';
import { LiveTrackingScreen } from './screens/LiveTrackingScreen';
import { NearbyMapScreen } from './screens/NearbyMapScreen';
import { PartnerDashboard } from './screens/PartnerDashboard';
import { ProfileScreen } from './screens/ProfileScreen';
import { EditProfileScreen } from './screens/EditProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { FAQScreen } from './screens/FAQScreen';
import { TermsScreen } from './screens/TermsScreen';
import { BillingScreen } from './screens/BillingScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { ChatModal } from './components/ChatModal';
import { EmergencyModal } from './components/EmergencyModal';
import { startDomTranslator } from './lib/domTranslator';

// One screen per entry, so an unknown value can fall through to the
// not-found screen instead of rendering nothing. The old chain of
// `currentScreen === '…' && <Screen />` had no final branch, which left
// a blank white page with no way back.
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

// Shown while Firebase works out whether anyone is signed in. Without it
// the Welcome screen appears for a moment on every reload, which looks
// like having been logged out.
const BootSplash = () => (
  <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-[#f8f9ff]">
    <img
      src="/logo.svg"
      alt="KOODAM"
      className="h-14 w-14 animate-pulse object-contain"
    />
    <p className="text-[11px] font-bold uppercase tracking-wider text-[#4e5c92]">
      KOODAM
    </p>
  </div>
);

const AppContent = () => {
  const { currentScreen, toastMessage, language, authResolved } = useApp();

  // Show the whole app in the chosen language (English, Tamil or Kannada)
  useEffect(
    () => startDomTranslator(document.getElementById('root'), language),
    [language]
  );

  if (!authResolved) {
    return <BootSplash />;
  }

  const Screen = SCREENS[currentScreen] || NotFoundScreen;

  return (
    <MobileFrame overlay={<ChatModal />}>
      <VerifyEmailBanner />

      {/* Dynamic Screen Routing */}
      <Screen />

      {/* Global Modals & Overlays */}
      <EmergencyModal />

      {/* Global Tactile Toast Notification */}
      {toastMessage && (
        <div className="fixed inset-x-6 top-6 z-50 flex justify-center pointer-events-none animate-in fade-in slide-in-from-top-5 duration-200">
          <div className="bg-[#213145] text-[#eaf1ff] text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 border border-slate-700/80 max-w-sm pointer-events-auto">
            <span
              className="material-symbols-outlined text-[16px] text-[#ff6a00]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              info
            </span>
            <span className="truncate">{toastMessage}</span>
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
