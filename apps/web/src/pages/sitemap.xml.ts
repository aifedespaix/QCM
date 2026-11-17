import type { APIRoute } from 'astro'

// Pages publiques indexables. /qcm (fiche chargée côté navigateur), /admin et /offline.html sont exclus.
const PAGES = [
  { path: '/', priority: '1.0' },
  { path: '/bibliotheque', priority: '0.9' },
  { path: '/editeur', priority: '0.7' },
  { path: '/statistiques', priority: '0.4' },
]

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('http://localhost:4321')
  const urls = PAGES.map(
    (page) => `  <url><loc>${new URL(page.path, base).href}</loc><priority>${page.priority}</priority></url>`,
  ).join('\n')
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
