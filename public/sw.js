/* Service worker dell'Agenda Casale.
 * Scopo: installabilità della PWA, pagina offline e lettura offline dell'agenda.
 * Registrato con scope /admin/ (vedi components/pwa/ServiceWorkerRegister.tsx):
 * non intercetta mai il sito pubblico.
 *
 * Strategia (solo GET sotto /admin/; mai /api, mai /admin/login, mai POST come le server action):
 * - Navigazioni HTML e richieste RSC del router (header RSC: 1, non prefetch): rete con timeout di 4 s,
 *   poi cache. Ogni risposta 200 valida (non reindirizzata) viene salvata nella cache dell'utente corrente,
 *   con l'header x-agenda-cached-at (istante del salvataggio).
 * - Chiave di cache: percorso + query senza _rsc, più ?__agenda=html oppure ?__agenda=rsc.
 *   Le RSC del router dipendono dall'albero di stato (header Next-Router-State-Tree): la variante è
 *   ?__agenda=rsc-<hash FNV-1a dell'header>. HTML e RSC per lo stesso percorso restano separati.
 * - Offline una RSC si serve solo se la chiave coincide con lo stato del router: nessun ripiego su un altro stato.
 *   Altrimenti 503 e il router fa una navigazione completa, servita dall'HTML in cache.
 * - Dopo un invio della coda (bypass-cache-once): per pochi secondi la rete ha la precedenza (niente timeout
 *   di 4 s); se la rete fallisce si usa comunque la copia in cache.
 * - Cache per utente: agenda-pages-<versione>-<profileId>. Solo il logout (clear-user-data) e il cambio di
 *   profilo (set-user con un altro id) eliminano le cache delle pagine.
 *   I redirect (anche verso il login) non si salvano e non cancellano nulla. Se la pagina di login viene
 *   richiesta, o una RSC viene rediretta al login, il SW "dimentica" l'utente corrente: nessuna pagina in cache
 *   si serve offline finché non arriva set-user (il layout lo invia a ogni montaggio).
 * - Richieste di prefetch del router: mai salvate (la risposta può essere parziale) e non cambiano stato.
 * - Asset statici /_next/static, icone e logo: cache-first.
 * - Warm-up (warm-cache): pre-carica l'HTML delle pagine indicate, in background, 3 alla volta, al massimo ogni 30 minuti.
 */

const CACHE_VERSION = "v8";
const STATIC_CACHE = `agenda-static-${CACHE_VERSION}`;
const META_CACHE = `agenda-meta-${CACHE_VERSION}`;
const PAGES_PREFIX = "agenda-pages-";
const PAGES_CACHE_PREFIX = `${PAGES_PREFIX}${CACHE_VERSION}-`;
const ADMIN_PREFIX = "/admin";
const LOGIN_PATH = "/admin/login";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/logo.svg"];
const NETWORK_TIMEOUT_MS = 4000;
const CACHED_AT_HEADER = "x-agenda-cached-at";
const KIND_PARAM = "__agenda";
const CURRENT_USER_KEY = "/__agenda/current-user";
const WARM_STAMP_KEY = "/__agenda/last-warm";
const WARM_MIN_INTERVAL_MS = 30 * 60 * 1000;
const WARM_CONCURRENCY = 3;
const WARM_MAX_URLS = 60;
const WARM_FETCH_TIMEOUT_MS = 20000;
const STATUS_MAP_LIMIT = 100;
const BYPASS_MAX_MS = 30000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Elimina le cache di versioni precedenti; le cache utente della versione corrente restano (sono gestite dai messaggi).
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("agenda-") &&
                key !== STATIC_CACHE &&
                key !== META_CACHE &&
                !key.startsWith(PAGES_CACHE_PREFIX),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------
// Helper di percorso e di richiesta
// ---------------------------------------------------------------------

