import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SubHeader } from '../components/SubHeader';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';

export const SettingsScreen = () => {
  const {
    notificationsEnabled,
    setNotificationsEnabled,
    language,
    setLanguage,
    location,
    navigateTo,
    showToast
  } = useApp();

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'ta', label: 'Tamil' },
    { code: 'kn', label: 'Kannada' }
  ];

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">
      <SubHeader title="Settings" />

      <main className="flex-1 flex flex-col relative w-full pb-10 px-4 space-y-4 pt-4">
        {/* Notifications */}
        <section className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#0b1c30]">Push Notifications</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Booking updates, offers & alerts</p>
            </div>
            <button
              aria-label="Toggle Notifications"
              onClick={() => setNotificationsEnabled(prev => !prev)}
              className={`w-12 h-7 rounded-full flex items-center px-0.5 shrink-0 transition-colors ${
                notificationsEnabled ? 'bg-[#00ae78] justify-end' : 'bg-slate-200 justify-start'
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-white shadow-sm"></span>
            </button>
          </div>
        </section>

        {/* Language */}
        <section className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100">
          <p className="text-sm font-bold text-[#0b1c30] mb-2.5">Language</p>
          <div className="flex flex-col gap-1.5">
            {languages.map(l => (
              <button
                key={l.code}
                onClick={() => {
                  setLanguage(l.code);
                  showToast(`Language set to ${l.label}`);
                }}
                className={`flex items-center justify-between p-2.5 rounded-xl text-left text-sm font-semibold transition-all ${
                  language === l.code
                    ? 'bg-[#eff4ff] text-[#a14000] border-2 border-[#ff6a00]'
                    : 'bg-slate-50 hover:bg-slate-100 text-[#0b1c30] border-2 border-transparent'
                }`}
              >
                <span>{l.label}</span>
                {language === l.code && (
                  <span className="material-symbols-outlined text-[#a14000] text-lg">check_circle</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Default Location */}
        <section className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100">
          <button
            onClick={() => navigateTo('home', 'home')}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="min-w-0 text-left">
              <p className="text-sm font-bold text-[#0b1c30]">Default Location</p>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">{location} • Tap to change on Home</p>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0">chevron_right</span>
          </button>
        </section>

        {/* Legal */}
        <section className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100">
          <button
            onClick={() => navigateTo('terms')}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="min-w-0 text-left">
              <p className="text-sm font-bold text-[#0b1c30]">Terms & Privacy Policy</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                How KOODAM works and what we do with your data
              </p>
            </div>
            <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0">chevron_right</span>
          </button>
        </section>

        {/* Delete account — promised in the Privacy Policy, and required
            by both app stores. Kept last and in red so it is hard to hit
            by accident, and confirmed in a dialog before anything goes. */}
        <section className="bg-white rounded-2xl p-4 shadow-xs border border-red-100">
          <button
            onClick={() => setConfirmingDelete(true)}
            className="w-full flex items-center justify-between gap-3"
          >
            <div className="min-w-0 text-left">
              <p className="text-sm font-bold text-red-500">Delete Account</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Permanently remove your profile and personal details
              </p>
            </div>
            <span className="material-symbols-outlined text-[18px] text-red-300 shrink-0">
              delete_forever
            </span>
          </button>
        </section>
      </main>

      {confirmingDelete && (
        <DeleteAccountDialog onClose={() => setConfirmingDelete(false)} />
      )}
    </div>
  );
};
