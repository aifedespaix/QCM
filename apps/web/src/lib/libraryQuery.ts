import { LEVELS, LEVEL_LABELS, SUBJECTS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'

/**
 * État de la bibliothèque dans l'adresse (`/bibliotheque/?matiere=maths&niveau=3e&page=2`).
 * Lu par le serveur pour rendre la bonne page, et tenu à jour par le navigateur : une recherche
 * se partage, se met en favori et se recharge à l'identique.
 */

export type QcmSort = 'recent' | 'popular' | 'rating' | 'comments' | 'questions' | 'title'

export interface LibraryState {
  search: string
  subject: Subject | ''
  level: Level | ''
  /** Titre exact d'un chapitre (vide : tous les chapitres). */
  chapter: string
  sort: QcmSort
  page: number
  /** « Mes QCM » : réservé au navigateur (le compte n'est connu que là). */
  mine: boolean
}

const SORT_VALUES: readonly QcmSort[] = ['recent', 'popular', 'rating', 'comments', 'questions', 'title']

export const SORT_LABELS: Record<QcmSort, string> = {
  recent: 'Les plus récents',
  popular: 'Les plus populaires',
  rating: 'Les mieux notés',
  comments: 'Les plus commentés',
  questions: 'Les plus complets',
  title: 'Titre (A à Z)',
}

/** Tris côté PocketBase (même table pour le serveur et le navigateur). `popular` : les plus notés, puis les plus commentés. */
export const SORT_EXPRESSIONS: Record<QcmSort, string> = {
  recent: '-created',
  popular: '-rating_count,-comment_count,-rating_avg,-created',
  rating: '-rating_avg,-rating_count,-created',
  comments: '-comment_count,-created',
  questions: '-question_count,-created',
  title: 'title',
}

export function defaultLibraryState(): LibraryState {
  return { search: '', subject: '', level: '', chapter: '', sort: 'recent', page: 1, mine: false }
}

export function parseLibraryParams(params: URLSearchParams): LibraryState {
  const subject = params.get('matiere') ?? ''
  const level = params.get('niveau') ?? ''
  const sort = params.get('tri') ?? ''
  const page = Number.parseInt(params.get('page') ?? '', 10)
  return {
    search: (params.get('q') ?? '').trim().slice(0, 100),
    subject: (SUBJECTS as readonly string[]).includes(subject) ? (subject as Subject) : '',
    level: (LEVELS as readonly string[]).includes(level) ? (level as Level) : '',
    chapter: (params.get('chapitre') ?? '').trim().slice(0, 80),
    sort: (SORT_VALUES as readonly string[]).includes(sort) ? (sort as QcmSort) : 'recent',
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
    mine: params.has('mes'),
  }
}

/** Paramètres d'adresse ; les valeurs par défaut sont omises (adresse la plus courte). */
export function libraryParams(state: Partial<LibraryState>): URLSearchParams {
  const params = new URLSearchParams()
  if (state.search?.trim()) params.set('q', state.search.trim())
  if (state.subject) params.set('matiere', state.subject)
  if (state.level) params.set('niveau', state.level)
  if (state.chapter?.trim()) params.set('chapitre', state.chapter.trim())
  if (state.sort && state.sort !== 'recent') params.set('tri', state.sort)
  if (state.page && state.page > 1) params.set('page', String(state.page))
  if (state.mine) params.set('mes', '1')
  return params
}

export function libraryHref(state: Partial<LibraryState>): string {
  const query = libraryParams(state).toString()
  return `/bibliotheque/${query ? `?${query}` : ''}`
}

/** « de mathématiques, niveau 3e » (les sigles comme SVT restent en capitales). */
export function libraryScope(subject: Subject | '', level: Level | ''): string {
  const label = subject ? SUBJECT_LABELS[subject] : ''
  const name = label && label !== label.toUpperCase() ? label.toLocaleLowerCase('fr') : label
  return [name && `de ${name}`, level && `niveau ${LEVEL_LABELS[level]}`].filter(Boolean).join(', ')
}

/** Titre principal de la bibliothèque, selon la matière et le niveau choisis. */
export function libraryHeading(subject: Subject | '', level: Level | ''): string {
  const scope = libraryScope(subject, level)
  return scope ? `QCM ${scope}` : 'Bibliothèque'
}

// ---------------------------------------------------------------- Assistant de recherche

export interface FacetRow {
  subject: Subject
  level: Level
  chapter: string
}
export interface ChapterFacet {
  name: string
  count: number
}
export interface SubjectFacet {
  subject: Subject
  /** Nombre de QCM de la matière (pour le niveau choisi). */
  count: number
  chapters: ChapterFacet[]
}

/**
 * Matières avec leur nombre de QCM et leurs chapitres, pour le niveau choisi (tous si vide).
 * Les matières qui ont des QCM viennent d'abord, la plus fournie en tête ; les vides terminent la liste.
 */
export function buildFacets(rows: readonly FacetRow[], level: Level | '' = ''): SubjectFacet[] {
  const bySubject = new Map<Subject, Map<string, number>>()
  for (const row of rows) {
    if (level && row.level !== level) continue
    const chapters = bySubject.get(row.subject) ?? new Map<string, number>()
    const name = row.chapter.trim()
    chapters.set(name, (chapters.get(name) ?? 0) + 1)
    bySubject.set(row.subject, chapters)
  }
  const facets = SUBJECTS.map((subject): SubjectFacet => {
    const chapters = [...(bySubject.get(subject) ?? [])]
      .filter(([name]) => name)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'))
    const count = [...(bySubject.get(subject)?.values() ?? [])].reduce((sum, n) => sum + n, 0)
    return { subject, count, chapters }
  })
  // Tri stable : les matières garnies d'abord (la plus fournie en tête), les vides dans l'ordre habituel.
  const filled = facets.filter((facet) => facet.count > 0).sort((a, b) => b.count - a.count)
  return [...filled, ...facets.filter((facet) => facet.count === 0)]
}

/**
 * Demander le chapitre n'a d'intérêt que s'il aide à trancher : au moins deux chapitres, dont un
 * regroupe plusieurs QCM. Avec un seul chapitre, ou un QCM par chapitre, on affiche directement les QCM.
 */
export function needsChapterStep(facet: SubjectFacet): boolean {
  return facet.chapters.length > 1 && facet.chapters.some((chapter) => chapter.count > 1)
}
