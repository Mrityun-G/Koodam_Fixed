import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Header } from '../components/Header';
import { NavigationBar } from '../components/NavigationBar';
import { Avatar } from '../components/Avatar';
import { authorizedFetch } from '../lib/authorizedFetch';

export const ProfileScreen = () => {
  const { userProfile, partnerProfile, role, navigateTo, logout } = useApp();
  const profile = role === 'partner' ? partnerProfile : userProfile;

  // GigEzee staff get the escalations screen (the backend decides who)
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    authorizedFetch('/admin/me')
      .then((data) => setIsAdmin(Boolean(data?.is_admin)))
      .catch(() => setIsAdmin(false));
  }, []);

  // The same menu as before, in three cards: account, help, and staff
  const menuGroups = [
    {
      title: 'Account',
      items: [
        { id: 'editProfile', icon: 'edit', label: 'Edit Profile', desc: 'Name, phone, email & photo', screen: 'editProfile' },
        // Customers only: partners see their earnings in the Partner Hub
        ...(role === 'partner'
          ? []
          : [{ id: 'billing', icon: 'receipt_long', label: 'Billing History', desc: 'Bills, extra parts & payments', screen: 'billing' }]),
        { id: 'settings', icon: 'settings', label: 'Settings', desc: 'Notifications, language & location', screen: 'settings' },
        { id: 'resetPassword', icon: 'lock_reset', label: 'Reset Password', desc: 'Update your account password', screen: 'resetPassword' }
      ]
    },
    {
      title: 'Help & Policies',
      items: [
        { id: 'faq', icon: 'help', label: 'FAQ', desc: 'Answers to common questions', screen: 'faq' },
        { id: 'terms', icon: 'policy', label: 'Terms & Policy', desc: 'Terms of service & privacy policy', screen: 'terms' }
      ]
    },
    ...(isAdmin
      ? [{
          title: 'GigEzee Staff',
          items: [{ id: 'admin', icon: 'gavel', label: 'Partner Escalations', desc: 'GigEzee staff: complaints, withdrawals, settings & app text', screen: 'admin' }]
        }]
      : [])
  ];

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#FFF3D5] min-h-screen">
      <Header subtitle="Profile" />

      <main className="flex-1 flex flex-col relative w-full pb-6 px-4 gap-4 pt-4">
        {/* Profile Summary Card, styled like the Welcome Screen's card:
            white into cream, with a gold and navy edge along the top */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-white to-[#FFF7E0] border border-[#E6E9F4] shadow-lg shadow-[#101F55]/10">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#101F55] via-[#FFC928] to-[#101F55]" />
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#FFF4CC] pointer-events-none" />

          <div className="relative p-4 flex items-center gap-3.5">
            <div className="relative shrink-0">
              <Avatar
                src={profile.avatar}
                name={profile.name}
                className="w-16 h-16 rounded-2xl ring-4 ring-[#FFF3D5]"
                textClassName="text-2xl"
                colourClassName="bg-gradient-to-br from-[#FFD65A] to-[#FFC928] text-[#101F55]"
              />
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#101F55] text-[#FFC928] flex items-center justify-center ring-2 ring-white">
                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {role === 'partner' ? 'handyman' : 'home'}
                </span>
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold text-[#101F55] truncate tracking-tight">{profile.name}</h2>
              <p className="text-xs text-[#4E5C92] truncate">{profile.email}</p>
              {profile.phone && (
                <p className="text-xs text-[#4E5C92] truncate">{profile.phone}</p>
              )}
              <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-[#101F55] bg-[#FFE7A8] border border-[#FFC928]/50 pl-1.5 pr-2 py-0.5 rounded-full">
                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified
                </span>
                {role === 'partner' ? 'Service Partner' : 'Community Member'}
              </span>
            </div>

            <button
              aria-label="Edit Profile"
              onClick={() => navigateTo('editProfile', 'profile')}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-[#FFF3D5] hover:bg-[#FFE7A8] text-[#F47B16] border border-[#FFC928]/40 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[19px]">edit</span>
            </button>
          </div>
        </div>

        {/* Menu cards */}
        {menuGroups.map(group => (
          <section key={group.title} className="flex flex-col gap-1.5">
            <h3 className="px-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#4E5C92]">
              {group.title}
            </h3>

            <div className="bg-white rounded-2xl shadow-sm shadow-[#101F55]/5 border border-[#E6E9F4] divide-y divide-[#E6E9F4] overflow-hidden">
              {group.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.screen, 'profile')}
                  className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-[#FFF7E0] active:bg-[#FFF3D5] transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-[#FFF3D5] flex items-center justify-center text-[#F47B16] shrink-0">
                    <span className="material-symbols-outlined text-[19px]">{item.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[#101F55]">{item.label}</p>
                    <p className="text-[11px] text-[#4E5C92] truncate">{item.desc}</p>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-[#101F55]/60 shrink-0">chevron_right</span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {/* Log Out, kept apart from the settings */}
        <button
          onClick={logout}
          className="mt-1 w-full flex items-center gap-3 px-3.5 py-3 bg-white rounded-2xl shadow-sm shadow-[#101F55]/5 border border-[#FFC928]/50 hover:bg-[#FFF7E0] active:bg-[#FFF3D5] transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-[#FFE7A8] flex items-center justify-center text-[#F47B16] shrink-0">
            <span className="material-symbols-outlined text-[19px]">logout</span>
          </div>
          <p className="flex-1 text-[13px] font-bold text-[#F47B16]">Log Out</p>
          <span className="material-symbols-outlined text-[18px] text-[#F47B16]/70 shrink-0">chevron_right</span>
        </button>
      </main>

      <NavigationBar />
    </div>
  );
};
