/**
 * Adresses publiques des fiches de QCM : `/qcm/<titre-en-minuscules>-<id>/`.
 *
 * Le titre rend l'adresse lisible (et utile au référencement) ; seul l'identifiant PocketBase,
 * en fin d'adresse, sert à retrouver le QCM. Un titre modifié ne casse donc aucun lien : l'ancienne
 * adresse redirige vers la nouvelle.
 */

/** Identifiant d'enregistrement PocketBase : 15 caractères [a-z0-9]. */
const RECORD_ID = /^[a-z0-9]{15}$/

export function slugify(text: string, max = 70): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}

/** Segment d'adresse d'une fiche : `les-fractions-abc123def456ghi`. */
export function qcmSlug(record: { id: string; title?: string }): string {
  const slug = slugify(record.title ?? '')
  return slug ? `${slug}-${record.id}` : record.id
}

/** Chemin de la fiche, avec la barre finale (forme canonique). `play` lance le lecteur à l'ouverture. */
export function qcmPath(record: { id: string; title?: string }, options: { play?: boolean } = {}): string {
  return `/qcm/${qcmSlug(record)}/${options.play ? '?jouer=1' : ''}`
}

/** Retrouve l'identifiant à partir du segment d'adresse (`titre-id` ou `id` seul). */
export function parseQcmSlug(segment: string | undefined): string | null {
  if (!segment) return null
  const id = segment.slice(-15)
  if (!RECORD_ID.test(id)) return null
  if (segment.length > 15 && segment[segment.length - 16] !== '-') return null
  return id
}

export function isRecordId(value: string | null | undefined): value is string {
  return !!value && RECORD_ID.test(value)
}
