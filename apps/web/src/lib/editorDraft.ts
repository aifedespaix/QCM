import { reactive } from 'vue'
import {
  LIMITS,
  QCM_FORMAT_VERSION,
  correctIndexOf,
  extractQcmYaml,
  imageToWebp,
  mediaPathFor,
  parseQcmYaml,
  stringifyQcmYaml,
  validateQcm,
  writeQcmArchive,
  type Level,
  type QcmArchive,
  type QcmData,
  type Subject,
} from '@qcm/core'

export interface DraftImage {
  /** Chemin dans l'archive : `media/xxx.webp`. */
  path: string
  bytes: Uint8Array
  /** URL `blob:` pour l'aperçu. */
  url: string
}

export interface DraftQuestion {
  /** Clé stable pour `v-for` (l'identifiant `q1`, `q2`... est attribué à l'export). */
  key: number
  prompt: string
  choices: { text: string }[]
  correctIndex: number
  hint: string
  explanation: string
  image: DraftImage | null
}

export interface Draft {
  title: string
  subject: Subject
  level: Level
  chapter: string
  author: string
  description: string
  questions: DraftQuestion[]
}

let nextKey = 1

function blobUrl(bytes: Uint8Array): string {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return URL.createObjectURL(new Blob([buffer], { type: 'image/webp' }))
}

export function emptyQuestion(): DraftQuestion {
  return {
    key: nextKey++,
    prompt: '',
    choices: [{ text: '' }, { text: '' }],
    correctIndex: 0,
    hint: '',
    explanation: '',
    image: null,
  }
}

export function createDraft(): Draft {
  return reactive<Draft>({
    title: '',
    subject: 'maths',
    level: '6e',
    chapter: '',
    author: '',
    description: '',
    questions: [emptyQuestion()],
  })
}

/**
 * Vide le brouillon pour en commencer un nouveau. Les images de l'ancien sont libérées ;
 * `keepAuthor` garde la signature, pour enchaîner plusieurs QCM sans la retaper.
 */
export function resetDraft(draft: Draft, keepAuthor = true): void {
  for (const question of draft.questions) {
    if (question.image) URL.revokeObjectURL(question.image.url)
  }
  const author = keepAuthor ? draft.author : ''
  Object.assign(draft, { title: '', subject: 'maths', level: '6e', chapter: '', author, description: '', questions: [emptyQuestion()] })
}

/** Ajoute une question vide à la fin et renvoie son index (ou `-1` si la limite est atteinte). */
export function addQuestion(draft: Draft): number {
  if (draft.questions.length >= LIMITS.maxQuestions) return -1
  draft.questions.push(emptyQuestion())
  return draft.questions.length - 1
}

/** Copie une question juste après l'originale (sans l'image) et renvoie l'index de la copie. */
export function duplicateQuestion(draft: Draft, index: number): number {
  const source = draft.questions[index]
  if (!source || draft.questions.length >= LIMITS.maxQuestions) return -1
  draft.questions.splice(index + 1, 0, {
    ...source,
    key: nextKey++,
    choices: source.choices.map((choice) => ({ text: choice.text })),
    image: null,
  })
  return index + 1
}

export function removeQuestion(draft: Draft, index: number): void {
  if (draft.questions.length <= 1) return
  const [removed] = draft.questions.splice(index, 1)
  if (removed?.image) URL.revokeObjectURL(removed.image.url)
}

/** Déplace une question d'un cran (`-1` vers le haut, `1` vers le bas). */
export function moveQuestion(draft: Draft, index: number, direction: -1 | 1): void {
  const target = index + direction
  const current = draft.questions[index]
  const other = draft.questions[target]
  if (!current || !other) return
  draft.questions[index] = other
  draft.questions[target] = current
}

export function addChoice(question: DraftQuestion): void {
  if (question.choices.length < LIMITS.maxChoices) question.choices.push({ text: '' })
}

export function removeChoice(question: DraftQuestion, index: number): void {
  if (question.choices.length <= LIMITS.minChoices) return
  question.choices.splice(index, 1)
  if (question.correctIndex === index) question.correctIndex = 0
  else if (question.correctIndex > index) question.correctIndex -= 1
}

/** Convertit l'image déposée en WebP (1280 px max) et l'attache à la question. */
export async function setQuestionImage(draft: Draft, question: DraftQuestion, file: Blob, fileName: string): Promise<void> {
  const { bytes } = await imageToWebp(file)
  const taken = draft.questions.flatMap((item) => (item.image && item !== question ? [item.image.path] : []))
  if (question.image) URL.revokeObjectURL(question.image.url)
  question.image = { path: mediaPathFor('img', fileName, taken), bytes, url: blobUrl(bytes) }
}

export function removeQuestionImage(question: DraftQuestion): void {
  if (question.image) URL.revokeObjectURL(question.image.url)
  question.image = null
}

export interface BuiltQcm {
  data: QcmData
  media: Map<string, Uint8Array>
  /** Octets du fichier `.qcm`. */
  bytes: Uint8Array
  /** Première image, utilisée comme miniature à la publication. */
  thumbnail?: Uint8Array
}

