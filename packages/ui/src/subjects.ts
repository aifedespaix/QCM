import type { Subject } from '@qcm/core'

/**
 * Teinte (angle OKLCH) de chaque matière : treize couleurs distinctes, réparties sur le cercle
 * chromatique. Les nuances claires et foncées en sont dérivées dans `theme.css` (`.qcm-hue-*`),
 * pour le thème clair comme pour le sombre.
 */
export const SUBJECT_HUES: Record<Subject, string> = {
  maths: 'qcm-hue-maths',
  'physique-chimie': 'qcm-hue-physique-chimie',
  technologie: 'qcm-hue-technologie',
  francais: 'qcm-hue-francais',
  'histoire-geo': 'qcm-hue-histoire-geo',
  emc: 'qcm-hue-emc',
  svt: 'qcm-hue-svt',
  anglais: 'qcm-hue-anglais',
  espagnol: 'qcm-hue-espagnol',
  allemand: 'qcm-hue-allemand',
  arts: 'qcm-hue-arts',
  musique: 'qcm-hue-musique',
  autre: 'qcm-hue-autre',
}

/** Fond pastel de la matière (pastilles, tuiles, bandeaux) : teinte + fond clair. */
export const SUBJECT_TONES: Record<Subject, string> = Object.fromEntries(
  Object.entries(SUBJECT_HUES).map(([subject, hue]) => [subject, `${hue} qcm-subject-tint`]),
) as Record<Subject, string>

/**
 * Pictogramme de chaque matière (tracés 24 px, même trait que les icônes du site),
 * ou deux lettres pour les langues vivantes.
 */
export const SUBJECT_MARKS: Record<Subject, { path: string } | { text: string }> = {
  maths: { path: 'M7 4.5v6M4 7.5h6M14 7.5h6M4.8 14.8l4.4 4.4M9.2 14.8l-4.4 4.4M14 17h6M17 14.2h.01M17 19.8h.01' },
  'physique-chimie': { path: 'M9 3.5h6M10 3.5v5.8L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-8.7V3.5M7.3 15h9.4' },
  technologie: { path: 'M7.5 7.5h9v9h-9zM10 3.5v4M14 3.5v4M10 16.5v4M14 16.5v4M3.5 10h4M3.5 14h4M16.5 10h4M16.5 14h4' },
  francais: { path: 'M12 6.5C9.5 5 6.5 4.8 3.5 5.5v13c3-.7 6-.5 8.5 1 2.5-1.5 5.5-1.7 8.5-1v-13c-3-.7-6-.5-8.5 1zM12 6.5v13' },
  'histoire-geo': { path: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.8 2.5 2.8 14.5 0 17M12 3.5c-2.8 2.5-2.8 14.5 0 17' },
  emc: { path: 'M12 4v16M8 20h8M5 7.5h14M5 7.5l-2.5 5.5a2.5 2.5 0 0 0 5 0zM19 7.5l-2.5 5.5a2.5 2.5 0 0 0 5 0z' },
  svt: { path: 'M5 19c0-8.5 5.5-14 14.5-14 0 9-5.5 14.5-14.5 14zM5 19l7.5-7.5' },
  anglais: { text: 'EN' },
  espagnol: { text: 'ES' },
  allemand: { text: 'DE' },
  arts: { path: 'M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 2-2s-1-1.4-1-2.4 1-1.6 2-1.6h1.9a3.6 3.6 0 0 0 3.6-3.6c0-4.2-3.8-7.4-8.5-7.4zM7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01' },
  musique: { path: 'M9 17.5V5.5l10-2v12M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z' },
  autre: { path: 'M12 4v4.5M12 15.5V20M4 12h4.5M15.5 12H20M7 7l1.8 1.8M15.2 15.2L17 17M17 7l-1.8 1.8M8.8 15.2L7 17' },
}
