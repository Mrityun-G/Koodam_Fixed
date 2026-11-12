import React from 'react';
import { useApp } from '../context/AppContext';

// Shown when the app is asked for a screen that doesn't exist.
//
// App.jsx used to be a chain of `currentScreen === '…'` checks with no
// final branch, so an unknown value rendered nothing at all and the
// person was left on a blank white page with no way back.
export const NotFoundScreen = () => {
  const { currentScreen, role, navigateTo } = useApp();

  const goHome = () => {
    if (role === 'partner') {
      navigateTo('partner', 'home');
    } else if (role === 'member') {
      navigateTo('home', 'home');
    } else {
      navigateTo('welcome');
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full bg-[#f8f9ff] px-6 py-10 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#d3e4fe]">
        <span
          className="material-symbols-outlined text-[32px] text-[#354479]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          explore_off
        </span>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wider text-[#4e5c92]">
        Page not found
      </p>

      <h1 className="mt-1.5 text-lg font-extrabold text-[#0b1c30]">
        This screen doesn&apos;t exist
      </h1>

      <p className="mt-2 max-w-xs text-xs leading-relaxed text-[#4e5c92]">
        We couldn&apos;t find what you were looking for. It may have moved,
        or the link may be out of date.
      </p>

      <button
        type="button"
        onClick={goHome}
        className="mt-6 w-full max-w-xs rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff9a56] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#ff6a00]/30 active:scale-98 transition-all"
      >
        {role === 'welcome' ? 'Back to start' : 'Go to Home'}
      </button>

      {import.meta.env.DEV && (
        <p className="mt-5 font-mono text-[10px] text-slate-400">
          {`unknown screen: "${currentScreen}"`}
        </p>
      )}
    </div>
  );
};
