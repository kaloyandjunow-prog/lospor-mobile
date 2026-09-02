// LOSPOR clinical PWA service worker
// Strategy:
//   - App shell (index.html): cache on install, serve from cache as offline fallback
//   - Static JS/CSS/fonts (/_expo/static/*, /assets/*): cache-first after first fetch
//   - API calls (/api/*): always network-only — clinical data must be live
//
// The cache names carry the build id, stamped in by scripts/patch-pwa.mjs, so a
// deploy retires the previous caches through the activate handler below.
//
// They used to be a hand-written "v4" that no release had ever changed, and the
// combination was a trap with no way out: a bundle is served cache-first and
// never revalidated, anything with an ok status is stored, and nothing ever
// retires an entry. One interrupted download — a phone leaving a lift, a hotspot
// dropping mid-fetch — puts a truncated bundle in the cache under the filename
// the app asks for, and the device then fails to parse it on every visit
// afterwards. That failure shows nothing: no splash, no error, a black screen,
// and it survives clearing cookies because Cache Storage is not cookies.
const BUILD_ID = "__BUILD_ID__"
const CACHE = `lospor-shell-${BUILD_ID}`
const STATIC_CACHE = `lospor-static-${BUILD_ID}`

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
        // Only a whole, first-party 200 is worth keeping. A 206 is a fragment
        // and an opaque cross-origin response has a status of 0, and either one
        // stored under the name of a script is a file the app can never parse
        // and will never re-fetch.
        if (response.status === 200 && response.type === "basic") {
          cache.put(e.request, response.clone())
        }
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

// Focus (or open) the app when a reminder notification is tapped.
self.addEventListener("notificationclick", e => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ("focus" in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow("/")
    })
  )
})
