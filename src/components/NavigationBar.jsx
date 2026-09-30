import React from 'react';
import { useApp } from '../context/AppContext';

export const NavigationBar = () => {
  const { activeTab, setActiveTab, navigateTo, activeOrder, setIsChatOpen } = useApp();

  const navItems = [
    { id: 'home', label: 'Home', icon: 'home', screen: 'home' },
    { id: 'search', label: 'Search', icon: 'search', screen: 'home' },
    { id: 'requests', label: 'Requests', icon: 'fact_check', screen: 'tracking', badge: activeOrder ? true : false },
    { id: 'chat', label: 'Chat', icon: 'chat_bubble', action: () => setIsChatOpen(true) },
    { id: 'profile', label: 'Profile', icon: 'person', screen: 'profile' }
  ];

  return (
    <nav className="sticky bottom-0 inset-x-0 z-40 bg-[#f8f9ff]/95 backdrop-blur-xl shadow-[0_-2px_12px_rgba(27,42,94,0.06)] border-t border-slate-100 pb-safe">
      <div className="flex justify-around items-center h-18 px-2 max-w-lg mx-auto py-1">
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
              className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] gap-1 transition-all ${
                isActive
                  ? 'text-[#a14000] font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`w-11 h-7 rounded-full flex items-center justify-center relative transition-colors ${
                  isActive ? 'bg-[#ffdbcc] text-[#a14000]' : 'text-slate-600'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {item.badge && (
                  <span className="absolute top-0 right-1 w-2.5 h-2.5 rounded-full bg-[#ff6a00] ring-2 ring-[#f8f9ff] animate-pulse"></span>
                )}
              </div>
              <span className="text-[11px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
