import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useApp } from '../context/AppContext';
import { Header } from '../components/Header';
import { NavigationBar } from '../components/NavigationBar';
import { Avatar } from '../components/Avatar';
import { MapTiles } from '../components/LiveMap';
import { estimateEtaMinutes } from '../lib/geo';
import { helpersFromServices, withDistance } from '../lib/helpers';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

// Partners send their position while online; this picks it up
const REFRESH_MS = 20000;

// Shown until the customer's location is known
const FALLBACK_CENTER = { lat: 13.0827, lng: 80.2707 };

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

const initials = (name) =>
  (name || 'K')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

const youIcon = L.divIcon({
  className: '',
  html:
    '<div style="width:18px;height:18px;border-radius:9999px;background:#1b6ef3;' +
    'border:3px solid white;box-shadow:0 0 0 6px rgba(27,110,243,.2);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

const partnerPin = (name, selected) =>
  L.divIcon({
    className: '',
    html:
      `<div style="width:38px;height:38px;border-radius:9999px;background:${selected ? '#ff6a00' : '#1b2a5e'};` +
      'border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);color:white;font:700 12px/32px sans-serif;' +
      `text-align:center;">${escapeHtml(initials(name))}</div>` +
      `<div style="width:0;height:0;margin:-3px auto 0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${selected ? '#ff6a00' : '#1b2a5e'};"></div>`,
    iconSize: [38, 46],
    iconAnchor: [19, 46]
  });

// Frames the customer and the partners once, when they first load
const FitOnce = ({ points }) => {
  const map = useMap();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current || points.length === 0) return;

    doneRef.current = true;

    if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
    }
  }, [points.length]);

  return null;
};

const FlyTo = ({ target }) => {
  const map = useMap();

  useEffect(() => {
    if (target) map.flyTo(target.point, Math.max(map.getZoom(), 15));
  }, [target]);

  return null;
};

