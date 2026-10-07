/* Cache only a generic offline notice and app icons, never shopper data. */
const scope = new URL(self.registration.scope);
const prefix = `soso-pwa:${scope.pathname}:`;
const cacheName = `${prefix}v2`;
const offlineUrl = new URL("offline.html", scope).href;
const staticUrls = ["offline.html", "pwa-icon-gold-192.png", "pwa-icon-gold-512.png"]
  .map((path) => new URL(path, scope).href);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(staticUrls)));
  // Do not replace a worker while a shopper has checkout open.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(prefix) && key !== cacheName)
      .map((key) => caches.delete(key)),
  )));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== scope.origin) return;
  // APIs, payments, media and third-party requests are never intercepted.
  if (!url.pathname.startsWith(scope.pathname)
      || url.pathname === `${scope.pathname}api`
      || url.pathname.startsWith(`${scope.pathname}api/`)) return;
  if (staticUrls.includes(url.href)) {
    event.respondWith(caches.open(cacheName).then(async (cache) =>
      (await cache.match(request)) || fetch(request)));
    return;
  }
  if (request.mode !== "navigate") return;
  // No page, authentication, price, stock or checkout response is stored.
  event.respondWith(fetch(request, { cache: "no-store" }).catch(async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(offlineUrl)) || new Response(
      "SOSO is offline. Reconnect and reload to continue.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }));
});
