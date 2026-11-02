/* Service worker for Seclusa Notes.
   The shell is precached so the app opens with no network. Notes live in
   IndexedDB, so no data handling is needed here.

   Bump CACHE when the shell changes; the activate handler drops older caches.

   Only the shell is cached: no request or response body carrying note data
   ever passes through here. */
const CACHE_PREFIX = "seclusa-notes-shell-";
const CACHE = CACHE_PREFIX + "v0.2.3";
const SHELL = ["./", "./index.html",
  "./seclusa-base.css", "./seclusa-base.css?v=0.2.3",
  "./app.css", "./app.css?v=0.2.3",
  "./src/theme-boot.js", "./src/core.js", "./src/crypto.js", "./src/recurrence.js", "./src/i18n.js",
  "./src/db.js", "./src/store.js", "./src/ui.js", "./src/main.js",
  "./src/backup.js", "./src/shell.js",
  "./manifest.webmanifest", "./icon.svg",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png",
  "./assets/fonts/dm-sans-latin-400-normal.woff2",
  "./assets/fonts/dm-sans-latin-600-normal.woff2",
  "./assets/fonts/dm-sans-latin-700-normal.woff2",
  "./assets/fonts/sora-latin-600-normal.woff2",
  "./assets/fonts/sora-latin-700-normal.woff2",
  "./assets/fonts/sora-latin-800-normal.woff2"];

/* Required for a usable offline launch. Optional icons and fonts may fail
   without aborting install. Every script and stylesheet is here: if one of
   them were missing from the cache, the app would load and then break. */
const CRITICAL = ["./index.html", "./seclusa-base.css?v=0.2.3",
  "./app.css?v=0.2.3",
  "./src/theme-boot.js", "./src/core.js", "./src/crypto.js", "./src/recurrence.js", "./src/i18n.js",
  "./src/db.js", "./src/store.js", "./src/ui.js", "./src/main.js",
  "./src/backup.js", "./src/shell.js"];

const CACHEABLE = new Set(SHELL.map((u) => new URL(u, self.location.href).pathname));

function offlineResponse() {
  return new Response("<!doctype html><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>Offline</title><p>This app is not cached yet. Reconnect once to install it.</p>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function ownCache() {
  return caches.open(CACHE);
}

function ownMatch(request) {
  return ownCache().then((c) => c.match(request));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))).then((results) => {
        const failed = [];
        for (let i = 0; i < SHELL.length; i++) {
          if (results[i].status === "rejected" && CRITICAL.indexOf(SHELL[i]) >= 0) {
            failed.push(SHELL[i]);
          }
        }
        if (failed.length) {
          throw new Error("shell precache failed: " + failed.join(", "));
        }
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k.startsWith(CACHE_PREFIX))
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  const noteId = data && typeof data === "object" ? data.noteId : null;
  const target = "./index.html" + (noteId !== undefined && noteId !== null
    ? "?note=" + encodeURIComponent(String(noteId)) : "");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.indexOf(self.registration.scope) === 0) {
            client.postMessage({ type: "open-note", noteId: noteId });
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
      .catch(() => self.clients.openWindow(target))
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => ownMatch("./index.html").then((r) => r || offlineResponse()))
    );
    return;
  }

  // Assets: cache first. Never return the HTML offline page for JS/CSS —
  // that breaks the app into a non-interactive shell.
  // Match only this SW's cache — bare caches.match() searches every origin cache.
  event.respondWith(
    ownMatch(req).then((hit) => hit || fetch(req).then((res) => {
      // Only shell files are stored. Any other same-origin GET passes through,
      // so the cache cannot grow with URLs the app never asked for.
      if (res.ok && res.type === "basic" && CACHEABLE.has(url.pathname)) {
        const copy = res.clone();
        ownCache().then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => new Response("", { status: 503, statusText: "Offline" })))
  );
});
