import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// OpenStreetMap's licence requires this credit on every map
export const MapTiles = () => (
  <TileLayer
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    maxZoom={19}
  />
);

// Plain divIcons avoid react-leaflet's broken default marker asset paths under Vite.
export const destinationIcon = L.divIcon({
  className: '',
  html:
    '<div style="width:28px;height:28px;border-radius:9999px;background:#0b1c30;border:3px solid white;' +
    'box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">' +
    '<span class="material-symbols-outlined" style="font-size:16px;color:white;">home</span></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14]
});

// Orange dot, with an arrow when the device reports which way it's heading
const partnerIcon = (heading) =>
  L.divIcon({
    className: '',
    html:
      '<div style="position:relative;width:34px;height:34px;">' +
      '<div style="position:absolute;inset:0;border-radius:9999px;background:rgba(255,106,0,.25);animation:koodam-pulse 1.6s ease-out infinite;"></div>' +
      (heading != null
        ? `<div style="position:absolute;inset:0;transform:rotate(${heading}deg);">` +
          '<div style="position:absolute;left:50%;top:-2px;margin-left:-6px;width:0;height:0;' +
          'border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid #ff6a00;"></div></div>'
        : '') +
      '<div style="position:absolute;left:8px;top:8px;width:18px;height:18px;border-radius:9999px;' +
      'background:#ff6a00;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div></div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

// Glides the marker to each new GPS fix instead of jumping
const useGlidingPosition = (target, durationMs = 1000) => {
  const [position, setPosition] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    if (!target) {
      setPosition(null);
      fromRef.current = null;
      return;
    }

    const from = fromRef.current;

    if (!from) {
      setPosition(target);
      fromRef.current = target;
      return;
    }

    let frame;
    const start = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = {
        lat: from.lat + (target.lat - from.lat) * t,
        lng: from.lng + (target.lng - from.lng) * t
      };

      fromRef.current = next;
      setPosition(next);

      if (t < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [target?.lat, target?.lng]);

  return position;
};

// Keeps the partner and the destination in view, and redraws the tiles
// when the map's box is resized (e.g. expanded to full screen)
const FrameView = ({ partner, destination }) => {
  const map = useMap();
  const framedRef = useRef(false);

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    if (partner && destination) {
      const bounds = L.latLngBounds([partner, destination]);

      // Refit the first time, and whenever the partner leaves the view
      if (!framedRef.current || !map.getBounds().contains(partner)) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16, animate: true });
        framedRef.current = true;
      }
    } else if (partner || destination) {
      map.setView(partner || destination, map.getZoom(), { animate: true });
    }
  }, [partner?.lat, partner?.lng, destination?.lat, destination?.lng]);

  return null;
};

/**
 * Live job map: the partner's GPS position moving towards the job.
 * `route` is a road path ([[lat, lng], ...]); without it a straight
 * dashed line is drawn. `interactive` allows panning and zooming.
 */
export const LiveMap = ({
  partnerLocation,
  destination,
  route,
  interactive = false
}) => {
  const partner = useGlidingPosition(
    partnerLocation
      ? { lat: partnerLocation.lat, lng: partnerLocation.lng }
      : null
  );

  // Rebuilt only when the heading changes, so the pulse doesn't restart
  // on every animation frame
  const heading = partnerLocation?.heading;
  const icon = useMemo(
    () => partnerIcon(heading == null ? null : Math.round(heading)),
    [heading == null ? null : Math.round(heading)]
  );

  const center = partner || destination;

  // Nothing to show until either location is known
  if (!center) {
    return <div className="absolute inset-0 bg-slate-100" />;
  }

  // z-0 keeps Leaflet's panes (z-index 400+) under overlays drawn on the map
  return (
    <div className="absolute inset-0 z-0">
    <MapContainer
      center={center}
      zoom={15}
      style={{ width: '100%', height: '100%' }}
      zoomControl={interactive}
      dragging={interactive}
      touchZoom={interactive}
      doubleClickZoom={interactive}
      scrollWheelZoom={false}
      attributionControl
    >
      <MapTiles />

      {partner && destination && (
        route?.length ? (
          <Polyline
            positions={route}
            pathOptions={{ color: '#ff6a00', weight: 5, opacity: 0.85 }}
          />
        ) : (
          <Polyline
            positions={[partner, destination]}
            pathOptions={{ color: '#ff6a00', weight: 3, opacity: 0.8, dashArray: '6 8' }}
          />
        )
      )}

      {destination && (
        <Marker position={destination} icon={destinationIcon} />
      )}

      {partner && (
        <Marker
          position={partner}
          icon={icon}
          zIndexOffset={1000}
        />
      )}

      {/* Framed on real GPS fixes, not every animation frame */}
      <FrameView partner={partnerLocation} destination={destination} />
    </MapContainer>
    </div>
  );
};
