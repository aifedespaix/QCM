import node from '@astrojs/node'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// Pages fixes (accueil, éditeur, suivi…) générées au build ; bibliothèque, fiches de QCM et plan du
// site rendus à chaque visite par le serveur Node (`export const prerender = false`), qui lit
// PocketBase par le réseau interne. Les données propres au compte restent chargées dans le navigateur.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [vue()],
  // Les fichiers générés sont servis par nginx ; le serveur Node ne rend que les pages dynamiques.
  vite: {
    plugins: [tailwindcss()],
    // Serveur autonome : toutes les dépendances dans le bundle, pas de node_modules dans l'image.
    ssr: { noExternal: true },
  },
})
