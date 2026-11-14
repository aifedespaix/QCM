import type { Subject } from '@qcm/core'

/** Couleur pastel associée à chaque matière (vignettes et tuiles). */
export const SUBJECT_TONES: Record<Subject, string> = {
  maths: 'bg-badge-a',
  'physique-chimie': 'bg-badge-a',
  technologie: 'bg-badge-a',
  francais: 'bg-badge-b',
  'histoire-geo': 'bg-badge-b',
  emc: 'bg-badge-b',
  svt: 'bg-badge-c',
  anglais: 'bg-badge-d',
  espagnol: 'bg-badge-d',
  allemand: 'bg-badge-d',
  arts: 'bg-badge-c',
  musique: 'bg-badge-d',
  autre: 'bg-sunken',
}

export function questionCountLabel(count: number): string {
  return count === 1 ? '1 question' : `${count} questions`
}
