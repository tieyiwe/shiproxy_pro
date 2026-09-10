// Looks up a city/country's coordinates via OpenStreetMap's free Nominatim
// API - no API key or paid provider decision needed. Called once per
// listing create/edit (a human-paced action, well under Nominatim's 1 req/s
// usage policy) and the result is cached on the container row, never
// re-geocoded on read. Failures/timeouts degrade gracefully: the listing
// still saves, it just won't have a distance shown until geocoding
// succeeds on a later edit.
const GEOCODE_TIMEOUT_MS = 4000;

async function geocodeCity(city, country) {
  if (!city || !country) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', `${city}, ${country}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Required by Nominatim's usage policy (identifies the app, not tracking).
        'User-Agent': 'ShipRoxy/1.0 (container-sharing marketplace)',
      },
    });
    if (!res.ok) return null;

    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const lat = Number(results[0].lat);
    const lng = Number(results[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Haversine distance in kilometers between two lat/lng points.
function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { geocodeCity, distanceKm };
