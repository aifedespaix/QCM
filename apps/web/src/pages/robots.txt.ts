import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('http://localhost:4321')
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /agent',
    // API et administration de PocketBase (les images des QCM restent accessibles).
    'Disallow: /api/',
    'Allow: /api/files/',
    'Disallow: /_/',
    '',
    `Sitemap: ${new URL('/sitemap.xml', base).href}`,
    '',
  ].join('\n')
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
