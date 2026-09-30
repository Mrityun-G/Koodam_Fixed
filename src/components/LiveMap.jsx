import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Plain divIcon avoids react-leaflet's broken default marker asset paths under Vite.
const destinationIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#0b1c30;border:2px solid white;"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const Recenter = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom(), { animate: true });
  }, [center?.lat, center?.lng]);
  return null;
};

export const LiveMap = ({ partnerLocation, destination }) => {
  const center = partnerLocation || destination;

  return (
    <MapContainer
      center={center}
      zoom={15}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={destination} icon={destinationIcon} />
      {partnerLocation && (
        <>
          <CircleMarker
            center={partnerLocation}
            radius={8}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#ff6a00', fillOpacity: 1 }}
          />
          <Polyline
            positions={[partnerLocation, destination]}
            pathOptions={{ color: '#ff6a00', weight: 3, opacity: 0.8 }}
          />
        </>
      )}
      <Recenter center={center} />
    </MapContainer>
  );
};
