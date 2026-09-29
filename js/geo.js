// Location helpers: a quick GPS fix + reverse geocoding via OpenStreetMap Nominatim.
// Location is always optional — if it's denied or slow, captures still save.

// Resolves to { lat, lng, accuracy } or { error: "denied" | "unavailable" | "unsupported" }.
// Tries a precise fix first; if that's slow (indoors), falls back to a quick approximate one.
function once(opts) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    setTimeout(() => finish({ error: "unavailable", message: "No answer from the phone in time" }), opts.timeout + 1000);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({
        lat: +pos.coords.latitude.toFixed(5),
        lng: +pos.coords.longitude.toFixed(5),
        accuracy: Math.round(pos.coords.accuracy),
      }),
      (err) => finish({ error: err.code === 1 ? "denied" : "unavailable", code: err.code, message: err.message }),
      opts
    );
  });
}

export async function getPosition() {
  if (!("geolocation" in navigator)) return { error: "unsupported", message: "This browser has no location support" };
  const precise = await once({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  if (!precise.error || precise.error === "denied") return precise;
  return once({ enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 });
}

export const geoDebug = { lastError: null };
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
    if (!res.ok) {
      geoDebug.lastError = `Place lookup returned HTTP ${res.status}`;
      return null;
    }
    const j = await res.json();
    const a = j.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.county || "";
    const area = a.suburb || a.city_district || a.neighbourhood || a.quarter || "";
    const street = a.road ? `${a.road}${a.house_number ? " " + a.house_number : ""}` : "";
    const place = j.name || a.amenity || a.shop || a.leisure || a.tourism || street || area || city;
    const result = { place: place || "", area, city };
    geoDebug.lastError = null;
    cache.set(key, result);
    return result;
  } catch (e) {
    geoDebug.lastError = `Place lookup failed: ${e.message}`;
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

// Opens the phone's own maps app where possible.
export function mapLink(loc) {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return `https://maps.apple.com/?ll=${loc.lat},${loc.lng}&q=${encodeURIComponent(loc.place || "Met here")}`;
  return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
}

// Embeddable OpenStreetMap view (no API key needed) with a marker at the spot.
export function mapEmbedUrl(loc) {
  const dLat = 0.0025, dLng = 0.004;
  const bbox = [loc.lng - dLng, loc.lat - dLat, loc.lng + dLng, loc.lat + dLat].map((n) => n.toFixed(5)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat},${loc.lng}`;
}

// Current permission state where the browser exposes it ("granted" | "denied" | "prompt" | "unknown").
export async function permissionState() {
  try {
    const st = await navigator.permissions.query({ name: "geolocation" });
    return st.state;
  } catch {
    return "unknown";
  }
}