export const NearbyMapScreen = () => {
  const {
    userCoords,
    location,
    handleBookHelper,
    navigateTo,
    showToast
  } = useApp();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serviceFilter, setServiceFilter] = useState(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/services/with-partners`);

        if (!response.ok) {
          throw new Error(`Failed to load helpers (${response.status})`);
        }

        const data = await response.json();

        if (!cancelled) {
          setServices(data);
          hasLoadedRef.current = true;
        }
      } catch (error) {
        console.error('Nearby map refresh failed:', error);

        // A failed refresh keeps the pins already on screen
        if (!cancelled && !hasLoadedRef.current) {
          showToast('Unable to load nearby helpers');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') load();
    };

    const timer = setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, []);

  // One pin per partner, with every service they offer near the customer
  const partners = useMemo(() => {
    const helpers = withDistance(helpersFromServices(services), userCoords)
      .filter((helper) => helper.latitude != null && helper.longitude != null)
      .filter((helper) => !serviceFilter || helper.serviceId === serviceFilter);

    const byPartner = new Map();

    for (const helper of helpers) {
      const entry = byPartner.get(helper.partnerId) || {
        partnerId: helper.partnerId,
        name: helper.name,
        avatar: helper.avatar,
        rating: helper.rating,
        reviewsCount: helper.reviewsCount,
        policeVerified: helper.policeVerified,
        distanceKm: helper.distanceKm,
        point: { lat: helper.latitude, lng: helper.longitude },
        offers: []
      };

      entry.offers.push(helper);
      byPartner.set(helper.partnerId, entry);
    }

    return [...byPartner.values()].sort(
      (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    );
  }, [services, userCoords, serviceFilter]);

  const selected = partners.find((p) => p.partnerId === selectedPartnerId) || null;

  const framePoints = useMemo(
    () => [
      ...(userCoords ? [userCoords] : []),
      ...partners.map((p) => p.point)
    ],
    [userCoords, partners]
  );

  const areaName = (location || '').split(',')[0] || 'you';

  return (
    <div className="flex-1 flex flex-col relative w-full bg-[#f8f9ff]">
      <Header subtitle="Live Map" />

      {/* Service filter */}
      <div className="px-4 pt-3 pb-2 flex gap-2 overflow-x-auto date-scroll">
        <button
          onClick={() => setServiceFilter(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
            !serviceFilter
              ? 'bg-[#ff6a00] text-white border-[#ff6a00]'
              : 'bg-white text-[#0b1c30] border-slate-200'
          }`}
        >
          All services
        </button>
        {services.map((service) => (
          <button
            key={service.id}
            onClick={() => {
              setServiceFilter(serviceFilter === service.id ? null : service.id);
              setSelectedPartnerId(null);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors flex items-center gap-1 ${
              serviceFilter === service.id
                ? 'bg-[#ff6a00] text-white border-[#ff6a00]'
                : 'bg-white text-[#0b1c30] border-slate-200'
            }`}
          >
            {service.icon && (
              <span className="material-symbols-outlined text-[14px]">{service.icon}</span>
            )}
            {service.title}
          </button>
        ))}
      </div>

      <div className="relative flex-1 min-h-[62vh] mx-4 mb-3 rounded-2xl overflow-hidden border border-slate-200 shadow-xs">
        <div className="absolute inset-0 z-0">
          <MapContainer
            center={userCoords || FALLBACK_CENTER}
            zoom={14}
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
            attributionControl
          >
            <MapTiles />

            {userCoords && (
              <>
                <Circle
                  center={userCoords}
                  radius={1000}
                  pathOptions={{ color: '#1b6ef3', weight: 1, fillOpacity: 0.05 }}
                />
                <Marker position={userCoords} icon={youIcon} />
              </>
            )}

            {partners.map((partner) => (
              <Marker
                key={partner.partnerId}
                position={partner.point}
                icon={partnerPin(partner.name, partner.partnerId === selectedPartnerId)}
                zIndexOffset={partner.partnerId === selectedPartnerId ? 1000 : 0}
                eventHandlers={{
                  click: () => setSelectedPartnerId(partner.partnerId)
                }}
              />
            ))}

            <FitOnce points={framePoints} />
            <FlyTo target={flyTarget} />
          </MapContainer>
        </div>

        {/* Status pill */}
        <div className="absolute left-3 top-3 z-10 bg-white/95 rounded-full px-3 py-1.5 shadow-sm flex items-center gap-1.5 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-[#00ae78] animate-pulse" />
          <span className="text-[11px] font-bold text-[#0b1c30]">
            {loading
              ? 'Finding helpers…'
              : `${partners.length} online near ${areaName}`}
          </span>
        </div>

        {/* Back to me */}
        <button
          aria-label="Center on my location"
          onClick={() => {
            if (userCoords) {
              setFlyTarget({ point: userCoords });
            } else {
              showToast('Turn on location to see helpers around you.');
            }
          }}
          className="absolute right-3 top-3 z-10 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center text-[#1b2a5e] active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]">my_location</span>
        </button>

        {!loading && partners.length === 0 && (
          <div className="absolute inset-x-3 bottom-3 z-10 bg-white rounded-2xl p-4 shadow-md text-center">
            <p className="text-sm font-bold text-[#0b1c30]">No helpers online nearby</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Partners appear here live as soon as they go online.
            </p>
          </div>
        )}

        {/* Selected partner */}
        {selected && (
          <div className="absolute inset-x-3 bottom-3 z-10 bg-white rounded-2xl p-3 shadow-lg border border-slate-100">
            <div className="flex items-start gap-3">
              <Avatar src={selected.avatar} name={selected.name} className="w-11 h-11 rounded-full" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-[#0b1c30] truncate">{selected.name}</p>
                  {selected.policeVerified && (
                    <span className="material-symbols-outlined text-[16px] text-[#006c49]" title="Police verified">
                      verified_user
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {selected.reviewsCount > 0
                    ? `${selected.rating.toFixed(1)}★ (${selected.reviewsCount}) • `
                    : 'New partner • '}
                  {selected.distanceKm != null
                    ? `${selected.distanceKm.toFixed(1)} km • ~${estimateEtaMinutes(selected.distanceKm)} min away`
                    : 'Nearby'}
                </p>
              </div>

              <button
                aria-label="Close"
                onClick={() => setSelectedPartnerId(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div className="mt-2.5 flex flex-col gap-1.5">
              {selected.offers.map((offer) => (
                <button
                  key={offer.id}
                  onClick={() => handleBookHelper(offer)}
                  className="w-full flex items-center justify-between gap-2 rounded-xl bg-[#fff4ee] hover:bg-[#ffe6d8] px-3 py-2 active:scale-[0.99] transition-all"
                >
                  <span className="text-xs font-bold text-[#0b1c30] truncate">{offer.title}</span>
                  <span className="text-xs font-extrabold text-[#a14000] shrink-0">
                    ₹{offer.rate} • Book
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-3">
        <button
          onClick={() => navigateTo('home', 'home')}
          className="w-full py-2.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-[#0b1c30] active:scale-95 transition-all"
        >
          Back to list view
        </button>
      </div>

      <NavigationBar />
    </div>
  );
};
