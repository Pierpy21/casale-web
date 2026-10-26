/* Service worker minimale dell'Agenda Casale.
 * Scopo: rendere l'app installabile e mostrare una pagina offline semplice.
 * Registrato con scope /admin/ (vedi components/pwa/ServiceWorkerRegister.tsx):
 * non intercetta mai il sito pubblico. Non mette mai in cache HTML dinamico, risposte autenticate o /api. */

const CACHE_VERSION = "v4";
const STATIC_CACHE = `agenda-static-${CACHE_VERSION}`;
const ADMIN_PREFIX = "/admin";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("agenda-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isAdminPath(pathname) {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

function isCacheableStatic(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigazioni (pagine HTML autenticate dell'agenda): sempre dalla rete, mai in cache.
  // Se la rete non risponde, mostra la pagina offline.
  // Le navigazioni fuori da /admin (sito pubblico) non vengono mai gestite qui.
  if (request.mode === "navigate") {
    if (!isAdminPath(url.pathname)) return;
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(STATIC_CACHE).then((cache) =>
          cache.match(OFFLINE_URL).then(
            (response) =>
              response ??
              new Response("Sei offline — riconnettiti per vedere l'agenda.", {
                status: 503,
                headers: { "content-type": "text/plain; charset=utf-8" },
              }),
          ),
        ),
      ),
    );
    return;
  }

  // Asset statici versionati e icone: cache-first.
  if (isCacheableStatic(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        }),
      ),
    );
  }
});

// ---------------------------------------------------------------------
// Notifiche push: mostrate anche ad app chiusa (PWA installata).
// Il payload è JSON { title, body, url, tag } inviato dal server.
// ---------------------------------------------------------------------
const NOTIFICATION_ICON = "/icons/icon-192.png?v=2";

// Accetta solo percorsi che, una volta risolti, restano sull'origine dell'app (niente redirect esterni).
function sameOriginPath(value) {
  if (typeof value !== "string") return "/admin/agenda";
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return "/admin/agenda";
    const path = url.pathname + url.search + url.hash;
    return path.startsWith("//") ? "/admin/agenda" : path;
  } catch {
    return "/admin/agenda";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Agenda Casale", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Agenda Casale";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: typeof data.tag === "string" ? data.tag : undefined,
    renotify: typeof data.tag === "string",
    data: { url: sameOriginPath(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/admin/agenda";
  const target = new URL(sameOriginPath(path), self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Riusa solo una finestra dell'agenda: mai una scheda del sito pubblico.
      const sameOrigin = clientList.find((c) => {
        try {
          const clientUrl = new URL(c.url);
          return clientUrl.origin === self.location.origin && isAdminPath(clientUrl.pathname);
        } catch {
          return false;
        }
      });
      if (sameOrigin) {
        return sameOrigin.focus().then((client) => {
          if (client && typeof client.navigate === "function") {
            return client.navigate(target).catch(() => client);
          }
          return client;
        });
      }
      return self.clients.openWindow(target);
    }),
  );
});
