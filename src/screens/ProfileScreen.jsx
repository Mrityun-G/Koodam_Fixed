import React from 'react';
import { useApp } from '../context/AppContext';
import { Header } from '../components/Header';
import { NavigationBar } from '../components/NavigationBar';

export const ProfileScreen = () => {
  const { userProfile, partnerProfile, role, navigateTo, logout } = useApp();
  const profile = role === 'partner' ? partnerProfile : userProfile;

  const menuItems = [
    { id: 'editProfile', icon: 'edit', label: 'Edit Profile', desc: 'Name, phone, email & photo', screen: 'editProfile' },
    { id: 'settings', icon: 'settings', label: 'Settings', desc: 'Notifications, language & location', screen: 'settings' },
    { id: 'resetPassword', icon: 'lock_reset', label: 'Reset Password', desc: 'Update your account password', screen: 'resetPassword' },
    { id: 'faq', icon: 'help', label: 'FAQ', desc: 'Answers to common questions', screen: 'faq' },
    { id: 'terms', icon: 'policy', label: 'Terms & Policy', desc: 'Terms of service & privacy policy', screen: 'terms' }
  ];

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">
      <Header subtitle="Profile" />

      <main className="flex-1 flex flex-col relative w-full pb-10 px-4 space-y-3.5 pt-3">
        {/* Profile Summary Card */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center gap-3">
          <img
            className="w-16 h-16 rounded-2xl object-cover shadow-xs shrink-0"
            alt={profile.name}
            src={profile.avatar}
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-[#0b1c30] truncate">{profile.name}</h2>
            <p className="text-xs text-slate-500 truncate">{profile.email}</p>
            <p className="text-xs text-slate-500 truncate">{profile.phone}</p>
            <span className="inline-block mt-1 text-[10px] font-bold text-[#a14000] bg-[#eff4ff] px-2 py-0.5 rounded-full">
              {role === 'partner' ? 'Service Partner' : 'Community Member'}
            </span>
          </div>
          <button
            aria-label="Edit Profile"
            onClick={() => navigateTo('editProfile', 'profile')}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#a14000] active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>
        </div>

        {/* Menu List */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-100 divide-y divide-slate-100 overflow-hidden">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => navigateTo(item.screen, 'profile')}
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-[#eff4ff] flex items-center justify-center text-[#a14000] shrink-0">
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#0b1c30]">{item.label}</p>
                <p className="text-[11px] text-slate-500 truncate">{item.desc}</p>
              </div>
              <span className="material-symbols-outlined text-[18px] text-slate-300 shrink-0">chevron_right</span>
            </button>
          ))}
        </div>

        {/* Log Out */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 p-3.5 bg-white rounded-2xl shadow-xs border border-red-100 hover:bg-red-50 active:bg-red-100 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center text-red-500 shrink-0">
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </div>
          <p className="text-xs font-bold text-red-500">Log Out</p>
        </button>
      </main>

      <NavigationBar />
    </div>
  );
};
