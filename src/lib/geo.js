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


// =========================================================
// PLACE NAMES
// Shared by the Header's location picker and the onboarding step, which
// each used to carry their own copy of this.
// =========================================================

// Area name for a point, e.g. "Sholinganallur, Chennai"
export const describePlace = (address = {}) => {
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

  return [area, city].filter(Boolean).join(', ');
};

// Where the device is, as a place name. Resolves to '' when the person
// refuses the permission or the lookup fails — the caller decides what
// to say about it.
export const detectPlaceName = () =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
            { headers: { Accept: 'application/json', 'Accept-Language': 'en' } }
          );

          if (!response.ok) {
            throw new Error(`Location lookup failed: ${response.status}`);
          }

          resolve({
            label: describePlace((await response.json()).address) || '',
            coords: { lat: latitude, lng: longitude }
          });
        } catch (error) {
          console.error('Location lookup failed:', error);
          resolve({ label: '', coords: { lat: latitude, lng: longitude } });
        }
      },
      (error) => {
        console.warn('Could not read location:', error?.message);
        resolve(null);
      },
      { timeout: 10000 }
    );
  });
