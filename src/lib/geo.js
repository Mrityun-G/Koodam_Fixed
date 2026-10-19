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

// Finds a typed address on the map with OpenStreetMap (the same service
// as the header's place search), preferring matches near `near`.
// Resolves to { lat, lng }, or null when it can't be found.
export const geocodeAddress = async (address, near) => {
  const query = (address || '').trim();
  if (query.length < 3) return null;

  // ~50 km box around the member to rank local matches first
  const viewbox = near
    ? `&viewbox=${near.lng - 0.5},${near.lat + 0.5},${near.lng + 0.5},${near.lat - 0.5}`
    : '';

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in${viewbox}&q=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json', 'Accept-Language': 'en' } }
    );
    if (!response.ok) return null;

    const [place] = await response.json();
    return place ? { lat: Number(place.lat), lng: Number(place.lon) } : null;
  } catch (error) {
    console.warn('Address lookup failed:', error?.message);
    return null;
  }
};

// Rough ETA assuming average city-traffic speed of 22 km/h.
export const estimateEtaMinutes = (distanceKm, avgSpeedKmh = 22) => {
  if (distanceKm == null) return null;
  return Math.max(1, Math.round((distanceKm / avgSpeedKmh) * 60));
};
