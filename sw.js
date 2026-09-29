// Service worker: makes NameApp open instantly and work offline.
// Bump VERSION whenever app files change so users get the update.
const VERSION = "nameapp-v7";
const SHELL = [
  "./",
  "index.html",
  "css/app.css",
  "js/app.js",
  "js/store.js",
  "js/geo.js",
  "js/review.js",
  "js/firebase-config.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (!sameOrigin && !firebaseSdk) return; // Firestore, Auth, map lookups go straight to the network

  // App files: network first so updates show up straight away; cache when offline.
  // Firebase SDK files never change per version, so they come from cache first.
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      if (firebaseSdk) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      try {
        const res = await fetch(req, sameOrigin ? { cache: "no-cache" } : undefined);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const cached = await cache.match(req, { ignoreSearch: sameOrigin });
        return cached || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
      }
    })
  );
});
