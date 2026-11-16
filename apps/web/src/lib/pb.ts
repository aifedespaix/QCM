import PocketBase, { type RecordModel } from 'pocketbase'
import { readonly, ref } from 'vue'
import {
  QCM_MIME,
  qcmFileName,
  readQcmArchive,
  summarizeQcm,
  type Level,
  type QcmArchive,
  type QcmData,
  type Subject,
} from '@qcm/core'

export const pb = new PocketBase(import.meta.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090')
// Les îlots Vue relancent parfois la même requête : on désactive l'annulation automatique.
pb.autoCancellation(false)

export interface UserRecord extends RecordModel {
  name: string
  avatar: string
  /** Posé par le serveur pour le compte dont l'e-mail est celui de l'administrateur. */
  admin?: boolean
}

export interface QcmRecord extends RecordModel {
  owner: string
  title: string
  description: string
  subject: Subject
  level: Level
  chapter: string
  language: string
  question_count: number
  has_images: boolean
  file: string
  thumbnail: string
  status: 'pending' | 'published' | 'hidden'
  rating_avg: number
  rating_count: number
  created: string
  updated: string
  expand?: { owner?: UserRecord }
}

export interface RatingRecord extends RecordModel {
  qcm: string
  user: string
  value: number
}

export interface CommentRecord extends RecordModel {
  qcm: string
  user: string
  text: string
  hidden: boolean
  created: string
  updated: string
  expand?: { user?: UserRecord }
}

// ---------------------------------------------------------------- Compte

const currentUser = ref<UserRecord | null>((pb.authStore.record as UserRecord | null) ?? null)
pb.authStore.onChange(() => {
  currentUser.value = (pb.authStore.record as UserRecord | null) ?? null
})

export function useAuth() {
  return {
    user: readonly(currentUser),
    /** Ouvre la fenêtre Google. À appeler directement depuis un clic (sinon le navigateur bloque la fenêtre). */
    loginWithGoogle: async (): Promise<void> => {
      await pb.collection('users').authWithOAuth2({ provider: 'google' })
    },
    logout: (): void => pb.authStore.clear(),
  }
}

// ---------------------------------------------------------------- Bibliothèque

export type QcmSort = 'recent' | 'rating' | 'title'

export interface QcmQuery {
  search?: string
  subject?: Subject | ''
  level?: Level | ''
  sort?: QcmSort
  page?: number
  /** Identifiant d'un membre : uniquement ses QCM, quel que soit leur statut (« Mes QCM »). */
  owner?: string
}

const SORTS: Record<QcmSort, string> = {
  recent: '-created',
  rating: '-rating_avg,-rating_count,-created',
  title: 'title',
}

export const PAGE_SIZE = 24

export function listQcms(query: QcmQuery = {}) {
  const parts = [query.owner ? pb.filter('owner = {:owner}', { owner: query.owner }) : 'status = "published"']
  const search = query.search?.trim()
  if (search) parts.push(pb.filter('(title ~ {:q} || chapter ~ {:q} || description ~ {:q})', { q: search }))
  if (query.subject) parts.push(pb.filter('subject = {:subject}', { subject: query.subject }))
  if (query.level) parts.push(pb.filter('level = {:level}', { level: query.level }))
  return pb.collection('qcms').getList<QcmRecord>(query.page ?? 1, PAGE_SIZE, {
    filter: parts.join(' && '),
    sort: SORTS[query.sort ?? 'recent'],
    expand: 'owner',
  })
}

export function listMyQcms(userId: string) {
  return pb.collection('qcms').getFullList<QcmRecord>({
    filter: pb.filter('owner = {:owner}', { owner: userId }),
    sort: '-created',
  })
}

export function getQcm(id: string) {
  return pb.collection('qcms').getOne<QcmRecord>(id, { expand: 'owner' })
}

// ---------------------------------------------------------------- Modération

export type QcmStatus = QcmRecord['status']

export const MODERATION_PAGE_SIZE = 30

/**
 * File de modération, réservée aux administrateurs (le serveur filtre déjà).
 * Les QCM à valider sortent du plus ancien au plus récent ; les autres, du plus récemment modifié.
 */
export function listQcmsByStatus(status: QcmStatus, page = 1) {
  return pb.collection('qcms').getList<QcmRecord>(page, MODERATION_PAGE_SIZE, {
    filter: pb.filter('status = {:status}', { status }),
    sort: status === 'pending' ? 'created' : '-updated',
    expand: 'owner',
  })
}

export async function countQcmsByStatus(status: QcmStatus): Promise<number> {
  const result = await pb.collection('qcms').getList(1, 1, { filter: pb.filter('status = {:status}', { status }), fields: 'id' })
  return result.totalItems
}

/** Réservé aux administrateurs : le serveur refuse l'appel pour tout autre compte. */
export function setQcmStatus(id: string, status: QcmStatus) {
  return pb.collection('qcms').update<QcmRecord>(id, { status }, { expand: 'owner' })
}

export function deleteQcm(id: string) {
  return pb.collection('qcms').delete(id)
}

/** URL de téléchargement direct du fichier `.qcm`. */
export function qcmDownloadUrl(record: QcmRecord): string {
  return pb.files.getURL(record, record.file, { download: true })
}

/**
 * Télécharge le `.qcm` sous un nom lisible (« les-fractions.qcm »). PocketBase y ajoute un suffixe
 * aléatoire au stockage ; passer par un blob évite qu'il apparaisse dans le fichier de l'élève.
 */
export async function downloadQcm(record: QcmRecord): Promise<void> {
  try {
    const response = await fetch(pb.files.getURL(record, record.file))
    if (!response.ok) throw new Error(String(response.status))
    saveQcmLocally(new Uint8Array(await response.arrayBuffer()), record.title)
  } catch {
    // Repli : téléchargement direct (le nom contient alors le suffixe du serveur).
    window.location.href = qcmDownloadUrl(record)
  }
}

export function qcmThumbnailUrl(record: QcmRecord): string | undefined {
  return record.thumbnail ? pb.files.getURL(record, record.thumbnail, { thumb: '480x270' }) : undefined
}

/** Télécharge et valide l'archive pour la jouer dans le navigateur. */
export async function fetchQcmArchive(record: QcmRecord): Promise<QcmArchive> {
  const response = await fetch(pb.files.getURL(record, record.file))
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status})`)
  return readQcmArchive(new Uint8Array(await response.arrayBuffer()))
}

// ---------------------------------------------------------------- Publication

export interface PublishInput {
  data: QcmData
  /** Octets du fichier `.qcm` produits par `writeQcmArchive`. */
  bytes: Uint8Array
  /** Miniature WebP facultative (première image du QCM). */
  thumbnail?: Uint8Array
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function qcmForm(input: PublishInput): FormData {
  const summary = summarizeQcm(input.data)
  const meta = input.data.meta
  const form = new FormData()
  form.set('title', meta.title)
  form.set('description', meta.description ?? '')
  form.set('subject', meta.subject)
  form.set('level', meta.level)
  form.set('chapter', meta.chapter)
  form.set('language', meta.language)
  form.set('question_count', String(summary.questionCount))
  form.set('has_images', String(summary.hasImages))
  form.set('file', new File([toBlobPart(input.bytes)], qcmFileName(meta.title), { type: QCM_MIME }))
  if (input.thumbnail) {
    form.set('thumbnail', new File([toBlobPart(input.thumbnail)], 'miniature.webp', { type: 'image/webp' }))
  }
  return form
}

export function publishQcm(input: PublishInput): Promise<QcmRecord> {
  const userId = pb.authStore.record?.id
  if (!userId) throw new Error('Connexion requise pour publier.')
  const form = qcmForm(input)
  form.set('owner', userId)
  return pb.collection('qcms').create<QcmRecord>(form)
}

/**
 * Remplace le contenu d'un QCM de l'utilisateur connecté. Le serveur le repasse « à valider »
 * (sauf pour un administrateur) : il redevient public après relecture.
 */
export function updateQcm(id: string, input: PublishInput): Promise<QcmRecord> {
  if (!pb.authStore.record?.id) throw new Error('Connexion requise pour modifier.')
  const form = qcmForm(input)
  // Plus d'image dans le QCM : l'ancienne miniature est retirée.
  if (!input.thumbnail) form.set('thumbnail', '')
  return pb.collection('qcms').update<QcmRecord>(id, form)
}

/** Déclenche l'enregistrement local d'un fichier `.qcm` (export sans compte). */
export function saveQcmLocally(bytes: Uint8Array, title: string): void {
  const url = URL.createObjectURL(new Blob([toBlobPart(bytes)], { type: QCM_MIME }))
  const link = document.createElement('a')
  link.href = url
  link.download = qcmFileName(title)
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------- Notes et commentaires

export async function getMyRating(qcmId: string): Promise<RatingRecord | null> {
  const userId = pb.authStore.record?.id
  if (!userId) return null
  const list = await pb.collection('ratings').getList<RatingRecord>(1, 1, {
    filter: pb.filter('qcm = {:qcm} && user = {:user}', { qcm: qcmId, user: userId }),
  })
  return list.items[0] ?? null
}

/** Crée ou remplace la note (1 à 5) de l'utilisateur connecté. */
export async function rateQcm(qcmId: string, value: number): Promise<RatingRecord> {
  const userId = pb.authStore.record?.id
  if (!userId) throw new Error('Connexion requise pour noter.')
  const existing = await getMyRating(qcmId)
  if (existing) return pb.collection('ratings').update<RatingRecord>(existing.id, { value })
  return pb.collection('ratings').create<RatingRecord>({ qcm: qcmId, user: userId, value })
}

/** Retire la note de l'utilisateur connecté (la moyenne du QCM est recalculée par le serveur). */
export async function removeRating(qcmId: string): Promise<void> {
  const existing = await getMyRating(qcmId)
  if (existing) await pb.collection('ratings').delete(existing.id)
}

export const COMMENTS_PAGE_SIZE = 20

export function listComments(qcmId: string, page = 1) {
  return pb.collection('comments').getList<CommentRecord>(page, COMMENTS_PAGE_SIZE, {
    filter: pb.filter('qcm = {:qcm}', { qcm: qcmId }),
    sort: '-created',
    expand: 'user',
  })
}

export function addComment(qcmId: string, text: string) {
  const userId = pb.authStore.record?.id
  if (!userId) throw new Error('Connexion requise pour commenter.')
  return pb.collection('comments').create<CommentRecord>({ qcm: qcmId, user: userId, text: text.trim() }, { expand: 'user' })
}

/** Remplace le texte d'un commentaire de l'utilisateur connecté. */
export function updateComment(id: string, text: string) {
  return pb.collection('comments').update<CommentRecord>(id, { text: text.trim() }, { expand: 'user' })
}

export function deleteComment(id: string) {
  return pb.collection('comments').delete(id)
}
