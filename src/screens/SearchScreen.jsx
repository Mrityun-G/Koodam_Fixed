import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Header } from '../components/Header';
import { NavigationBar } from '../components/NavigationBar';
import { HelperCard } from '../components/HelperCard';
import { VoiceAssistant } from '../components/VoiceAssistant';
import { detectService, reliabilityPenalty } from '../lib/voiceIntent';
import { helpersFromServices, withDistance } from '../lib/helpers';
import { authorizedFetch } from '../lib/authorizedFetch';

// "3 helpers nearby", from the partners the backend sent for a service
const helperCountLabel = (service) => {
  const count = new Set(
    (service.partners || []).map((partner) => partner.partner_id)
  ).size;

  if (count === 0) return 'No helpers nearby yet';

  return count === 1 ? '1 helper nearby' : `${count} helpers nearby`;
};

// One service, as a row to tap
const ServiceRow = ({ service, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(service)}
    className="w-full bg-white rounded-2xl p-3 flex items-center gap-3 text-left border border-slate-100 shadow-2xs hover:bg-slate-50 active:scale-[0.99] transition-all"
  >
    <div
      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
      style={{
        backgroundColor: service.bg_color || '#e5eeff',
        color: service.icon_color || '#4e5c92'
      }}
    >
      <span className="material-symbols-outlined text-[22px]">
        {service.icon || 'home_repair_service'}
      </span>
    </div>

    <div className="flex flex-col min-w-0 flex-1">
      <span className="text-sm font-bold text-[#0b1c30] truncate">{service.title}</span>
      <span className="text-[11px] text-[#5a4136] truncate">{helperCountLabel(service)}</span>
    </div>

    <span className="material-symbols-outlined text-[20px] text-slate-300 shrink-0">
      chevron_right
    </span>
  </button>
);

