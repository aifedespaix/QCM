import { computed, shallowRef } from 'vue'
import {
  addAttempt,
  emptyHistory,
  entryFromQcm,
  linkEntry,
  parseHistory,
  recentEntries,
  removeEntry,
  replaceEntry,
  upsertEntry,
  type QcmData,
  type QcmHistory,
  type QcmSessionResult,
} from '@qcm/core'

/**
 * Suivi des révisions, conservé sur l'appareil (`localStorage`, clé `qcm:history`).
 * Rien n'est envoyé sur Internet. État partagé par tous les composants de la page.
 */
const STORAGE_KEY = 'qcm:history'

function read(): QcmHistory {
  try {
    return parseHistory(localStorage.getItem(STORAGE_KEY))
  } catch {
    return emptyHistory()
  }
}

const history = shallowRef<QcmHistory>(read())

function write(next: QcmHistory): void {
  if (next === history.value) return
  history.value = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Stockage plein ou interdit : le suivi reste valable jusqu'à la fermeture.
  }
}

if (typeof window !== 'undefined') {
  // Un autre onglet a modifié le suivi.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) history.value = read()
  })
}

export function useQcmHistory() {
  return {
    history,
    /** QCM du plus récemment ouvert au plus ancien. */
    recents: computed(() => recentEntries(history.value)),
    /** Note l'ouverture d'un QCM et renvoie son empreinte (clé du suivi). */
    recordOpen(data: QcmData, extra: { recordId?: string; fileName?: string } = {}): string {
      const entry = entryFromQcm(data, extra)
      write(upsertEntry(history.value, entry))
      return entry.key
    },
    /** Rattache un QCM connu à son enregistrement en ligne. */
    link(key: string, recordId: string): void {
      write(linkEntry(history.value, key, recordId))
    },
    /** Une nouvelle version remplace `oldKey` : les résultats des questions inchangées sont conservés. */
    recordUpdate(oldKey: string, data: QcmData, extra: { recordId?: string; fileName?: string } = {}): string {
      const entry = entryFromQcm(data, extra)
      write(replaceEntry(history.value, oldKey, entry))
      return entry.key
    },
    recordResult(key: string, result: QcmSessionResult): void {
      write(addAttempt(history.value, key, result))
    },
    /** Oublie un QCM et ses passages. */
    forget(key: string): void {
      write(removeEntry(history.value, key))
    },
    /** Efface les passages, garde la liste des QCM. */
    clearAttempts(): void {
      write({ ...history.value, attempts: [] })
    },
  }
}
