import React from 'react';

export const MobileFrame = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start sm:py-6 sm:px-4 font-sans selection:bg-primary-container selection:text-white">
      {/* Main Container */}
      <div className="w-full max-w-[430px] transition-all duration-300 flex justify-center">
        {/* Device Frame */}
        <div className="w-full bg-[#f8f9ff] text-[#0b1c30] relative overflow-hidden transition-all duration-300 min-h-[890px] max-h-[920px] rounded-[48px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_0_12px_#1e293b,0_0_0_14px_#334155] border-4 border-[#0f172a] flex flex-col">
          {/* Screen Content Container with Smooth Scroll */}
          <div className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col relative bg-[#f8f9ff] overscroll-contain">
            {children}
          </div>

          {/* Phone Bottom Home Bar */}
          <div className="w-full h-5 bg-[#f8f9ff] flex items-center justify-center shrink-0 z-50 pointer-events-none">
            <div className="w-32 h-1 bg-slate-900/30 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