// The Search tab. Home shows who's near you; this is for when you know
// what you need: type a trade, a problem or a helper's name.
export const SearchScreen = () => {
  const { userCoords, location } = useApp();

  const [query, setQuery] = useState('');
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const inputRef = useRef(null);

  // The tab is for typing, so the box is ready as soon as it opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Same request as Home: every service with the partners who can reach
  // the member. Asked again only when they've moved ~100 m, not on
  // every GPS jitter.
  const coordsKey = userCoords
    ? `${userCoords.lat.toFixed(3)},${userCoords.lng.toFixed(3)}`
    : '';

  useEffect(() => {
    let cancelled = false;

    const near = userCoords
      ? `?lat=${userCoords.lat}&lng=${userCoords.lng}`
      : '';

    setLoadFailed(false);

    authorizedFetch(`/services/with-partners${near}`)
      .then((list) => {
        if (!cancelled) setServices(list);
      })
      .catch((error) => {
        console.error('Failed to load services:', error);
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [coordsKey, reloadKey]);

  const helpers = useMemo(
    () => withDistance(helpersFromServices(services), userCoords),
    [services, userCoords]
  );

  const text = query.trim().toLowerCase();

  // "Electrician" or "AC repair" isn't in any service's name, so the
  // word lists the voice assistant uses map it to the service it means
  const meantService = text ? detectService(text) : null;

  const matchingServices = text
    ? services.filter(
        (service) =>
          service.title === meantService ||
          [service.title, service.category, service.description].some(
            (field) => field?.toLowerCase().includes(text)
          )
      )
    : [];

  const matchingServiceIds = new Set(
    matchingServices.map((service) => service.id)
  );

  // Helpers for those services, or whose own name matches; best rated
  // first, the same order as Home
  const matchingHelpers = text
    ? helpers
        .filter(
          (helper) =>
            matchingServiceIds.has(helper.serviceId) ||
            helper.name?.toLowerCase().includes(text)
        )
        .sort(
          (a, b) =>
            (b.rating - reliabilityPenalty(b)) -
              (a.rating - reliabilityPenalty(a)) ||
            b.reviewsCount - a.reviewsCount
        )
    : [];

  const areaName = location.split(',')[0] || 'your area';

  const selectService = (service) => {
    setQuery(service.title);
  };

  // "My tap is leaking" -> Plumbing & Repair; anything else is searched
  // as it was said
  const handleVoiceResult = (spokenText) => {
    setQuery(detectService(spokenText) || spokenText);
  };

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff]">
      <Header subtitle="Search" />

      <main className="flex-1 flex flex-col relative w-full pb-6">
        {/* Search box */}
        <div className="px-4 pt-3 pb-2">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              // Hides the phone keyboard so the results can be seen
              inputRef.current?.blur();
            }}
            className="flex items-center gap-2 bg-white rounded-2xl p-1.5 shadow-xs border border-slate-100 focus-within:border-[#ffb38a] transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 pl-2 min-w-0">
              <span className="material-symbols-outlined text-slate-400 text-[20px] shrink-0">
                search
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full bg-transparent text-[#0b1c30] placeholder:text-slate-400 text-sm focus:outline-none min-w-0 font-medium py-1.5"
                placeholder='Search "AC repair", "Electrician", "Elder care"...'
                type="text"
                enterKeyHint="search"
                aria-label="Search services and helpers"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="text-slate-400 text-xs p-1"
                >
                  ✕
                </button>
              )}
            </div>
            <VoiceAssistant onResult={handleVoiceResult} />
          </form>
        </div>

        {loading ? (
          <div className="px-4 pt-2 flex flex-col gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-[66px] rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : loadFailed && services.length === 0 ? (
          <div className="mx-4 mt-2 bg-white rounded-2xl p-6 text-center border border-slate-100">
            <span className="material-symbols-outlined text-slate-400 text-3xl">cloud_off</span>
            <p className="text-sm font-semibold text-[#0b1c30] mt-2">
              Couldn't load services
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setReloadKey((key) => key + 1);
              }}
              className="mt-3 px-4 py-2 rounded-full bg-[#ff6a00] hover:bg-[#a14000] text-white text-xs font-bold active:scale-95 transition-all"
            >
              Try again
            </button>
          </div>
        ) : !text ? (
          // Nothing typed yet: every service, to browse
          <section className="px-4 pt-2 flex flex-col gap-2">
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">Browse services</h2>
              <p className="text-xs text-[#5a4136]">
                {`Helpers who can reach ${areaName}`}
              </p>
            </div>

            {services.map((service) => (
              <ServiceRow key={service.id} service={service} onSelect={selectService} />
            ))}
          </section>
        ) : (
          <>
            {matchingServices.length > 0 && (
              <section className="px-4 pt-2 flex flex-col gap-2">
                <h2 className="text-base font-bold text-[#0b1c30]">Services</h2>

                {matchingServices.map((service) => (
                  <ServiceRow key={service.id} service={service} onSelect={selectService} />
                ))}
              </section>
            )}

            <section className="px-4 pt-4 flex flex-col gap-3">
              {(matchingServices.length > 0 || matchingHelpers.length > 0) && (
                <h2 className="text-base font-bold text-[#0b1c30]">Helpers</h2>
              )}

              {matchingHelpers.map((helper) => (
                <HelperCard key={helper.id} helper={helper} />
              ))}

              {matchingHelpers.length === 0 && matchingServices.length > 0 && (
                <div className="bg-white rounded-2xl p-6 text-center border border-slate-100">
                  <span className="material-symbols-outlined text-slate-400 text-3xl">
                    person_search
                  </span>
                  <p className="text-sm font-semibold text-[#0b1c30] mt-2">
                    No helpers nearby for this yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Partners show up here when they go online near you.
                  </p>
                </div>
              )}

              {matchingHelpers.length === 0 && matchingServices.length === 0 && (
                <div className="bg-white rounded-2xl p-6 text-center border border-slate-100">
                  <span className="material-symbols-outlined text-slate-400 text-3xl">
                    search_off
                  </span>
                  <p className="text-sm font-semibold text-[#0b1c30] mt-2">
                    {`No results for "${query.trim()}"`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Try a trade like "plumber" or "electrician", or browse all services.
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="mt-3 px-4 py-2 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#a14000] text-xs font-bold active:scale-95 transition-all"
                  >
                    Browse all services
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <NavigationBar />
    </div>
  );
};
