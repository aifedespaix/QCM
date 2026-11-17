/* Service worker de QCM : le site reste utilisable sans réseau pour les pages déjà visitées.
 * - Fichiers générés (/_astro/, icônes) : cache d'abord (noms avec empreinte, donc immuables).
 * - Pages : réseau d'abord, copie en cache si le réseau échoue, sinon page « hors connexion ».
 * - Tout ce qui n'est pas du même domaine (PocketBase, etc.) ou pas en GET passe sans interception.
 * Incrémenter VERSION force le renouvellement des caches. */
const VERSION = 'v2'
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(PAGES).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => {
          const cache = await caches.open(PAGES)
          // Les paramètres (?source=pwa, ?id=…) ne changent pas le HTML : on retombe sur la page nue.
          return (
            (await cache.match(request)) ||
            (await cache.match(url.pathname)) ||
            (await cache.match(url.pathname.replace(/\/?$/, '/'))) ||
            (await cache.match(OFFLINE_URL)) ||
            Response.error()
          )
        }),
    )
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
