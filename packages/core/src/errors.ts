import type { z } from 'zod'

export type QcmErrorCode =
  | 'E_OPEN'
  | 'E_NOT_ZIP'
  | 'E_NO_DATA'
  | 'E_TOO_BIG'
  | 'E_YAML'
  | 'E_SCHEMA'
  | 'E_MEDIA_MISSING'
  | 'E_MEDIA_INVALID'
  | 'E_IMAGE'

const DEFAULT_MESSAGES: Record<QcmErrorCode, string> = {
  E_OPEN: 'Ce fichier ne peut pas être ouvert.',
  E_NOT_ZIP: 'Ce fichier n\'est pas un fichier QCM lisible.',
  E_NO_DATA: 'Ce fichier QCM ne contient pas de questions (data.yaml absent).',
  E_TOO_BIG: 'Ce fichier QCM est trop volumineux.',
  E_YAML: 'Le contenu du QCM est mal écrit (YAML invalide).',
  E_SCHEMA: 'Le contenu du QCM ne respecte pas le format attendu.',
  E_MEDIA_MISSING: 'Une image du QCM est introuvable dans le fichier.',
  E_MEDIA_INVALID: 'Une image du QCM n\'est pas une image WebP valide.',
  E_IMAGE: 'Cette image ne peut pas être convertie.',
}

/** Erreur unique du format QCM : un code stable + des détails lisibles en français. */
export const QCM_ERROR_CODES = Object.keys(DEFAULT_MESSAGES) as QcmErrorCode[]

export class QcmFormatError extends Error {
  readonly code: QcmErrorCode
  /** Une ligne par problème, par exemple `questions[2].choices : Il faut au moins 1 bonne réponse`. */
  readonly details: string[]

  constructor(code: QcmErrorCode, details: string[] = [], message?: string) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'QcmFormatError'
    this.code = code
    this.details = details
  }
}

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path
      .map((segment) => (typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`))
      .join('')
      .replace(/^\./, '')
    return path ? `${path} : ${issue.message}` : issue.message
  })
}
