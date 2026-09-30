import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { MobileFrame } from './components/MobileFrame';
import { LandingScreen } from './screens/LandingScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { AuthScreen } from './screens/AuthScreen';
import { UserHomeScreen } from './screens/UserHomeScreen';
import { BookingScreen } from './screens/BookingScreen';
import { PaymentScreen } from './screens/PaymentScreen';
import { LiveTrackingScreen } from './screens/LiveTrackingScreen';
import { PartnerDashboard } from './screens/PartnerDashboard';
import { ProfileScreen } from './screens/ProfileScreen';
import { EditProfileScreen } from './screens/EditProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { FAQScreen } from './screens/FAQScreen';
import { TermsScreen } from './screens/TermsScreen';
import { ChatModal } from './components/ChatModal';
import { EmergencyModal } from './components/EmergencyModal';

const AppContent = () => {
  const { currentScreen, toastMessage } = useApp();

  return (
    <MobileFrame>
      {/* Dynamic Screen Routing */}
      {currentScreen === 'landing' && <LandingScreen />}
      {currentScreen === 'welcome' && <WelcomeScreen />}
      {(currentScreen === 'memberLogin' ||
        currentScreen === 'memberSignup' ||
        currentScreen === 'partnerLogin' ||
        currentScreen === 'partnerSignup') && <AuthScreen />}
      {currentScreen === 'home' && <UserHomeScreen />}
      {currentScreen === 'booking' && <BookingScreen />}
      {currentScreen === 'payment' && <PaymentScreen />}
      {currentScreen === 'tracking' && <LiveTrackingScreen />}
      {currentScreen === 'partner' && <PartnerDashboard />}
      {currentScreen === 'profile' && <ProfileScreen />}
      {currentScreen === 'editProfile' && <EditProfileScreen />}
      {currentScreen === 'settings' && <SettingsScreen />}
      {currentScreen === 'resetPassword' && <ResetPasswordScreen />}
      {currentScreen === 'faq' && <FAQScreen />}
      {currentScreen === 'terms' && <TermsScreen />}

      {/* Global Modals & Overlays */}
      <ChatModal />
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
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
