import { LEVELS, LEVEL_LABELS, SUBJECTS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'

/**
 * État de la bibliothèque dans l'adresse (`/bibliotheque/?matiere=maths&niveau=3e&page=2`).
 * Lu par le serveur pour rendre la bonne page, et tenu à jour par le navigateur : une recherche
 * se partage, se met en favori et se recharge à l'identique.
 */

export type QcmSort = 'recent' | 'rating' | 'comments' | 'title'

export interface LibraryState {
  search: string
  subject: Subject | ''
  level: Level | ''
  sort: QcmSort
  page: number
  /** « Mes QCM » : réservé au navigateur (le compte n'est connu que là). */
  mine: boolean
}

const SORT_VALUES: readonly QcmSort[] = ['recent', 'rating', 'comments', 'title']

export function defaultLibraryState(): LibraryState {
  return { search: '', subject: '', level: '', sort: 'recent', page: 1, mine: false }
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