/** Brouillon → données validées (lance `QcmFormatError('E_SCHEMA')` avec le détail des champs à corriger). */
export function draftToData(draft: Draft): QcmData {
  return validateQcm({
    version: QCM_FORMAT_VERSION,
    meta: {
      title: draft.title,
      subject: draft.subject,
      level: draft.level,
      chapter: draft.chapter,
      language: 'fr',
      ...(draft.author.trim() ? { author: draft.author } : {}),
      ...(draft.description.trim() ? { description: draft.description } : {}),
    },
    questions: draft.questions.map((question, index) => ({
      id: `q${index + 1}`,
      prompt: question.prompt,
      ...(question.image ? { image: question.image.path } : {}),
      choices: question.choices.map((choice, choiceIndex) => ({
        text: choice.text,
        correct: choiceIndex === question.correctIndex,
      })),
      ...(question.hint.trim() ? { hint: question.hint } : {}),
      explanation: question.explanation,
    })),
  })
}

/** Brouillon → fichier `.qcm` complet. */
export function buildQcm(draft: Draft): BuiltQcm {
  const data = draftToData(draft)
  const media = new Map<string, Uint8Array>()
  for (const question of draft.questions) {
    if (question.image) media.set(question.image.path, question.image.bytes)
  }
  const bytes = writeQcmArchive({ data, media })
  const first = draft.questions.find((question) => question.image)?.image?.bytes
  return { data, media, bytes, ...(first ? { thumbnail: first } : {}) }
}

/** Recharge un `.qcm` existant dans l'éditeur. */
export function loadArchiveIntoDraft(draft: Draft, archive: QcmArchive): void {
  for (const question of draft.questions) {
    if (question.image) URL.revokeObjectURL(question.image.url)
  }
  const { meta, questions } = archive.data
  draft.title = meta.title
  draft.subject = meta.subject
  draft.level = meta.level
  draft.chapter = meta.chapter
  draft.author = meta.author ?? ''
  draft.description = meta.description ?? ''
  draft.questions = questions.map((question) => {
    const bytes = question.image ? archive.media.get(question.image) : undefined
    return {
      key: nextKey++,
      prompt: question.prompt,
      choices: question.choices.map((choice) => ({ text: choice.text })),
      correctIndex: correctIndexOf(question),
      hint: question.hint ?? '',
      explanation: question.explanation,
      image: question.image && bytes ? { path: question.image, bytes, url: blobUrl(bytes) } : null,
    }
  })
}

/** Table `chemin → URL blob:` pour l'aperçu `QcmPlayer` dans l'éditeur. */
export function draftMediaResolver(draft: Draft): (path: string) => string | undefined {
  return (path) => draft.questions.find((question) => question.image?.path === path)?.image?.url
}

// ---------------------------------------------------------------- Texte (YAML) et contrôle

/** Remplace le brouillon par un QCM collé en texte (sortie d'un assistant IA). Lance `QcmFormatError`. */
export function loadTextIntoDraft(draft: Draft, text: string): void {
  const data = parseQcmYaml(extractQcmYaml(text))
  // Un texte ne transporte pas d'images : les chemins `image` éventuels sont ignorés.
  loadArchiveIntoDraft(draft, { data, media: new Map() })
}

/** Texte `data.yaml` du brouillon (sans les images). Lance `QcmFormatError` si le brouillon est incomplet. */
export function draftToText(draft: Draft): string {
  const data = draftToData(draft)
  return stringifyQcmYaml({ ...data, questions: data.questions.map(({ image: _image, ...question }) => question) })
}

/** `true` tant que rien n'a été saisi : un import peut remplacer le brouillon sans confirmation. */
export function isDraftEmpty(draft: Draft): boolean {
  const first = draft.questions[0]
  return (
    !draft.title.trim() &&
    !draft.chapter.trim() &&
    !draft.description.trim() &&
    draft.questions.length === 1 &&
    !!first &&
    !first.prompt.trim() &&
    !first.explanation.trim() &&
    !first.image &&
    first.choices.every((choice) => !choice.text.trim())
  )
}

/** Points à compléter dans les informations générales (phrases affichables). */
export function metaIssues(draft: Draft): string[] {
  const issues: string[] = []
  if (!draft.title.trim()) issues.push('Le titre est vide.')
  if (!draft.chapter.trim()) issues.push('Le chapitre est vide.')
  return issues
}

/** Points à compléter dans une question (phrases affichables). Liste vide = question prête. */
export function questionIssues(question: DraftQuestion): string[] {
  const issues: string[] = []
  if (!question.prompt.trim()) issues.push('La question est vide.')
  const texts = question.choices.map((choice) => choice.text.trim().toLocaleLowerCase('fr'))
  if (texts.some((value) => !value)) issues.push('Une réponse est vide.')
  if (new Set(texts.filter(Boolean)).size < texts.filter(Boolean).length) issues.push('Deux réponses ont le même texte.')
  if (!question.explanation.trim()) issues.push('L\'explication est vide.')
  return issues
}
