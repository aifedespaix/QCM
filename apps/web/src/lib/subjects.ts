export { SUBJECT_TONES } from '@qcm/ui'

export function questionCountLabel(count: number): string {
  return count === 1 ? '1 question' : `${count} questions`
}

const DAY_MS = 86_400_000

/** Date PocketBase (« 2026-03-12 08:15:00.000Z ») en millisecondes ; NaN si illisible. */
export function recordTime(value: string): number {
  return Date.parse(value.replace(' ', 'T'))
}

/** QCM publié il y a moins d'une semaine : marqué « Nouveau » dans la bibliothèque. */
export function isRecent(value: string, now = Date.now()): boolean {
  const time = recordTime(value)
  return now - time < 7 * DAY_MS && now >= time
}

/** Date courte d'une carte : « aujourd'hui », « hier », « il y a 3 j », « 12 mars », « 12 mars 2025 ». */
export function shortDate(value: string, now = Date.now()): string {
  const time = recordTime(value)
  if (Number.isNaN(time)) return ''
  const day = (t: number) => {
    const d = new Date(t)
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  }
  const days = Math.round((day(now) - day(time)) / DAY_MS)
  if (days <= 0) return 'aujourd\'hui'
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} j`
  const date = new Date(time)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** Date complète pour l'infobulle et les lecteurs d'écran : « 12 mars 2026 ». */
export function longDate(value: string): string {
  const time = recordTime(value)
  return Number.isNaN(time) ? '' : new Date(time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
