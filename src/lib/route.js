// Road routes between two points, for the live maps. Uses OSRM, which
// needs no API key. The public demo server is for light use only; set
// VITE_OSRM_URL to your own OSRM server before heavy traffic.
import { useEffect, useRef, useState } from 'react';

const OSRM_URL =
  import.meta.env.VITE_OSRM_URL || 'https://router.project-osrm.org';

// Re-fetch at most this often while the partner moves
const MIN_REFETCH_MS = 15000;

/**
 * { path: [[lat, lng], ...], distanceKm, durationMinutes } for driving
 * from `from` to `to`, or null if no route could be found.
 */
export const fetchRoute = async (from, to, signal) => {
  const url =
    `${OSRM_URL}/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    '?overview=full&geometries=geojson';

  const response = await fetch(url, { signal });

  if (!response.ok) return null;

  const data = await response.json();
  const route = data.routes?.[0];

  if (data.code !== 'Ok' || !route) return null;

  return {
    // GeoJSON is [lng, lat]; Leaflet wants [lat, lng]
    path: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    durationMinutes: Math.max(1, Math.round(route.duration / 60))
  };
};

// About 100 m: smaller moves don't change the route enough to re-fetch
const roughKey = (point) =>
  point ? `${point.lat.toFixed(3)},${point.lng.toFixed(3)}` : '';

/**
 * The current road route from `from` to `to`, kept up to date as either
 * point moves. null while loading, without both points, or when routing
 * fails (callers fall back to a straight line).
 */
export const useRoute = (from, to) => {
  const [route, setRoute] = useState(null);
  const lastFetchRef = useRef(0);

  const key = from && to ? `${roughKey(from)}|${roughKey(to)}` : '';

  // Read inside the effect without re-running it on every GPS tick
  const pointsRef = useRef({ from, to });
  pointsRef.current = { from, to };

  useEffect(() => {
    if (!key) {
      setRoute(null);
      return;
    }

    const controller = new AbortController();
    const wait = Math.max(
      0,
      lastFetchRef.current + MIN_REFETCH_MS - Date.now()
    );

    const timer = setTimeout(() => {
      lastFetchRef.current = Date.now();

      const { from: start, to: end } = pointsRef.current;

      fetchRoute(start, end, controller.signal)
        .then(setRoute)
        .catch((error) => {
          if (error.name !== 'AbortError') setRoute(null);
        });
    }, wait);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  return route;
};
