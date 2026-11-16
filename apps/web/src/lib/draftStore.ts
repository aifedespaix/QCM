import type { Draft } from './editorDraft.ts'

/**
 * Brouillon gardé dans le navigateur (IndexedDB, images comprises) : survit à un rechargement ou à
 * une fermeture d'onglet. Une entrée par contexte : `new` (QCM vierge) ou `qcm:<id>` (QCM ouvert).
 */
const DB_NAME = 'qcm-editor'
const STORE = 'drafts'

export interface StoredDraft {
  savedAt: number
  data: {
    title: string
    subject: Draft['subject']
    level: Draft['level']
    chapter: string
    author: string
    description: string
    questions: {
      prompt: string
      choices: { text: string }[]
      correctIndex: number
      hint: string
      explanation: string
      image: { path: string; bytes: Uint8Array } | null
    }[]
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export function serializeDraft(draft: Draft): StoredDraft['data'] {
  return {
    title: draft.title,
    subject: draft.subject,
    level: draft.level,
    chapter: draft.chapter,
    author: draft.author,
    description: draft.description,
    questions: draft.questions.map((question) => ({
      prompt: question.prompt,
      choices: question.choices.map((choice) => ({ text: choice.text })),
      correctIndex: question.correctIndex,
      hint: question.hint,
      explanation: question.explanation,
      image: question.image ? { path: question.image.path, bytes: question.image.bytes } : null,
    })),
  }
}

/** Renvoie l'heure d'enregistrement, ou `null` si le navigateur refuse (navigation privée, quota). */
export async function saveStoredDraft(key: string, draft: Draft): Promise<number | null> {
  try {
    const savedAt = Date.now()
    const value: StoredDraft = { savedAt, data: serializeDraft(draft) }
    await run('readwrite', (store) => store.put(value, key))
    return savedAt
  } catch {
    return null
  }
}

export async function loadStoredDraft(key: string): Promise<StoredDraft | null> {
  try {
    const value = await run<StoredDraft | undefined>('readonly', (store) => store.get(key))
    return value?.data && Array.isArray(value.data.questions) && value.data.questions.length > 0 ? value : null
  } catch {
    return null
  }
}

export async function clearStoredDraft(key: string): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(key))
  } catch {
    // Rien à nettoyer si le stockage est indisponible.
  }
}
