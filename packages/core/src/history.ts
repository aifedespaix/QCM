import type { Level, QcmData, Subject } from './schema.ts'

/**
 * Suivi des révisions : QCM déjà ouverts et résultats de chaque passage.
 * Fonctions pures (aucun accès au stockage) : le desktop et le site les partagent.
 * Le suivi est destiné aux parents ; le lecteur, lui, n'affiche jamais de score.
 */

/** Résultat d'une question pendant un passage. */
export interface QuestionResult {
  /** Identifiant de la question dans le QCM (`q1`, `q2`…). */
  id: string
  /** Nombre de réponses fausses validées avant la fin de la question. */
  wrong: number
  /** `true` si l'élève a demandé « Voir la réponse ». */
  revealed: boolean
}

/** Ce que le lecteur transmet à la fin (ou à l'abandon) d'un passage. */
export interface QcmSessionResult {
  questions: QuestionResult[]
  /** Nombre de questions du QCM. */
  total: number
  /** `false` si le QCM a été quitté avant la dernière question. */
  completed: boolean
}

/** Un QCM connu de cet appareil. */
export interface QcmHistoryEntry {
  /** Empreinte du contenu (`qcmFingerprint`) : stable même si le fichier est déplacé ou renommé. */
  key: string
  title: string
  subject: Subject
  level: Level
  chapter: string
  questionCount: number
  /** Énoncé de chaque question, pour dire aux parents quoi retravailler. */
  prompts: Record<string, string>
  /** Identifiant dans la bibliothèque en ligne, si le QCM en vient. */
  recordId?: string
  /** Nom du fichier d'origine (information seulement). */
  fileName?: string
  /** Dernière ouverture (millisecondes). */
  openedAt: number
}

export interface QcmAttempt extends QcmSessionResult {
  id: string
  key: string
  /** Fin du passage (millisecondes). */
  at: number
}

export interface QcmHistory {
  version: 1
  entries: QcmHistoryEntry[]
  attempts: QcmAttempt[]
}

export const HISTORY_LIMITS = { maxAttempts: 1000, maxEntries: 300 } as const

export type QuestionOutcome = 'first' | 'retry' | 'revealed'

/** `acquired` ≥ 80 % du premier coup, `progress` ≥ 50 %, `review` en dessous, `started` : jamais terminé. */
export type QcmStatus = 'acquired' | 'progress' | 'review' | 'started'

export const STATUS_THRESHOLDS = { acquired: 0.8, progress: 0.5 } as const

// ---------------------------------------------------------------- Empreinte

function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/**
 * Empreinte du contenu d'un QCM : 22 caractères `a-z 0-9`.
 * Deux fichiers au même contenu ont la même empreinte, où qu'ils soient rangés.
 */
export function qcmFingerprint(data: QcmData): string {
  const { title, subject, level, chapter } = data.meta
  const text = JSON.stringify([
    title,
    subject,
    level,
    chapter,
    data.questions.map((question) => [
      question.id,
      question.prompt,
      question.image ?? '',
      question.choices.map((choice) => [choice.text, choice.correct === true]),
      question.hint ?? '',
      question.explanation,
    ]),
  ])
  return [0, 1].map((seed) => cyrb53(text, seed).toString(36).padStart(11, '0')).join('')
}

// ---------------------------------------------------------------- Historique

export function emptyHistory(): QcmHistory {
  return { version: 1, entries: [], attempts: [] }
}

/** Relit un historique enregistré. Tout contenu illisible donne un historique vide. */
export function parseHistory(text: string | null | undefined): QcmHistory {
  if (!text) return emptyHistory()
  try {
    const raw = JSON.parse(text) as Partial<QcmHistory> | null
    if (!raw || raw.version !== 1 || !Array.isArray(raw.entries) || !Array.isArray(raw.attempts)) return emptyHistory()
    return {
      version: 1,
      entries: raw.entries.filter((entry) => typeof entry?.key === 'string' && typeof entry.title === 'string'),
      attempts: raw.attempts.filter((attempt) => typeof attempt?.key === 'string' && Array.isArray(attempt.questions)),
    }
  } catch {
    return emptyHistory()
  }
}

export function entryFromQcm(
  data: QcmData,
  extra: { recordId?: string; fileName?: string } = {},
  now = Date.now(),
): QcmHistoryEntry {
  const { title, subject, level, chapter } = data.meta
  return {
    key: qcmFingerprint(data),
    title,
    subject,
    level,
    chapter,
    questionCount: data.questions.length,
    prompts: Object.fromEntries(data.questions.map((question) => [question.id, question.prompt])),
    ...(extra.recordId ? { recordId: extra.recordId } : {}),
    ...(extra.fileName ? { fileName: extra.fileName } : {}),
    openedAt: now,
  }
}