function isAdminPath(pathname) {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

function isLoginPath(pathname) {
  return pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`);
}

function isCacheableStatic(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/icons/") || pathname === "/logo.svg";
}

function isRscRequest(request) {
  return request.headers.get("RSC") === "1";
}

// Il prefetch del router può restituire un payload parziale: non si salva mai e non aggiorna lo stato.
function isPrefetchRequest(request) {
  return (
    request.headers.get("Next-Router-Prefetch") === "1" ||
    request.headers.has("Next-Router-Segment-Prefetch") ||
    (request.headers.get("Sec-Purpose") || "").includes("prefetch")
  );
}

// Chiave di cache: stesso percorso e query (senza _rsc), con la variante (html, rsc o rsc-<hash>) in coda.
function cacheKeyFor(url, variant) {
  const params = new URLSearchParams(url.search);
  params.delete("_rsc");
  params.delete(KIND_PARAM);
  params.sort();
  params.set(KIND_PARAM, variant);
  return new Request(`${url.origin}${url.pathname}?${params.toString()}`);
}

// Hash FNV-1a a 32 bit in esadecimale: breve e stabile, per la chiave delle RSC.
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Le risposte RSC dipendono dall'albero di stato del router (Next-Router-State-Tree): la variante lo include.
// Senza header resta "rsc".
function rscVariant(request) {
  const tree = request.headers.get("Next-Router-State-Tree");
  return tree ? `rsc-${fnv1a(tree)}` : "rsc";
}

// Solo risposte 200 same-origin, non reindirizzate, del tipo atteso.
function isStorable(response, kind) {
  if (!response || response.type !== "basic" || response.status !== 200 || response.redirected) return false;
  const type = response.headers.get("content-type") || "";
  return kind === "rsc" ? type.startsWith("text/x-component") : type.startsWith("text/html");
}

/*
 * Errore di un Server Component dentro una risposta 200: Next/React lo scrivono nel flusso RSC come riga
 * "<id hex>:E{...}" (nell'HTML compare dentro self.__next_f.push come stringa con \n e virgolette escapate).
 * Succede quando il server non raggiunge PocketBase: la risposta è "riuscita" ma la pagina è rotta.
 * Una risposta così non va salvata (sovrascriverebbe la copia buona) e va trattata come un 5xx.
 */
const SERVER_ERROR_ROW = /(?:^|\n|\\n|\[1,")[0-9a-f]+:E\{/;

function hasServerError(text) {
  return SERVER_ERROR_ROW.test(text);
}

/** Legge il corpo una volta: restituisce una copia per la pagina, una per la cache e se contiene un errore del server. */
async function inspectBody(response) {
  const text = await response.text();
  const init = { status: response.status, statusText: response.statusText, headers: response.headers };
  return { serverError: hasServerError(text), forPage: new Response(text, init), forCache: new Response(text, init) };
}

function redirectedToLogin(response) {
  if (!response.redirected) return false;
  try {
    return isLoginPath(new URL(response.url).pathname);
  } catch {
    return false;
  }
}

// Mantiene vivo il service worker finché la promessa è in corso, senza mai far fallire la risposta.
function keepAlive(event, promise) {
  const safe = Promise.resolve(promise).catch(() => {});
  try {
    event.waitUntil(safe);
  } catch {
    // Evento già concluso: la promessa prosegue comunque.
  }
  return safe;
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), ms);
    promise.then(
      (response) => {
        clearTimeout(timer);
        resolve({ response });
      },
      () => {
        clearTimeout(timer);
        resolve({ failed: true });
      },
    );
  });
}

// ---------------------------------------------------------------------
// Stato in memoria: esito dell'ultima richiesta per ogni pagina aperta (client id)
// ---------------------------------------------------------------------

const clientStatus = new Map();

function reportStatus(clientId, status) {
  if (!clientId) return;
  if (clientStatus.size >= STATUS_MAP_LIMIT) clientStatus.clear();
  const payload = { fromCache: status.fromCache === true, cachedAt: status.cachedAt || null };
  clientStatus.set(clientId, payload);
  self.clients
    .get(clientId)
    .then((client) => {
      if (client) client.postMessage({ type: "offline-status", ...payload });
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------
// Meta e cache per utente
// ---------------------------------------------------------------------

// Epoch incrementato a ogni cambio/cancellazione utente: le scritture avviate prima vengono scartate.
let epoch = 0;

// Le operazioni che scrivono sulle cache utente sono serializzate (niente scritture dopo un logout).
let storageQueue = Promise.resolve();

function serialize(task) {
  const run = storageQueue.then(task);
  storageQueue = run.catch(() => {});
  return run;
}

async function readMeta(key) {
  const meta = await caches.open(META_CACHE);
  const response = await meta.match(key);
  return response ? response.text() : null;
}

async function writeMeta(key, value) {
  const meta = await caches.open(META_CACHE);
  await meta.put(key, new Response(value));
}

async function deleteMeta(key) {
  const meta = await caches.open(META_CACHE);
  await meta.delete(key);
}

async function readCurrentUserId() {
  return (await readMeta(CURRENT_USER_KEY)) || null;
}

function pagesCacheName(userId) {
  return `${PAGES_CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

function deletePageCaches(shouldDelete) {
  return caches.keys().then((keys) =>
    Promise.all(
      keys
        .filter((key) => key.startsWith(PAGES_PREFIX) && shouldDelete(key))
        .map((key) => caches.delete(key)),
    ),
  );
}

async function readSession() {
  const userId = await readCurrentUserId();
  if (!userId) return { userId: null, epoch, cache: null };
  const name = pagesCacheName(userId);
  const cache = (await caches.has(name)) ? await caches.open(name) : null;
  return { userId, epoch, cache };
}

function setCurrentUser(userId) {
  return serialize(async () => {
    const previous = await readCurrentUserId();
    if (previous === userId) return;
    epoch += 1;
    clientStatus.clear();
    await deleteMeta(WARM_STAMP_KEY);
    if (!userId) {
      await deleteMeta(CURRENT_USER_KEY);
      await deletePageCaches(() => true);
      return;
    }
    await writeMeta(CURRENT_USER_KEY, userId);
    // Dispositivo condiviso: le cache delle pagine di altri profili vengono eliminate.
    const keep = pagesCacheName(userId);
    await deletePageCaches((name) => name !== keep);
  });
}

function clearUserData() {
  return serialize(async () => {
    epoch += 1;
    clientStatus.clear();
    await deleteMeta(CURRENT_USER_KEY);
    await deleteMeta(WARM_STAMP_KEY);
    await deletePageCaches(() => true);
  });
}

// Il SW non sa più chi è l'utente: nessuna pagina in cache si serve offline finché non arriva set-user.
// Le cache delle pagine restano (sono dell'utente: se torna lo stesso profilo le riusa).
function forgetCurrentUser() {
  return serialize(async () => {
    epoch += 1;
    clientStatus.clear();
    await deleteMeta(CURRENT_USER_KEY);
    await deleteMeta(WARM_STAMP_KEY);
  });
}

function matchCached(session, key) {
  if (!session.cache) return Promise.resolve(undefined);
  return session.cache.match(key);
}

// Salva la risposta nella cache dell'utente della sessione, solo se l'utente è ancora lo stesso.
function storeResponse(session, key, response) {
  if (!session.userId) return Promise.resolve();
  return serialize(async () => {
    if (session.epoch !== epoch) return;
    if ((await readCurrentUserId()) !== session.userId) return;
    const body = await response.blob();
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.delete("set-cookie");
    headers.set(CACHED_AT_HEADER, new Date().toISOString());
    const cache = await caches.open(pagesCacheName(session.userId));
    await cache.put(key, new Response(body, { status: 200, headers }));
  }).catch(() => {});
}

// ---------------------------------------------------------------------
// Fetch: navigazioni e RSC di /admin (rete con timeout, poi cache)
// ---------------------------------------------------------------------

function offlineFallback(kind) {
  if (kind === "rsc") {
    return Promise.resolve(
      new Response("", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }),
    );
  }
  return caches.open(STATIC_CACHE).then((cache) =>
    cache.match(OFFLINE_URL).then(
      (response) =>
        response ??
        new Response("Sei offline — riconnettiti per vedere l'agenda.", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
    ),
  );
}

// Fino a questo istante (ms epoch) navigazioni e RSC hanno la rete prioritaria (niente timeout): impostato dopo un
// invio della coda. Se la rete fallisce, si usa comunque la copia in cache.
let bypassUntil = 0;

async function handleAdminRequest(event, kind) {
  const request = event.request;
  const url = new URL(request.url);
  const key = cacheKeyFor(url, kind === "rsc" ? rscVariant(request) : "html");
  const prefetch = isPrefetchRequest(request);
  const login = isLoginPath(url.pathname);
  const storable = !prefetch && !login;
  const clientId = event.resultingClientId || event.clientId || "";
  const sessionPromise = readSession().catch(() => ({ userId: null, epoch, cache: null }));
  const priorityNetwork = Date.now() < bypassUntil;

  const network = fetch(request).then((response) => {
    // Redirect (es. /admin → /admin/agenda, pagine non consentite al ruolo, clic su una notifica): non si salvano
    // e non si cancella nulla. La destinazione di una navigazione non è leggibile, quindi non si può dire se è il login.
    if (response.type === "opaqueredirect") return response;
    if (redirectedToLogin(response)) {
      // Sessione scaduta vista da una RSC: il SW dimentica l'utente (nessuna pagina in cache offline).
      if (!prefetch) keepAlive(event, forgetCurrentUser());
      return response;
    }
    if (login) {
      // Pagina di login (sessione scaduta o nuovo accesso): il SW dimentica l'utente, il layout lo ricomunica.
      if (!prefetch) keepAlive(event, forgetCurrentUser());
      return response;
    }
    if (storable && isStorable(response, kind)) {
      return inspectBody(response).then(({ serverError, forPage, forCache }) => {
        if (serverError) return { serverError: true, response: forPage };
        keepAlive(event, sessionPromise.then((session) => storeResponse(session, key, forCache)));
        return forPage;
      });
    }
    return response;
  });

  // Rete prioritaria (dopo un invio della coda): nessun timeout, ma se la rete fallisce resta il ripiego sulla cache.
  const raw = priorityNetwork
    ? await network.then(
        (response) => ({ response }),
        () => ({ failed: true }),
      )
    : await withTimeout(network, NETWORK_TIMEOUT_MS);
  // Pagina 200 con errore del server dentro: come un 5xx (copia salvata se c'è, altrimenti la pagina d'errore).
  const serverError = Boolean(raw.response && raw.response.serverError);
  const outcome = serverError ? { response: raw.response.response, serverError: true } : raw;
  if (outcome.response && !outcome.serverError && outcome.response.status < 500) {
    if (!prefetch) reportStatus(clientId, { fromCache: false });
    return outcome.response;
  }

  // Rete assente, lenta (oltre il timeout) o errore del server: se c'è una copia, la si mostra.
  const session = await sessionPromise;
  const cached = await matchCached(session, key);
  if (cached) {
    if (!prefetch) reportStatus(clientId, { fromCache: true, cachedAt: cached.headers.get(CACHED_AT_HEADER) });
    return cached;
  }
  if (outcome.response) return outcome.response;
  if (outcome.timedOut) {
    // Nessuna copia: meglio aspettare la rete che mostrare una pagina vuota.
    const late = await network;
    if (!prefetch) reportStatus(clientId, { fromCache: false });
    return late && late.serverError ? late.response : late;
  }
  return offlineFallback(kind);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Asset statici versionati, icone e logo: cache-first.
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
    return;
  }

  // Le navigazioni fuori da /admin (sito pubblico) e le altre richieste non vengono mai gestite qui.
  if (!isAdminPath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(handleAdminRequest(event, "html").catch(() => offlineFallback("html")));
    return;
  }

  if (isRscRequest(request)) {
    event.respondWith(handleAdminRequest(event, "rsc").catch(() => offlineFallback("rsc")));
  }
});

// ---------------------------------------------------------------------
// Warm-up: pre-caricamento in background delle pagine indicate dalla pagina
// ---------------------------------------------------------------------

function normalizeWarmUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const raw of urls.slice(0, WARM_MAX_URLS * 3)) {
    if (typeof raw !== "string" || out.length >= WARM_MAX_URLS) continue;
    let url;
    try {
      url = new URL(raw, self.location.origin);
    } catch {
      continue;
    }
    if (url.origin !== self.location.origin || !isAdminPath(url.pathname) || isLoginPath(url.pathname)) continue;
    url.hash = "";
    const id = cacheKeyFor(url, "html").url;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(url);
  }
  return out;
}

