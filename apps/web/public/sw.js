/* Service worker de QCM : le site reste utilisable sans réseau pour les pages déjà visitées.
 * - Fichiers générés (/_astro/, icônes) : cache d'abord (noms avec empreinte, donc immuables).
 * - Pages : réseau d'abord, copie en cache si le réseau échoue, sinon page « hors connexion ».
 *   Bibliothèque et fiches sont rendues par le serveur : la copie en cache contient la liste.
 * - Tout ce qui n'est pas du même domaine (PocketBase, etc.) ou pas en GET passe sans interception.
 * Incrémenter VERSION force le renouvellement des caches. */
const VERSION = 'v4'
const PAGES = `qcm-pages-${VERSION}`
const ASSETS = `qcm-assets-${VERSION}`
const OFFLINE_URL = '/offline.html'
const PRECACHE = ['/', '/bibliotheque/', '/editeur/', '/statistiques/', OFFLINE_URL, '/manifest.webmanifest', '/register-sw.js', '/favicon.svg', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      // Un échec isolé (page absente) ne doit pas empêcher l'installation.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== PAGES && key !== ASSETS).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // PocketBase (API, fichiers, administration) est servi sous le même domaine : jamais de cache ici.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_/')) return

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request, url))
    return
  }

  const immutable = url.pathname.startsWith('/_astro/') || /\.(?:png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)
  if (immutable) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request)
        if (hit) return hit
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
  }
})

/** Au-delà, une page déjà visitée s'affiche depuis le cache plutôt que de laisser l'écran blanc. */
const NAVIGATION_TIMEOUT_MS = 6000

async function cachedPage(request, url) {
  const cache = await caches.open(PAGES)
  // Repli sur la page sans paramètres (?source=pwa, filtres de la bibliothèque…) : mieux que rien.
  return (
    (await cache.match(request)) ||
    (await cache.match(url.pathname)) ||
    (await cache.match(url.pathname.replace(/\/?$/, '/'))) ||
    undefined
  )
}

function navigate(request, url) {
  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone()
      caches.open(PAGES).then((cache) => cache.put(request, copy))
    }
    return response
  })
  // Réseau qui traîne (connexion mobile endormie, Wi-Fi capricieux) : copie en cache si elle existe,
  // sinon on continue d'attendre le réseau. La copie fraîche est rangée dès qu'elle arrive.
  const slow = new Promise((resolve) => setTimeout(resolve, NAVIGATION_TIMEOUT_MS))
    .then(() => cachedPage(request, url))
    .then((cached) => cached || network)
  return Promise.race([network, slow]).catch(async () => (await cachedPage(request, url)) || (await caches.match(OFFLINE_URL)) || Response.error())
}
