import { invoke } from '@tauri-apps/api/core'
import type { Level, Subject } from '@qcm/core'

/**
 * Bibliothèque en ligne (PocketBase), lue à travers le backend Rust : la webview ne parle
 * jamais au réseau. Lecture anonyme : seuls les QCM publiés sont visibles.
 */
export interface LibraryRecord {
  id: string
  title: string
  description: string
  subject: Subject
  level: Level
  chapter: string
  question_count: number
  has_images: boolean
  file: string
  rating_avg: number
  rating_count: number
}

export interface LibraryPage {
  page: number
  totalPages: number
  totalItems: number
  items: LibraryRecord[]
}

export type LibrarySort = 'recent' | 'rating' | 'title'

export interface LibraryQuery {
  search: string
  subject: Subject | ''
  level: Level | ''
  sort: LibrarySort
  page: number
}

/** `unconfigured` : application construite sans adresse de bibliothèque. `offline` : pas de réponse. */
export type LibraryFailure = 'offline' | 'unconfigured' | 'missing'

export class LibraryError extends Error {
  constructor(readonly reason: LibraryFailure) {
    super(reason)
  }
}

const RECORDS = '/api/collections/qcms/records'
const FIELDS = 'id,title,description,subject,level,chapter,question_count,has_images,file,rating_avg,rating_count'
const SORTS: Record<LibrarySort, string> = {
  recent: '-created',
  rating: '-rating_avg,-rating_count,-created',
  title: 'title',
}

function toFailure(code: unknown): LibraryError {
  if (code === 'E_NO_LIBRARY') return new LibraryError('unconfigured')
  return new LibraryError(code === 'E_NOT_FOUND' ? 'missing' : 'offline')
}

/** Texte → littéral de filtre PocketBase. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`
}

async function get<T>(path: string): Promise<T> {
  let text: string
  try {
    text = await invoke<string>('library_get', { path })
  } catch (code) {
    throw toFailure(code)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new LibraryError('offline')
  }
}

export function libraryAvailable(): Promise<boolean> {
  return invoke<boolean>('library_available').catch(() => false)
}

export function listLibrary(query: LibraryQuery): Promise<LibraryPage> {
  const parts = ['status = "published"']
  const search = query.search.trim()
  if (search) {
    const q = quote(search)
    parts.push(`(title ~ ${q} || chapter ~ ${q} || description ~ ${q})`)
  }
  if (query.subject) parts.push(`subject = ${quote(query.subject)}`)
  if (query.level) parts.push(`level = ${quote(query.level)}`)
  const params = new URLSearchParams({
    page: String(query.page),
    perPage: '24',
    sort: SORTS[query.sort],
    filter: parts.join(' && '),
    fields: FIELDS,
  })
  return get<LibraryPage>(`${RECORDS}?${params}`)
}

export function getLibraryRecord(id: string): Promise<LibraryRecord> {
  return get<LibraryRecord>(`${RECORDS}/${encodeURIComponent(id)}?${new URLSearchParams({ fields: FIELDS })}`)
}

/** Télécharge le `.qcm` d'un enregistrement et renvoie le chemin du fichier provisoire. */
export async function downloadLibraryQcm(record: Pick<LibraryRecord, 'id' | 'file'>): Promise<string> {
  try {
    return await invoke<string>('library_download', { recordId: record.id, fileName: record.file })
  } catch (code) {
    throw toFailure(code)
  }
}
