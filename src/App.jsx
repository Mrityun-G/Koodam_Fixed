import React, { useEffect } from 'react';
import { AppProvider, useApp, PORTAL } from './context/AppContext';
import { MobileFrame } from './components/MobileFrame';
import { LandingScreen } from './screens/LandingScreen';
import { OfflineModeScreen } from './screens/OfflineModeScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { AuthScreen } from './screens/AuthScreen';
import { UserHomeScreen } from './screens/UserHomeScreen';
import { BookingScreen } from './screens/BookingScreen';
import { DiagnoseScreen } from './screens/DiagnoseScreen';
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
import { ChatModal } from './components/ChatModal';
import { EmergencyModal } from './components/EmergencyModal';
import { startDomTranslator } from './lib/domTranslator';

// Shown while Firebase works out whether somebody is still logged in, and
// while a Google sign-in is being finished. Both are asynchronous, so
// without it every reload flashes the landing page first.
const BootSplash = () => (
  <main className="flex-1 flex flex-col items-center justify-center gap-5 w-full bg-white h-full">
    <div className="p-1.5 rounded-2xl bg-white shadow-md">
      <img src="/logo.svg" alt="GigEzee" className="w-16 h-16 rounded-xl" />
    </div>
    <h1 className="text-2xl font-extrabold tracking-tight text-[#0b1c30]">
      GigEzee
      {PORTAL === 'partner' && <span className="text-[#1b2a5e]"> Partner</span>}
    </h1>
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

  return (
    <MobileFrame overlay={<ChatModal />}>
      {/* Dynamic Screen Routing */}
      {isBooting && <BootSplash />}
      {!isBooting && currentScreen === 'landing' && <LandingScreen />}
      {currentScreen === 'offline' && <OfflineModeScreen />}
      {currentScreen === 'welcome' && <WelcomeScreen />}
      {(currentScreen === 'memberLogin' ||
        currentScreen === 'memberSignup' ||
        currentScreen === 'partnerLogin' ||
        currentScreen === 'partnerSignup') && <AuthScreen />}
      {currentScreen === 'home' && <UserHomeScreen />}
      {currentScreen === 'booking' && <BookingScreen />}
      {currentScreen === 'diagnose' && <DiagnoseScreen />}
      {currentScreen === 'payment' && <PaymentScreen />}
      {currentScreen === 'tracking' && <LiveTrackingScreen />}
      {currentScreen === 'nearbyMap' && <NearbyMapScreen />}
      {currentScreen === 'partner' && <PartnerDashboard />}
      {currentScreen === 'profile' && <ProfileScreen />}
      {currentScreen === 'editProfile' && <EditProfileScreen />}
      {currentScreen === 'settings' && <SettingsScreen />}
      {currentScreen === 'resetPassword' && <ResetPasswordScreen />}
      {currentScreen === 'faq' && <FAQScreen />}
      {currentScreen === 'terms' && <TermsScreen />}
      {currentScreen === 'billing' && <BillingScreen />}
      {currentScreen === 'admin' && <AdminEscalationsScreen />}

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
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
