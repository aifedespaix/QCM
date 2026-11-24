import type { APIRoute } from 'astro'
import { qcmPath } from '../lib/qcmUrl.ts'
import { fetchSitemapEntries } from '../lib/server/catalog.ts'

// Plan du site rendu à la demande : chaque QCM publié y figure dès sa validation.
export const prerender = false

// Les adresses finissent par « / » : c'est la forme canonique servie par nginx.
// /admin, /agent, /offline.html et les recherches libres sont exclus.
const PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/bibliotheque/', priority: '0.9', changefreq: 'daily' },
  { path: '/editeur/', priority: '0.6', changefreq: 'monthly' },
  { path: '/statistiques/', priority: '0.3', changefreq: 'monthly' },
]

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('http://localhost:4321')
  const entries = await fetchSitemapEntries()
  const urls = [
    ...PAGES.map((page) => ({ loc: new URL(page.path, base).href, priority: page.priority, changefreq: page.changefreq, lastmod: '' })),
    ...(entries ?? []).map((entry) => ({
      loc: new URL(qcmPath(entry), base).href,
      priority: '0.8',
      changefreq: 'monthly',
      lastmod: entry.updated ? new Date(entry.updated.replace(' ', 'T')).toISOString() : '',
    })),
  ]
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (url) =>
        `  <url><loc>${escapeXml(url.loc)}</loc>${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}<changefreq>${url.changefreq}</changefreq><priority>${url.priority}</priority></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n')
  return new Response(body, {
    // Liste incomplète (PocketBase injoignable) : pas de mise en cache, le prochain passage aura tout.
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': entries ? 'public, max-age=3600' : 'no-store' },
    status: entries ? 200 : 503,
  })
}
