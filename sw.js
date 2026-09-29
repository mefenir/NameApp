// Service worker: makes NameApp open instantly and work offline.
// Bump VERSION whenever app files change so users get the update.
const VERSION = "nameapp-v3";
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

  // Stale-while-revalidate: answer from cache immediately, refresh in the background.
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: sameOrigin });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || (req.mode === "navigate" ? cache.match("index.html") : undefined));
      return cached || network;
    })
  );
});
