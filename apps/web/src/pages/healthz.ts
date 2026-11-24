import type { APIRoute } from 'astro'

// Test de vie du serveur de rendu (healthcheck Docker). Ne dépend pas de PocketBase.
export const prerender = false

export const GET: APIRoute = () => new Response('ok', { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } })
