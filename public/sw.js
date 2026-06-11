// LOSPOR clinical PWA service worker
// Strategy:
//   - App shell (index.html): cache on install, serve from cache as offline fallback
//   - Static JS/CSS/fonts (/_expo/static/*, /assets/*): cache-first after first fetch
//   - API calls (/api/*): always network-only — clinical data must be live
const CACHE = "lospor-shell-v3"
const STATIC_CACHE = "lospor-static-v3"

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(["/", "/index.html"]))
  )
  self.skipWaiting()
})

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url)

  // Never intercept API calls — clinical data must always come from the server
  if (url.pathname.startsWith("/api/")) return

  // Cache-first for hashed static bundles (JS, CSS, fonts, images)
  // These filenames change on every build so stale entries are never served
  if (
    url.pathname.startsWith("/_expo/static/") ||
    url.pathname.startsWith("/assets/")
  ) {
    e.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        const cached = await cache.match(e.request)
        if (cached) return cached
        const response = await fetch(e.request)
        if (response.ok) cache.put(e.request, response.clone())
        return response
      })
    )
    return
  }

  // Navigation requests (HTML): network-first, cached shell as offline fallback
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/index.html"))
    )
  }
})
