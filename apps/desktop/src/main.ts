import { createApp } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')

// La fenêtre est créée masquée (pas d'écran blanc ni de bandes noires pendant qu'elle s'agrandit) :
// on l'affiche une fois le premier rendu peint.
requestAnimationFrame(() => requestAnimationFrame(() => void getCurrentWindow().show().catch(() => {})))
