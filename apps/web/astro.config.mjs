import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// Site 100 % statique : toutes les données dynamiques (bibliothèque, compte, publication)
// passent par des îlots Vue qui appellent PocketBase depuis le navigateur.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  integrations: [vue()],
  vite: {
    plugins: [tailwindcss()],
  },
})
