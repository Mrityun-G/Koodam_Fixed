
import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export const Header = ({ subtitle = 'Home' }) => {
  const {
    location,
    setLocation,
    showToast,
    navigateTo,
    notifications: allNotifications,
    markNotificationsRead,
    userProfile,
    partnerProfile,
    role
  } = useApp();

  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);

  const headerProfile = role === 'partner' ? partnerProfile : userProfile;
  const headerAvatar = headerProfile?.avatar;
  const headerInitial =
    (headerProfile?.name || 'K').trim().charAt(0).toUpperCase();
  const [avatarFailed, setAvatarFailed] = useState(false);

  // A new photo gets a fresh chance to load
  useEffect(() => setAvatarFailed(false), [headerAvatar]);

  // Prevent GPS from overriding a location manually selected by the user.
  const userSelectedLocation = useRef(false);

  // Automatically detect the user's current location.
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser.');
      return;
    }

    let isActive = true;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!isActive || userSelectedLocation.current) return;

        const { latitude, longitude } = position.coords;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
            {
              headers: {
                'Accept': 'application/json',
                'Accept-Language': 'en'
              }
            }
          );

          if (!response.ok) {
            throw new Error(
              `Location lookup failed: ${response.status}`
            );
          }

          const data = await response.json();
          if (!isActive || userSelectedLocation.current) return;

          const address = data.address || {};

          const area =
            address.neighbourhood ||
            address.suburb ||
            address.residential ||
            address.city_district ||
            address.quarter;

          const city =
            address.city ||
            address.town ||
            address.village ||
            address.municipality ||
            address.county;

          const detectedLocation = [area, city]
            .filter(Boolean)
            .join(', ');

          if (detectedLocation && !userSelectedLocation.current) {
            setLocation(detectedLocation);
          } else {
            console.warn(
              'Could not determine a readable neighborhood and city.'
            );
          }
        } catch (error) {
          console.error('Location lookup failed:', error);
        }
      },
      (error) => {
        console.warn(
          'Unable to detect user location:',
          error.message
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );

    return () => {
      isActive = false;
    };
  }, [setLocation]);

  const locations = [
    'Indiranagar, Bengaluru',
    'Koramangala, Bengaluru',
    'HSR Layout, Bengaluru',
    'Whitefield, Bengaluru',
    'Jayanagar, Bengaluru'
  ];

  const notifications = allNotifications.filter(
    n => n.target === 'member'
  );

  const hasUnread = notifications.some(n => n.unread);

  return (
    <>
      <header className="sticky top-0 inset-x-0 z-40 bg-[#f8f9ff]/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-slate-100">
        <div className="h-16 px-4 flex items-center justify-between gap-2">

          {/* Logo & Location Cluster */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigateTo('home', 'home')}
              className="flex items-center gap-2 text-left shrink-0 active:scale-95 transition-transform"
            >
              <img
                src="/logo.svg"
                alt="KOODAM Community Logo"
                className="h-8 w-auto object-contain shrink-0"
              />
            </button>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-bold text-[17px] text-[#0b1c30] leading-none tracking-tight">
                  KOODAM
                </span>
                <span className="text-xs text-[#5a4136] opacity-70">
                  •
                </span>
                <span className="text-xs text-[#5a4136] font-medium truncate">
                  {subtitle}
                </span>
              </div>

              {/* Location Picker Button */}
              <button
                onClick={() => setShowLocationMenu(!showLocationMenu)}
                className="flex items-center gap-0.5 text-left text-primary min-h-[20px] group"
              >
                <span className="text-[11px] font-bold truncate max-w-[130px] sm:max-w-none text-[#a14000]">
                  {location || 'Detecting location...'}
                </span>

                <span className="material-symbols-outlined text-[15px] leading-none text-[#a14000] group-hover:translate-y-0.5 transition-transform">
                  expand_more
                </span>
              </button>
            </div>
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-1 shrink-0">

            {/* Notification Bell */}
            <div className="relative">
              <button
                aria-label="Notifications"
                onClick={() =>
                  setShowNotificationMenu(!showNotificationMenu)
                }
                className="w-10 h-10 flex items-center justify-center rounded-full text-[#0b1c30] relative hover:bg-[#eff4ff] active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-[23px]">
                  notifications
                </span>

                {hasUnread && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#ff6a00] ring-2 ring-[#f8f9ff]"></span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotificationMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                    <span className="font-bold text-sm text-[#0b1c30]">
                      Notifications
                    </span>

                    <button
                      onClick={() => markNotificationsRead('member')}
                      className="text-[11px] font-semibold text-primary"
                    >
                      Mark all read
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {notifications.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-4">
                        No notifications yet
                      </p>
                    )}

                    {notifications.map(n => (
                      <div
                        key={n.id}
                        className={`p-2 rounded-xl text-left transition-colors cursor-pointer ${
                          n.unread
                            ? 'bg-[#eff4ff]'
                            : 'hover:bg-slate-50'
                        }`}
                        onClick={() => {
                          setShowNotificationMenu(false);

                          if (n.screen) {
                            navigateTo(
                              n.screen,
                              n.tab || undefined
                            );
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-[#0b1c30]">
                            {n.title}
                          </span>

                          <span className="text-[10px] text-slate-400">
                            {n.time}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {n.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Avatar */}
            <button
              aria-label="User Profile"
              onClick={() => navigateTo('profile', 'profile')}
              title="View profile & settings"
              className="w-10 h-10 flex items-center justify-center rounded-full p-0.5 hover:ring-2 hover:ring-[#ff6a00]/30 active:scale-95 transition-all"
            >
              {headerAvatar && !avatarFailed ? (
                <img
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-slate-200"
                  src={headerAvatar}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                // No photo (or it failed to load): show their initial
                <span className="w-8 h-8 rounded-full bg-[#ffdbcc] text-[#a14000] text-sm font-bold flex items-center justify-center shadow-sm ring-1 ring-slate-200">
                  {headerInitial}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Location Modal */}
      {showLocationMenu && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#a14000]">
                  location_on
                </span>

                <h3 className="font-bold text-[#0b1c30] text-base">
                  Select Neighborhood
                </h3>
              </div>

              <button
                onClick={() => setShowLocationMenu(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <span className="material-symbols-outlined text-sm">
                  close
                </span>
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {locations.map(loc => (
                <button
                  key={loc}
                  onClick={() => {
                    // Preserve the user's manual location choice.
                    userSelectedLocation.current = true;

                    setLocation(loc);
                    setShowLocationMenu(false);
                    showToast(`Location set to ${loc}`);
                  }}
                  className={`flex items-center justify-between p-3 rounded-2xl text-left text-sm font-semibold transition-all ${
                    location === loc
                      ? 'bg-[#eff4ff] text-[#a14000] border-2 border-[#ff6a00]'
                      : 'bg-slate-50 hover:bg-slate-100 text-[#0b1c30]'
                  }`}
                >
                  <span>{loc}</span>

                  {location === loc && (
                    <span className="material-symbols-outlined text-[#a14000] text-lg">
                      check_circle
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};