/** Ajoute ou met à jour un QCM, en tête de liste (le plus récent d'abord). */
export function upsertEntry(history: QcmHistory, entry: QcmHistoryEntry): QcmHistory {
  const previous = history.entries.find((item) => item.key === entry.key)
  const merged: QcmHistoryEntry = {
    ...entry,
    ...(entry.recordId || !previous?.recordId ? {} : { recordId: previous.recordId }),
    ...(entry.fileName || !previous?.fileName ? {} : { fileName: previous.fileName }),
  }
  const entries = [merged, ...history.entries.filter((item) => item.key !== entry.key)].slice(0, HISTORY_LIMITS.maxEntries)
  const known = new Set(entries.map((item) => item.key))
  return { ...history, entries, attempts: history.attempts.filter((attempt) => known.has(attempt.key)) }
}

export function addAttempt(history: QcmHistory, key: string, result: QcmSessionResult, now = Date.now()): QcmHistory {
  if (result.questions.length === 0 || !history.entries.some((entry) => entry.key === key)) return history
  const attempt: QcmAttempt = {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    at: now,
    total: result.total,
    completed: result.completed,
    questions: result.questions.map(({ id, wrong, revealed }) => ({ id, wrong, revealed })),
  }
  return { ...history, attempts: [...history.attempts, attempt].slice(-HISTORY_LIMITS.maxAttempts) }
}

/** Oublie un QCM et tous ses passages. */
export function removeEntry(history: QcmHistory, key: string): QcmHistory {
  return {
    ...history,
    entries: history.entries.filter((entry) => entry.key !== key),
    attempts: history.attempts.filter((attempt) => attempt.key !== key),
  }
}

/** QCM du plus récemment ouvert au plus ancien. */
export function recentEntries(history: QcmHistory): QcmHistoryEntry[] {
  return [...history.entries].sort((a, b) => b.openedAt - a.openedAt)
}

// ---------------------------------------------------------------- Statistiques

export function outcomeOf(question: QuestionResult): QuestionOutcome {
  if (question.revealed) return 'revealed'
  return question.wrong > 0 ? 'retry' : 'first'
}

export interface OutcomeCounts {
  first: number
  retry: number
  revealed: number
  /** Questions vues. */
  seen: number
}

export function countOutcomes(questions: readonly QuestionResult[]): OutcomeCounts {
  const counts: OutcomeCounts = { first: 0, retry: 0, revealed: 0, seen: questions.length }
  for (const question of questions) counts[outcomeOf(question)] += 1
  return counts
}

/** Part des questions réussies du premier coup (0 à 1), ou `null` si aucune question n'a été vue. */
export function firstTryRate(counts: OutcomeCounts): number | null {
  return counts.seen > 0 ? counts.first / counts.seen : null
}

export function statusOfRate(rate: number): Exclude<QcmStatus, 'started'> {
  if (rate >= STATUS_THRESHOLDS.acquired) return 'acquired'
  return rate >= STATUS_THRESHOLDS.progress ? 'progress' : 'review'
}

export interface WeakQuestion {
  id: string
  prompt: string
  /** Résultat au dernier passage. */
  outcome: Exclude<QuestionOutcome, 'first'>
  /** Nombre de passages (sur la période) où cette question n'a pas été réussie du premier coup. */
  misses: number
}

export interface QcmStat {
  entry: QcmHistoryEntry
  /** Passages de la période, du plus ancien au plus récent. */
  attempts: QcmAttempt[]
  /** Dernier passage terminé, sinon dernier passage. */
  reference: QcmAttempt
  counts: OutcomeCounts
  /** Taux « du premier coup » du passage de référence. */
  rate: number
  /** Taux de chaque passage terminé, dans l'ordre : montre la progression. */
  trend: number[]
  status: QcmStatus
  weak: WeakQuestion[]
}

export interface SubjectStat {
  subject: Subject
  counts: OutcomeCounts
  rate: number
  qcmCount: number
}

export interface DayStat {
  /** Début du jour (heure locale, millisecondes). */
  day: number
  sessions: number
  questions: number
}

