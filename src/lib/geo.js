const EARTH_RADIUS_KM = 6371;

// Great-circle distance between two lat/lng points, in kilometers.
export const haversineDistanceKm = (a, b) => {
  if (!a || !b) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Rough ETA assuming average city-traffic speed of 22 km/h.
export const estimateEtaMinutes = (distanceKm, avgSpeedKmh = 22) => {
  if (distanceKm == null) return null;
  return Math.max(1, Math.round((distanceKm / avgSpeedKmh) * 60));
};
