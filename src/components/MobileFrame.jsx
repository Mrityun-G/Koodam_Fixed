import React from 'react';

// overlay renders over the whole phone screen (e.g. the chat), so it
// stays inside the frame instead of covering the browser window.
// On a real phone (narrower than Tailwind's sm, 640px) the app fills the
// screen; the device frame and fake home bar are only drawn on desktop.
export const MobileFrame = ({ children, overlay = null }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start sm:py-6 sm:px-4 font-sans selection:bg-primary-container selection:text-white">
      {/* Main Container */}
      <div className="w-full max-w-[430px] transition-all duration-300 flex justify-center">
        {/* Device Frame */}
        {/* id: pop-ups portal here so they cover the phone screen only */}
        <div id="phone-screen" className="w-full bg-[#f8f9ff] text-[#0b1c30] relative overflow-hidden transition-all duration-300 h-[100dvh] sm:h-[min(920px,calc(100dvh-3rem))] sm:rounded-[48px] sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_0_12px_#1e293b,0_0_0_14px_#334155] sm:border-4 sm:border-[#0f172a] pt-safe pb-safe sm:pt-0 sm:pb-0 flex flex-col">
          {/* Screen Content Container with Smooth Scroll */}
          <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col relative bg-[#f8f9ff] overscroll-contain">
            {children}
          </div>

          {overlay}

          {/* Phone Bottom Home Bar */}
          <div className="hidden sm:flex w-full h-5 bg-[#f8f9ff] items-center justify-center shrink-0 z-50 pointer-events-none">
            <div className="w-32 h-1 bg-slate-900/30 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
