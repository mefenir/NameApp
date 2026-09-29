// Location helpers: a quick GPS fix + reverse geocoding via OpenStreetMap Nominatim.
// Location is always optional — if it's denied or slow, captures still save.

export function getPosition({ timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    setTimeout(() => finish(null), timeout + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        finish({
          lat: +pos.coords.latitude.toFixed(5),
          lng: +pos.coords.longitude.toFixed(5),
          accuracy: Math.round(pos.coords.accuracy),
        }),
      () => finish(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

const cache = new Map();
let lastCall = 0;

// Returns { place, city } or null. Nominatim allows ~1 request/second.
export async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);
  const wait = Math.max(0, lastCall + 1100 - Date.now());
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = await res.json();
    const a = j.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.county || "";
    const area = a.suburb || a.city_district || a.neighbourhood || a.quarter || "";
    const street = a.road ? `${a.road}${a.house_number ? " " + a.house_number : ""}` : "";
    const place = j.name || a.amenity || a.shop || a.leisure || a.tourism || street || area || city;
    const result = { place: place || "", area, city };
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

export function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function mapLink(loc) {
  return `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}`;
}
