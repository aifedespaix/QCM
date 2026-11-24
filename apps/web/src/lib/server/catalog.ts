/**
 * Lectures de la bibliothèque côté serveur (rendu des pages publiques).
 *
 * Le serveur Astro parle à PocketBase par le réseau interne de Docker (`PB_INTERNAL_URL`), sans
 * passer par Internet ni par le navigateur du visiteur : la page arrive avec son contenu. Requêtes
 * anonymes : seuls les QCM publiés sont visibles. Une panne renvoie `null` et la page retombe sur le
 * chargement dans le navigateur, comme avant.
 */
import PocketBase, { ClientResponseError } from 'pocketbase'
import { PAGE_SIZE, type QcmRecord } from '../pb.ts'
import type { LibraryState } from '../libraryQuery.ts'

const SORTS = { recent: '-created', rating: '-rating_avg,-rating_count,-created', comments: '-comment_count,-created', title: 'title' } as const

/** Une réponse interne prend quelques millisecondes : au-delà, on rend la page sans attendre. */
const TIMEOUT_MS = 2500
const ATTEMPTS = 2

function baseUrl(): string {
  return process.env.PB_INTERNAL_URL || import.meta.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090'
}

function client(): PocketBase {
  const pb = new PocketBase(baseUrl())
  pb.autoCancellation(false)
  return pb
}

function isNotFound(error: unknown): boolean {
  return error instanceof ClientResponseError && (error.status === 404 || error.status === 400)
}

async function attempt<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  let last: unknown
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return await run(AbortSignal.timeout(TIMEOUT_MS))
    } catch (error) {
      if (isNotFound(error)) throw error
      last = error
    }
  }
  throw last
}

export interface LibraryPage {
  items: QcmRecord[]
  page: number
  totalPages: number
  totalItems: number
}

/** Une page de la bibliothèque publique, ou `null` si PocketBase ne répond pas. */
export async function fetchLibraryPage(state: LibraryState): Promise<LibraryPage | null> {
  const pb = client()
  const parts = ['status = "published"']
  if (state.search) parts.push(pb.filter('(title ~ {:q} || chapter ~ {:q} || description ~ {:q})', { q: state.search }))
  if (state.subject) parts.push(pb.filter('subject = {:subject}', { subject: state.subject }))
  if (state.level) parts.push(pb.filter('level = {:level}', { level: state.level }))
  try {
    const result = await attempt((signal) =>
      pb.collection('qcms').getList<QcmRecord>(state.page, PAGE_SIZE, {
        filter: parts.join(' && '),
        sort: SORTS[state.sort],
        expand: 'owner',
        signal,
      }),
    )
    return { items: result.items, page: result.page, totalPages: Math.max(1, result.totalPages), totalItems: result.totalItems }
  } catch (error) {
    console.error('[ssr] bibliothèque indisponible :', (error as Error).message)
    return null
  }
}

export type QcmLookup = { status: 'found'; record: QcmRecord } | { status: 'missing' } | { status: 'unavailable' }

/** Un QCM publié. `missing` : inconnu ou non publié (brouillon visible seulement par son auteur). */
export async function fetchPublishedQcm(id: string): Promise<QcmLookup> {
  const pb = client()
  try {
    const record = await attempt((signal) => pb.collection('qcms').getOne<QcmRecord>(id, { expand: 'owner', signal }))
    return record.status === 'published' ? { status: 'found', record } : { status: 'missing' }
  } catch (error) {
    if (isNotFound(error)) return { status: 'missing' }
    console.error('[ssr] QCM indisponible :', (error as Error).message)
    return { status: 'unavailable' }
  }
}

/** Tous les QCM publiés (plan du site), du plus récemment modifié au plus ancien. */
export async function fetchSitemapEntries(): Promise<Pick<QcmRecord, 'id' | 'title' | 'updated'>[] | null> {
  const pb = client()
  try {
    return await attempt((signal) =>
      pb.collection('qcms').getFullList<QcmRecord>({ filter: 'status = "published"', sort: '-updated', fields: 'id,title,updated', batch: 500, signal }),
    )
  } catch (error) {
    console.error('[ssr] plan du site incomplet :', (error as Error).message)
    return null
  }
}
