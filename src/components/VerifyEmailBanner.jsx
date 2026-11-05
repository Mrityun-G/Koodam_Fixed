import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

// A quiet strip above the app asking people to confirm their email.
//
// It is a reminder, not a gate: a member who signed up to book a plumber
// today should not be locked out waiting on an inbox. But an
// unconfirmed address means password resets and receipts go nowhere, so
// it stays visible until they follow the link.
export const VerifyEmailBanner = () => {
  const {
    emailVerified,
    authUser,
    role,
    resendVerificationEmail,
    refreshEmailVerified
  } = useApp();

  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const signedIn = role === 'member' || role === 'partner';

  if (emailVerified || !authUser || !signedIn || dismissed) {
    return null;
  }

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 bg-[#FFF3D5] border-b border-[#FFE7A8] px-4 py-2.5">
      <div className="flex items-start gap-2.5">
        <span
          className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-[#F47B16]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          mark_email_unread
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-[#101F55]">
            Confirm your email address
          </p>

          <p className="mt-0.5 text-[10px] leading-relaxed text-[#101F55]">
            {`We sent a link to ${authUser.email}. Confirming it lets you reset your password and receive booking receipts.`}
          </p>

          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(resendVerificationEmail)}
              className="text-[10px] font-bold text-[#101F55] underline disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Resend link'}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => run(refreshEmailVerified)}
              className="text-[10px] font-bold text-[#101F55] underline disabled:opacity-50"
            >
              I&apos;ve confirmed it
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Hide this reminder"
          className="-mr-1 shrink-0 rounded-full p-1 text-[#101F55]/60 hover:bg-[#FFE7A8] hover:text-[#101F55]"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  );
};