export interface HistoryStats {
  sessions: number
  completedSessions: number
  counts: OutcomeCounts
  rate: number | null
  /** Les 7 derniers jours, du plus ancien à aujourd'hui. */
  week: DayStat[]
  activeDays: number
  /** QCM de la période, du plus fragile au plus solide. */
  qcms: QcmStat[]
  subjects: SubjectStat[]
  /** Passages de la période, du plus récent au plus ancien. */
  timeline: { attempt: QcmAttempt; entry: QcmHistoryEntry; counts: OutcomeCounts }[]
}

function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const STATUS_ORDER: Record<QcmStatus, number> = { review: 0, progress: 1, started: 2, acquired: 3 }

/** Agrège l'historique pour le tableau de suivi. `since` : début de la période (millisecondes), absent = tout. */
export function computeStats(history: QcmHistory, options: { since?: number; now?: number } = {}): HistoryStats {
  const now = options.now ?? Date.now()
  const since = options.since ?? 0
  const entries = new Map(history.entries.map((entry) => [entry.key, entry]))
  const attempts = history.attempts
    .filter((attempt) => attempt.at >= since && entries.has(attempt.key) && attempt.questions.length > 0)
    .sort((a, b) => a.at - b.at)

  const byKey = new Map<string, QcmAttempt[]>()
  for (const attempt of attempts) byKey.set(attempt.key, [...(byKey.get(attempt.key) ?? []), attempt])

  const qcms: QcmStat[] = []
  for (const [key, list] of byKey) {
    const entry = entries.get(key)!
    const completed = list.filter((attempt) => attempt.completed)
    const reference = completed.at(-1) ?? list.at(-1)!
    const counts = countOutcomes(reference.questions)
    const rate = firstTryRate(counts) ?? 0
    const misses = new Map<string, number>()
    for (const attempt of list) {
      for (const question of attempt.questions) {
        if (outcomeOf(question) !== 'first') misses.set(question.id, (misses.get(question.id) ?? 0) + 1)
      }
    }
    const weak: WeakQuestion[] = reference.questions.flatMap((question) => {
      const outcome = outcomeOf(question)
      if (outcome === 'first') return []
      return [{ id: question.id, prompt: entry.prompts[question.id] ?? question.id, outcome, misses: misses.get(question.id) ?? 1 }]
    })
    qcms.push({
      entry,
      attempts: list,
      reference,
      counts,
      rate,
      trend: completed.map((attempt) => firstTryRate(countOutcomes(attempt.questions)) ?? 0),
      status: completed.length > 0 ? statusOfRate(rate) : 'started',
      weak,
    })
  }
  qcms.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.rate - b.rate || b.reference.at - a.reference.at)

  const bySubject = new Map<Subject, { questions: QuestionResult[]; keys: Set<string> }>()
  for (const attempt of attempts) {
    const subject = entries.get(attempt.key)!.subject
    const bucket = bySubject.get(subject) ?? { questions: [], keys: new Set<string>() }
    bucket.questions.push(...attempt.questions)
    bucket.keys.add(attempt.key)
    bySubject.set(subject, bucket)
  }
  const subjects: SubjectStat[] = [...bySubject].map(([subject, bucket]) => {
    const counts = countOutcomes(bucket.questions)
    return { subject, counts, rate: firstTryRate(counts) ?? 0, qcmCount: bucket.keys.size }
  })
  subjects.sort((a, b) => a.rate - b.rate)

  const today = startOfDay(now)
  const week: DayStat[] = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(date.getDate() - offset)
    week.push({ day: date.getTime(), sessions: 0, questions: 0 })
  }
  // La semaine se lit sur tout l'historique : elle ne dépend pas de la période choisie.
  for (const attempt of history.attempts) {
    const slot = week.find((item) => item.day === startOfDay(attempt.at))
    if (slot && entries.has(attempt.key)) {
      slot.sessions += 1
      slot.questions += attempt.questions.length
    }
  }

  const counts = countOutcomes(attempts.flatMap((attempt) => attempt.questions))
  return {
    sessions: attempts.length,
    completedSessions: attempts.filter((attempt) => attempt.completed).length,
    counts,
    rate: firstTryRate(counts),
    week,
    activeDays: week.filter((item) => item.sessions > 0).length,
    qcms,
    subjects,
    timeline: [...attempts]
      .reverse()
      .map((attempt) => ({ attempt, entry: entries.get(attempt.key)!, counts: countOutcomes(attempt.questions) })),
  }
}

/** « aujourd'hui », « hier », « il y a 3 jours », puis la date. */
export function formatRelativeDay(time: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(time)) / 86_400_000)
  if (days <= 0) return 'aujourd\'hui'
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} jours`
  return `le ${new Date(time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}