async function runPool(items, size, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// Solo l'HTML: il router richiede le RSC con una chiave che dipende dal suo stato, che il warm-up non conosce.
async function warmOne(url, session) {
  if (session.epoch !== epoch) return;
  try {
    const response = await fetch(url.href, {
      credentials: "same-origin",
      cache: "no-store",
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(WARM_FETCH_TIMEOUT_MS) : undefined,
    });
    if (redirectedToLogin(response)) {
      await forgetCurrentUser();
      return;
    }
    if (isStorable(response, "html")) {
      const { serverError, forCache } = await inspectBody(response);
      // Pagina rotta da un errore del server (es. PocketBase irraggiungibile): si tiene la copia precedente.
      if (!serverError) await storeResponse(session, cacheKeyFor(url, "html"), forCache);
    } else if (response.body) {
      response.body.cancel().catch(() => {});
    }
  } catch {
    // Rete assente o timeout: la pagina resta com'era, si riprova al prossimo giro.
  }
}

async function warmCache(urls, reply) {
  const targets = normalizeWarmUrls(urls);
  if (!targets.length) return reply({ started: false, reason: "empty" });
  const session = await serialize(readSession);
  if (!session.userId) return reply({ started: false, reason: "no-user" });
  const last = Number((await readMeta(WARM_STAMP_KEY)) || 0);
  if (Date.now() - last < WARM_MIN_INTERVAL_MS) return reply({ started: false, reason: "throttled" });
  await writeMeta(WARM_STAMP_KEY, String(Date.now()));
  reply({ started: true, count: targets.length });
  await runPool(targets, WARM_CONCURRENCY, (url) => warmOne(url, session));
}

// ---------------------------------------------------------------------
// Messaggi dalla pagina: set-user, clear-user-data, warm-cache, get-status
// ---------------------------------------------------------------------

// Id PocketBase: solo caratteri alfanumerici, trattini e underscore. Altro valore = nessun utente.
function sanitizeUserId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

self.addEventListener("message", (event) => {
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const port = event.ports && event.ports[0];
  const reply = (payload) => {
    if (port) port.postMessage(payload);
  };
  const sourceId = event.source && event.source.id ? event.source.id : "";

  switch (data.type) {
    case "set-user":
      keepAlive(
        event,
        setCurrentUser(sanitizeUserId(data.profileId)).then(
          () => reply({ ok: true }),
          () => reply({ ok: false }),
        ),
      );
      return;
    case "clear-user-data":
      keepAlive(
        event,
        clearUserData().then(
          () => reply({ ok: true }),
          () => reply({ ok: false }),
        ),
      );
      return;
    case "warm-cache":
      keepAlive(
        event,
        warmCache(Array.isArray(data.urls) ? data.urls : [], reply).catch(() => reply({ started: false, reason: "error" })),
      );
      return;
    case "get-status":
      reply(clientStatus.get(sourceId) || { fromCache: false, cachedAt: null });
      return;
    case "bypass-cache-once": {
      // Dopo un invio della coda il refresh deve vedere i dati appena salvati: rete prioritaria per qualche secondo.
      const ms = Math.min(Math.max(Number(data.ms) || 0, 0), BYPASS_MAX_MS);
      bypassUntil = Date.now() + ms;
      reply({ ok: true });
      return;
    }
    default:
      return;
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
