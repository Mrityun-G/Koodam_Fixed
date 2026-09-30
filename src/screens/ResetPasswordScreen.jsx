import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SubHeader } from '../components/SubHeader';

export const ResetPasswordScreen = () => {
  const { changePassword, navigateTo, showToast } = useApp();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = () => {
    if (newPassword !== confirmPassword) {
      showToast("New password and confirmation don't match.");
      return;
    }
    const success = changePassword(currentPassword, newPassword);
    if (success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      navigateTo('profile', 'profile');
    }
  };

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff] min-h-screen">
      <SubHeader title="Reset Password" />

      <main className="flex-1 flex flex-col relative w-full pb-10 px-4 space-y-4 pt-4">
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-3.5">
          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Current Password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8f9ff] p-2.5 text-sm text-[#0b1c30] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">New Password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8f9ff] p-2.5 text-sm text-[#0b1c30] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Confirm New Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#f8f9ff] p-2.5 text-sm text-[#0b1c30] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff6a00]/40"
            />
          </label>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!currentPassword || !newPassword || !confirmPassword}
          className="w-full py-3 rounded-full bg-[#ff6a00] hover:bg-[#a14000] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-md active:scale-95 transition-all"
        >
          Update Password
        </button>
      </main>
    </div>
  );
};
