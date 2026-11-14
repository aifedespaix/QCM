import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'

export type AvailableUpdate = Update

/**
 * Cherche une nouvelle version. Seule requête réseau du lecteur : une fois, au démarrage.
 * Hors-ligne ou en cas d'erreur, renvoie `null` sans rien afficher.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  try {
    return await check({ timeout: 8000 })
  } catch {
    return null
  }
}

/**
 * Télécharge, vérifie la signature, installe, puis relance QCM.
 * `onProgress` reçoit un pourcentage entier (0 à 100) quand la taille est connue.
 */
export async function installUpdate(update: AvailableUpdate, onProgress: (percent: number) => void): Promise<void> {
  let total = 0
  let received = 0
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0
    } else if (event.event === 'Progress') {
      received += event.data.chunkLength
      if (total > 0) onProgress(Math.min(100, Math.round((received / total) * 100)))
    } else {
      onProgress(100)
    }
  })
  // Sous Windows, l'installateur ferme et rouvre l'application lui-même ; ailleurs on relance ici.
  await relaunch()
}
