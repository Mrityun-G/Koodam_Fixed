import React from 'react';
import { useApp } from '../context/AppContext';

export const NavigationBar = () => {
  const { activeTab, setActiveTab, navigateTo, hasLiveRequest, setIsChatOpen } = useApp();

  const navItems = [
    { id: 'home', label: 'Home', icon: 'home', screen: 'home' },
    { id: 'search', label: 'Search', icon: 'search', screen: 'search' },
    { id: 'requests', label: 'Requests', icon: 'fact_check', screen: 'tracking', badge: hasLiveRequest },
    { id: 'chat', label: 'Chat', icon: 'chat_bubble', action: () => setIsChatOpen(true) },
    { id: 'profile', label: 'Profile', icon: 'person', screen: 'profile' }
  ];

  return (
    // White bar, navy icons and labels, a golden-yellow pill behind the
    // active tab and an orange dot for anything waiting
    <nav className="sticky bottom-0 inset-x-0 z-40 bg-white shadow-[0_-4px_18px_rgba(16,31,85,0.08)] border-t border-[#E6E9F4] rounded-t-3xl pb-safe">
      <div className="grid grid-cols-5 items-center h-[70px] px-2 max-w-lg mx-auto">
        {navItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (item.action) {
                  item.action();
                } else if (item.screen) {
                  navigateTo(item.screen, item.id);
                }
              }}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center min-h-[44px] gap-1 text-[#101F55] transition-all active:scale-95"
            >
              <div
                className={`w-12 h-8 rounded-full flex items-center justify-center relative transition-all ${
                  isActive
                    ? 'bg-[#FFC928] shadow-md shadow-[#FFC928]/40'
                    : 'hover:bg-[#FFF3D5]'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {item.badge && (
                  <span className="absolute top-0.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#F47B16] ring-2 ring-white animate-pulse"></span>
                )}
              </div>
              <span className={`text-[11px] leading-none ${isActive ? 'font-extrabold' : 'font-semibold text-[#101F55]/75'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
