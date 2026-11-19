import { z } from 'zod'

/** Version du format `data.yaml`. Toute évolution incompatible incrémente ce nombre. */
export const QCM_FORMAT_VERSION = 1 as const

export const SUBJECTS = [
  'maths',
  'francais',
  'histoire-geo',
  'svt',
  'physique-chimie',
  'technologie',
  'anglais',
  'espagnol',
  'allemand',
  'emc',
  'arts',
  'musique',
  'autre',
] as const

export const LEVELS = ['primaire', '6e', '5e', '4e', '3e', 'lycee', 'autre'] as const

export type Subject = (typeof SUBJECTS)[number]
export type Level = (typeof LEVELS)[number]

export const SUBJECT_LABELS: Record<Subject, string> = {
  maths: 'Mathématiques',
  francais: 'Français',
  'histoire-geo': 'Histoire-Géographie',
  svt: 'SVT',
  'physique-chimie': 'Physique-Chimie',
  technologie: 'Technologie',
  anglais: 'Anglais',
  espagnol: 'Espagnol',
  allemand: 'Allemand',
  emc: 'EMC',
  arts: 'Arts plastiques',
  musique: 'Musique',
  autre: 'Autre',
}

export const LEVEL_LABELS: Record<Level, string> = {
  primaire: 'Primaire',
  '6e': '6e',
  '5e': '5e',
  '4e': '4e',
  '3e': '3e',
  lycee: 'Lycée',
  autre: 'Autre',
}

/** Limites du format. Partagées par l'éditeur, le lecteur et le skill IA. */
export const LIMITS = {
  title: 80,
  chapter: 80,
  author: 60,
  description: 300,
  prompt: 300,
  choiceText: 120,
  hint: 200,
  explanation: 500,
  minChoices: 2,
  maxChoices: 4,
  minQuestions: 1,
  maxQuestions: 60,
} as const

/** Chemin d'image autorisé : `media/<nom>.webp`, minuscules, chiffres, `_` et `-`. */
export const MEDIA_PATH_REGEX = /^media\/[a-z0-9][a-z0-9_-]{0,63}\.webp$/
export const QUESTION_ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,31}$/

/**
 * Texte court : YAML peut lire `text: 12` comme un nombre, on le reconvertit en chaîne
 * pour que les auteurs (humains ou IA) n'aient pas à penser aux guillemets.
 */
const text = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'number' ? String(value) : value),
    z.string().trim().min(1, 'Ce texte est vide.').max(max, `Ce texte dépasse ${max} caractères.`),
  )

export const MediaPathSchema = z
  .string()
  .regex(MEDIA_PATH_REGEX, 'Chemin d\'image invalide. Format attendu : media/nom_en_minuscules.webp')

export const ChoiceSchema = z.strictObject({
  text: text(LIMITS.choiceText),
  correct: z.boolean().default(false),
})

export const QuestionSchema = z
  .strictObject({
    id: z.string().regex(QUESTION_ID_REGEX, 'Identifiant invalide. Exemple valide : q1'),
    prompt: text(LIMITS.prompt),
    image: MediaPathSchema.optional(),
    choices: z
      .array(ChoiceSchema)
      .min(LIMITS.minChoices, `Il faut au moins ${LIMITS.minChoices} réponses.`)
      .max(LIMITS.maxChoices, `Il faut au plus ${LIMITS.maxChoices} réponses.`),
    hint: text(LIMITS.hint).optional(),
    explanation: text(LIMITS.explanation),
  })
  .superRefine((question, ctx) => {
    const correctCount = question.choices.filter((choice) => choice.correct).length
    // Une ou plusieurs bonnes réponses, mais jamais toutes : au moins une mauvaise réponse reste à écarter.
    if (correctCount < 1 || correctCount > question.choices.length - 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['choices'],
        message:
          correctCount < 1
            ? 'Il faut au moins 1 bonne réponse (correct: true).'
            : `Il faut au moins 1 mauvaise réponse : toutes les réponses sont marquées correctes (trouvé : ${correctCount} sur ${question.choices.length}).`,
      })
    }
    const seen = new Set<string>()
    question.choices.forEach((choice, index) => {
      const key = choice.text.toLocaleLowerCase('fr')
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['choices', index, 'text'],
          message: 'Deux réponses ont le même texte.',
        })
      }
      seen.add(key)
    })
  })

export const MetaSchema = z.strictObject({
  title: text(LIMITS.title),
  subject: z.enum(SUBJECTS),
  level: z.enum(LEVELS),
  chapter: text(LIMITS.chapter),
  language: z.string().regex(/^[a-z]{2}$/, 'Code langue sur 2 lettres, exemple : fr').default('fr'),
  author: text(LIMITS.author).optional(),
  description: text(LIMITS.description).optional(),
})

export const QcmSchema = z
  .strictObject({
    version: z.literal(QCM_FORMAT_VERSION),
    meta: MetaSchema,
    questions: z
      .array(QuestionSchema)
      .min(LIMITS.minQuestions, 'Il faut au moins 1 question.')
      .max(LIMITS.maxQuestions, `Il faut au plus ${LIMITS.maxQuestions} questions.`),
  })
  .superRefine((qcm, ctx) => {
    const seen = new Set<string>()
    qcm.questions.forEach((question, index) => {
      if (seen.has(question.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'id'],
          message: `L'identifiant « ${question.id} » est utilisé deux fois.`,
        })
      }
      seen.add(question.id)
    })
  })

export type QcmChoice = z.infer<typeof ChoiceSchema>
export type QcmQuestion = z.infer<typeof QuestionSchema>
export type QcmMeta = z.infer<typeof MetaSchema>
export type QcmData = z.infer<typeof QcmSchema>
/** Forme acceptée en entrée (avant application des valeurs par défaut). */
export type QcmDataInput = z.input<typeof QcmSchema>

/** Résumé affiché sur l'écran d'accueil d'un QCM et stocké dans PocketBase. */
export interface QcmSummary {
  questionCount: number
  hasImages: boolean
  imagePaths: string[]
}

export function summarizeQcm(qcm: QcmData): QcmSummary {
  const imagePaths = [
    ...new Set(qcm.questions.flatMap((question) => (question.image ? [question.image] : []))),
  ]
  return {
    questionCount: qcm.questions.length,
    hasImages: imagePaths.length > 0,
    imagePaths,
  }
}

/** Index de la (première) bonne réponse d'une question valide. */
export function correctIndexOf(question: QcmQuestion): number {
  return question.choices.findIndex((choice) => choice.correct)
}

/** Index de toutes les bonnes réponses d'une question valide, dans l'ordre. */
export function correctIndexesOf(question: QcmQuestion): number[] {
  return question.choices.flatMap((choice, index) => (choice.correct ? [index] : []))
}

/** `true` si la question a plusieurs bonnes réponses : l'élève doit toutes les cocher. */
export function isMultipleAnswer(question: QcmQuestion): boolean {
  return question.choices.filter((choice) => choice.correct).length > 1
}
