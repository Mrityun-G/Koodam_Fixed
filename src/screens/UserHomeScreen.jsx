import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Header } from '../components/Header';
import { NavigationBar } from '../components/NavigationBar';
import { Avatar } from '../components/Avatar';
import { VoiceAssistant } from '../components/VoiceAssistant';
import { detectService, pickBestHelper, reliabilityPenalty } from '../lib/voiceIntent';
import { helpersFromServices, withDistance } from '../lib/helpers';

export const UserHomeScreen = () => {
  const {
    location,
    userCoords,
    handleBookHelper,
    setIsChatOpen,
    setChatPartner,
    setIsEmergencyModalOpen,
    navigateTo,
    showToast
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAllHelpers, setShowAllHelpers] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [filterActive, setFilterActive] = useState(false);

  // 8 Service Categories from Stitch Design System
  const categories = [
    { id: 'cleaning', name: 'Cleaning & Sanitize', icon: 'cleaning_services', bg: 'bg-[#d3e4fe]', color: 'text-[#a14000]' },
    { id: 'electrical', name: 'Electrical Works', icon: 'bolt', bg: 'bg-[#ffdbcc]', color: 'text-[#a14000]' },
    { id: 'plumbing', name: 'Plumbing & Repair', icon: 'plumbing', bg: 'bg-[#dce1ff]', color: 'text-[#4e5c92]' },
    { id: 'ac', name: 'AC & Appliance', icon: 'mode_fan', bg: 'bg-[#6ffbbe]', color: 'text-[#006c49]' },
    { id: 'carpentry', name: 'Carpentry & Decor', icon: 'carpenter', bg: 'bg-[#e5eeff]', color: 'text-[#5a4136]' },
    { id: 'painting', name: 'Painting & Decor', icon: 'format_paint', bg: 'bg-[#d3e4fe]', color: 'text-[#a14000]' },
    { id: 'tech', name: 'Tech & Wi-Fi', icon: 'router', bg: 'bg-[#dce1ff]', color: 'text-[#4e5c92]' },
    { id: 'elder', name: 'Elder & Pets', icon: 'volunteer_activism', bg: 'bg-[#6ffbbe]', color: 'text-[#006c49]' }
  ];

  const [helpers, setHelpers] = useState([]);
  const [helpersLoading, setHelpersLoading] = useState(true);
  const hasLoadedHelpersRef = useRef(false);
  const loadHelpersRef = useRef(null);
  const [helpersRefreshing, setHelpersRefreshing] = useState(false);

  const refreshHelpers = async () => {
    if (helpersRefreshing || !loadHelpersRef.current) return;

    setHelpersRefreshing(true);

    try {
      await loadHelpersRef.current();
    } finally {
      setHelpersRefreshing(false);
    }
  };

  // How often the helper list refreshes while Home is open
  const HELPERS_REFRESH_MS = 2 * 60 * 1000;

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  'http://127.0.0.1:8000';


const categoryMap = {
  cleaning: ['Cleaning'],
  electrical: ['Electrical'],
  plumbing: ['Plumbing'],
  ac: ['AC Repair', 'Appliance Repair'],
  carpentry: ['Carpentry'],
  painting: ['Painting'],
  tech: ['Tech & Wi-Fi'],
  elder: ['Elder & Pets', 'Pest Control']
};


useEffect(() => {

  const loadHelpers = async () => {

    try {

      if (!hasLoadedHelpersRef.current) {
        setHelpersLoading(true);
      }

      // Every service with its partners in one request
      const response = await fetch(
        `${BACKEND_URL}/services/with-partners`
      );

      if (!response.ok) {
        throw new Error(
          `Failed to load helpers (${response.status})`
        );
      }

      const services = await response.json();

      const allHelpers = helpersFromServices(services);

      setHelpers(allHelpers);
      hasLoadedHelpersRef.current = true;

    } catch (error) {

      console.error(
        'Failed to load helpers:',
        error
      );

      // A failed refresh keeps the helpers already on screen; only
      // tell the customer when there's nothing to show
      if (!hasLoadedHelpersRef.current) {
        showToast(
          'Unable to load nearby helpers'
        );
      }

    } finally {

      setHelpersLoading(false);

    }

  };


  loadHelpersRef.current = loadHelpers;
  loadHelpers();

  // New partners and services show up without reopening the app
  const refreshIfVisible = () => {
    if (document.visibilityState === 'visible') {
      loadHelpers();
    }
  };

  const timer = setInterval(refreshIfVisible, HELPERS_REFRESH_MS);
  document.addEventListener('visibilitychange', refreshIfVisible);
  window.addEventListener('focus', refreshIfVisible);

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', refreshIfVisible);
    window.removeEventListener('focus', refreshIfVisible);
  };

}, []);

  // Real distances; helpers out of their service radius are left out
  const nearbyHelpers = useMemo(
    () => withDistance(helpers, userCoords),
    [helpers, userCoords]
  );

  const areaName = location.split(',')[0] || 'your area';

  // Filter logic
  const filteredHelpers = nearbyHelpers.filter((helper) => {

  const query =
    searchQuery.trim().toLowerCase();

  const matchesSearch =
    query === '' ||
    helper.name
      ?.toLowerCase()
      .includes(query) ||
    helper.title
      ?.toLowerCase()
      .includes(query) ||
    helper.serviceCategory
      ?.toLowerCase()
      .includes(query);

  if (!selectedCategory) {
    return matchesSearch;
  }

  const allowedCategories =
    categoryMap[selectedCategory] || [];

  const matchesCategory =
    allowedCategories.some(
      (category) =>
        helper.serviceCategory === category
    );

  return (
    matchesSearch &&
    matchesCategory
  );
});

  // Best rated first; more reviews wins a tie
  // A partner offering several services is still one person
  const availableHelperCount = new Set(
    filteredHelpers.map((helper) => helper.partnerId)
  ).size;

  // "I need a plumber, the water is leaking" -> open the best plumber
  const handleVoiceResult = (spokenText) => {
    const service = detectService(spokenText);

    if (!service) {
      // Not a service we recognise: search for what was said instead
      setSearchQuery(spokenText);
      showToast(`Searching for "${spokenText}"`);
      return;
    }

    if (helpersLoading) {
      showToast('Still loading helpers. Please try again in a moment.');
      return;
    }

    const best = pickBestHelper(nearbyHelpers, service);

    if (!best) {
      setSearchQuery(service);
      showToast(`No ${service} partner is available yet.`);
      return;
    }

    showToast(
      `Best match for ${service}: ${best.name}` +
      (best.reviewsCount > 0 ? ` (${Number(best.rating).toFixed(1)}★)` : '')
    );
    handleBookHelper(best);
  };

  // Escalations push partners down the list
  const topHelpers = [...filteredHelpers].sort(
    (a, b) =>
      (b.rating - reliabilityPenalty(b)) - (a.rating - reliabilityPenalty(a)) ||
      b.reviewsCount - a.reviewsCount
  );

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff]">
      <Header subtitle="Home" />

      <main className="flex-1 flex flex-col relative w-full pb-6">
        {/* Search & Filter Bar Section */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-2 bg-white rounded-2xl p-1.5 shadow-xs border border-slate-100">
            <div className="flex items-center gap-2 flex-1 pl-2 min-w-0">
              <span className="material-symbols-outlined text-slate-400 text-[20px] shrink-0">
                search
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-[#0b1c30] placeholder:text-slate-400 text-xs focus:outline-none min-w-0 font-medium"
                placeholder='Search "AC repair", "Electrician", "Elder care"...'
                type="text"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-slate-400 text-xs p-1">
                  ✕
                </button>
              )}
            </div>
            <VoiceAssistant onResult={handleVoiceResult} />
            <button
              aria-label="Filter Options"
              onClick={() => {
                setFilterActive(!filterActive);
                showToast(filterActive ? 'Filters reset' : 'Filtered to high rated verified only');
              }}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                filterActive
                  ? 'bg-[#ff6a00] text-white'
                  : 'bg-[#eff4ff] text-[#0b1c30] hover:bg-[#d3e4fe]'
              }`}
            >
              <span className="material-symbols-outlined text-[19px]">tune</span>
            </button>
          </div>
        </div>

        {/* Neighborhood Activity Sparkle Pill */}
        <div className="px-4 py-1">
          <div className="flex items-center justify-between gap-2 bg-[#eff4ff] px-3.5 py-1.5 rounded-full shadow-2xs border border-slate-100">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="material-symbols-outlined text-[#ff6a00] text-[17px] shrink-0"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                bolt
              </span>
              <span className="text-[11px] text-[#0b1c30] font-semibold truncate">
                {helpersLoading
                  ? `Finding helpers in ${areaName}…`
                  : availableHelperCount > 0
                  ? `${availableHelperCount} helpers ready to book in ${areaName}`
                  : 'No helpers for this service yet'}
              </span>
            </div>
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff6a00] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#a14000]"></span>
            </span>
          </div>
        </div>

        {/* Community Broadcast / Emergency Card */}
        <div className="px-4 py-1.5">
          <div
            onClick={() => setIsEmergencyModalOpen(true)}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#ff6a00] via-[#a14000] to-[#7b2f00] text-white p-4 shadow-md cursor-pointer hover:shadow-lg transition-all active:scale-98"
          >
            {/* Decorative pattern */}
            <div className="absolute -right-4 -bottom-6 opacity-15 pointer-events-none">
              <svg fill="none" height="120" viewBox="0 0 100 100" width="120">
                <circle cx="50" cy="50" r="45" stroke="currentColor" strokeDasharray="6 6" strokeWidth="8" />
                <path d="M50 15V85M15 50H85" stroke="currentColor" strokeLinecap="round" strokeWidth="8" />
              </svg>
            </div>

            <div className="relative z-10 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-xs text-white">
                  <span className="material-symbols-outlined text-[13px]">water_drop</span>
                  <span className="text-[10px] tracking-wide uppercase font-bold">Monsoon Drive</span>
                </div>
              </div>

              <div className="flex flex-col mt-0.5">
                <h2 className="text-base font-extrabold text-white leading-tight">
                  Community Help Desk
                </h2>
                <p className="text-xs text-white/90 mt-0.5 leading-snug">
                  Ward monsoon preparedness is active! Need sandbags or immediate rooftop leak fixes? Tap here.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button className="flex items-center gap-1 text-xs text-white font-bold hover:underline">
                  <span>Request Emergency Aid</span>
                  <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Service Categories Grid Section */}
        <div className="px-4 pt-3 pb-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">Neighborhood Services</h2>
              <p className="text-xs text-[#5a4136]">Verified assistance within 15 minutes</p>
            </div>
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                className="text-xs text-primary font-bold hover:underline"
              >
                Clear Filter
              </button>
            )}
          </div>

          {/* 2x4 Grid */}
          <div className="grid grid-cols-4 gap-2.5">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(isSelected ? null : cat.id);
                    showToast(isSelected ? 'Showing all services' : `Filtered to ${cat.name}`);
                  }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all active:scale-95 shadow-2xs text-center border ${
                    isSelected
                      ? 'bg-[#ff6a00] text-white border-[#ff6a00] shadow-sm'
                      : 'bg-white hover:bg-slate-50 text-[#0b1c30] border-slate-100'
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-white/20 text-white' : `${cat.bg} ${cat.color}`
                    }`}
                  >
                    <span className="material-symbols-outlined text-[22px]">{cat.icon}</span>
                  </div>
                  <span
                    className={`text-[10px] leading-tight font-semibold line-clamp-2 ${
                      isSelected ? 'text-white' : 'text-[#0b1c30]'
                    }`}
                  >
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Realtime Help Map & Distance Pulse Micro-banner */}
        <div className="px-4 py-2">
          <div
            onClick={() => navigateTo('tracking', 'requests')}
            className="relative overflow-hidden rounded-2xl bg-[#eff4ff] p-3 flex items-center justify-between shadow-2xs border border-slate-100 cursor-pointer hover:bg-[#dce9ff] transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#006c49]/10 flex items-center justify-center text-[#006c49] shrink-0">
                <span className="material-symbols-outlined text-[20px]">radar</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-[#0b1c30] font-bold truncate">Live Local Grid</span>
                <span className="text-[11px] text-[#5a4136] truncate">
                  {helpersLoading
                    ? 'Finding helpers near you…'
                    : `${availableHelperCount} helpers available near ${areaName}`}
                </span>
              </div>
            </div>
            <button className="px-3 py-1 rounded-full bg-[#1b2a5e] text-white text-[11px] font-semibold shrink-0 hover:bg-[#111a3a] transition-colors shadow-xs">
              Map View
            </button>
          </div>
        </div>

        {/* Top Helpers Section */}
        <div className="px-4 pt-1 pb-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold text-[#0b1c30]">Top Helpers Near You</h2>
              <span className="w-2 h-2 rounded-full bg-[#00ae78]"></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#a14000] font-bold">
                {availableHelperCount} Available
              </span>
              <button
                type="button"
                onClick={refreshHelpers}
                disabled={helpersRefreshing || helpersLoading}
                aria-label="Refresh helpers"
                title="Refresh helpers"
                className="flex items-center gap-0.5 px-2 py-1 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[11px] font-bold text-[#a14000] disabled:opacity-60 active:scale-95 transition-all"
              >
                <span className={`material-symbols-outlined text-[15px] ${helpersRefreshing ? 'animate-spin' : ''}`}>
                  refresh
                </span>
                {helpersRefreshing ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Helper List */}
          <div className="flex flex-col gap-3">
            {helpersLoading ? (

  <div className="bg-white rounded-2xl p-6 text-center border border-slate-100">
    <span className="material-symbols-outlined animate-spin text-[#ff6a00]">
      progress_activity
    </span>

    <p className="text-xs text-slate-500 mt-2">
      Finding nearby helpers...
    </p>
  </div>

) : filteredHelpers.length === 0 ? (

  <div className="bg-white rounded-2xl p-6 text-center border border-slate-100">

    <span className="material-symbols-outlined text-slate-400 text-3xl">
      person_search
    </span>

    <p className="text-sm font-semibold text-[#0b1c30] mt-2">
      No helpers available
    </p>

    <p className="text-xs text-slate-500 mt-1">
      No partner has added this service yet.
    </p>

  </div>

) : (
        <>
        {(showAllHelpers ? topHelpers : topHelpers.slice(0, 3)).map((helper) => (
              <div
                key={helper.id}
                className="bg-white rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-shadow flex flex-col gap-2 border border-slate-100"
              >
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <Avatar
                      src={helper.avatar}
                      name={helper.name}
                      className="w-14 h-14 rounded-2xl"
                      textClassName="text-xl"
                    />
                    {(helper.isVerified || helper.policeVerified) && (
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#00ae78] flex items-center justify-center text-white shadow-xs">
                        <span className="material-symbols-outlined text-[12px]">check</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-bold text-sm text-[#0b1c30] truncate">{helper.name}</h3>
                      <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0b1c30] text-xs shrink-0">
                        <span
                          className="material-symbols-outlined text-[13px] text-amber-500"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          star
                        </span>
                        <span className="font-bold text-[11px]">{Number(helper.rating || 0).toFixed(2)}</span>
                        <span className="text-slate-400 text-[10px]">({helper.reviewsCount})</span>
                      </div>
                    </div>

                    <p className="text-xs text-[#5a4136] truncate mt-0.5">{helper.title}</p>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${helper.badgeColor}`}>
                        <span className="material-symbols-outlined text-[12px]">
                          {helper.isVerified ? 'verified' : 'handshake'}
                        </span>
                        <span>{helper.badge}</span>
                      </span>
                      {helper.policeVerified && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[#6ffbbe] text-[#002113]">
                          <span className="material-symbols-outlined text-[12px]">local_police</span>
                          <span>Police Verified</span>
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[13px]">near_me</span>
                        {helper.distance}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer with Pricing & Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-medium">Starting from</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-base font-extrabold text-[#a14000]">
                        {helper.rate}
                      </span>
                      <span className="text-xs text-slate-500">{helper.unit}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      aria-label={`Chat with ${helper.name}`}
                      onClick={() => {
                        setChatPartner({
                          name: helper.name,
                          avatar: helper.avatar || '',
                          partnerId: helper.partnerId
                        });
                        setIsChatOpen(true);
                      }}
                      className="w-9 h-9 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#1b2a5e] flex items-center justify-center transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">chat</span>
                    </button>
                    <button
                      onClick={() => handleBookHelper(helper)}
                      className="px-3.5 py-1.5 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1"
                    >
                      <span>Quick Book</span>
                      <span className="material-symbols-outlined text-[14px]">bolt</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}

        {topHelpers.length > 3 && (
          <button
            onClick={() => setShowAllHelpers(prev => !prev)}
            className="w-full py-2.5 rounded-full bg-white border border-slate-100 shadow-xs text-xs font-bold text-[#a14000] flex items-center justify-center gap-1 active:scale-95 transition-all"
            type="button"
          >
            {showAllHelpers ? 'Show less' : 'View more'}
            <span className="material-symbols-outlined text-[16px]">
              {showAllHelpers ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        )}
        </>
          )}
        </div>
        </div>
        {/* Neighbor Trust Guarantee */}
        <div className="px-4 pb-2">
          <div className="bg-[#eff4ff] rounded-2xl p-3 flex items-center gap-3 shadow-2xs border border-slate-100">
            <div className="w-10 h-10 rounded-full bg-[#6ffbbe] text-[#002113] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">handshake</span>
            </div>
            <div className="flex flex-col min-w-0">
              <h4 className="text-xs font-bold text-[#0b1c30]">The KOODAM Neighbor Guarantee</h4>
              <p className="text-[11px] text-[#5a4136] mt-0.5 leading-snug">
                Fair, upfront prices with no hidden charges. Every helper is identity-checked and vouched for by local residents.
              </p>
            </div>
          </div>
        </div>
      </main>

      <NavigationBar />
    </div>
  );
};
