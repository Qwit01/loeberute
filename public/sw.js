// Cacher kun selve app-shell'en for hurtigere genindlæsning og
// installérbarhed. API-kald, karttiles og navigation til Google Maps skal
// altid ramme netværket — appen er ikke ment til at virke offline, den skal
// bruge live lokation og ruteberegning.
const CACHE_NAME = "loeberute-shell-v1";
const SHELL_FILES = [
  "/",
  "/app.js",
  "/simplify.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});
