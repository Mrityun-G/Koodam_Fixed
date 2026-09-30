import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const SubHeader = ({ title, backScreen = 'profile', backTab = 'profile' }) => {
  const { navigateTo } = useApp();

  return (
    <header className="sticky top-0 inset-x-0 z-40 bg-[#f8f9ff]/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-slate-100">
      <div className="h-16 px-4 flex items-center gap-2">
        <button
          aria-label="Go Back"
          onClick={() => navigateTo(backScreen, backTab)}
          className="w-10 h-10 flex items-center justify-center rounded-full text-[#0b1c30] hover:bg-[#eff4ff] active:scale-95 transition-all shrink-0"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-base font-bold text-[#0b1c30] truncate">{title}</h1>
      </div>
    </header>
  );
};
