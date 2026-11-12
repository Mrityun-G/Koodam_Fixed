import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

// Confirmation before an account is deleted.
//
// Deleting cannot be undone, so it asks the person to type DELETE rather
// than tapping one more button. It also says plainly what goes and what
// has to be kept: paid bookings stay on record for tax and dispute
// reasons, with the personal details stripped out of them.
const CONFIRM_WORD = 'DELETE';

export const DeleteAccountDialog = ({ onClose }) => {
  const { deleteAccount, role, authLoading } = useApp();

  const [typed, setTyped] = useState('');

  const canDelete = typed.trim().toUpperCase() === CONFIRM_WORD;

  const handleDelete = async () => {
    if (!canDelete) return;

    const done = await deleteAccount();

    // On failure the toast explains why (usually a job still running),
    // and the dialog stays open so they can read it and go back.
    if (done) {
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-end justify-center bg-black/50 px-4 pb-6 pt-10 animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
          <span
            className="material-symbols-outlined text-[28px] text-red-500"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            delete_forever
          </span>
        </div>

        <h2 className="text-center text-base font-extrabold text-[#0b1c30]">
          Delete your account?
        </h2>

        <p className="mt-2 text-center text-xs leading-relaxed text-[#4e5c92]">
          This cannot be undone.
        </p>

        <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3.5">
          <p className="text-[11px] font-bold text-[#0b1c30]">What happens</p>

          <ul className="space-y-1.5">
            {[
              'Your name, email, phone and photo are erased.',
              role === 'partner'
                ? 'Your uploaded ID documents are deleted, and your listings come down.'
                : 'Your saved address and booking history stop being linked to you.',
              'Past paid bookings stay on record without your details, as the law requires.',
              'You will not be able to log in again with this email.'
            ].map((line) => (
              <li key={line} className="flex gap-2 text-[11px] leading-relaxed text-[#4e5c92]">
                <span className="shrink-0 text-slate-300">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <label className="mt-4 block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {`Type ${CONFIRM_WORD} to confirm`}
          </span>

          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            autoCapitalize="characters"
            className="mt-1.5 w-full rounded-full border border-slate-200 bg-[#f8f9ff] px-4 py-2.5 text-center text-sm font-bold tracking-widest text-[#0b1c30] placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/50"
          />
        </label>

        <button
          type="button"
          onClick={handleDelete}
          disabled={!canDelete || authLoading}
          className="mt-4 w-full rounded-full bg-red-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 transition-all active:scale-98 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {authLoading ? 'Deleting…' : 'Delete my account'}
        </button>

        <button
          type="button"
          onClick={onClose}
          disabled={authLoading}
          className="mt-2 w-full rounded-full border border-slate-200 bg-white py-3.5 text-sm font-bold text-[#0b1c30] transition-all active:scale-98 disabled:opacity-50"
        >
          Keep my account
        </button>
      </div>
    </div>
  );
};
