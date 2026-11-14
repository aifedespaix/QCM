import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { QcmFormatError, formatZodIssues } from './errors.ts'
import { MEDIA_PATH_REGEX, QcmSchema, summarizeQcm, type QcmData } from './schema.ts'

export const DATA_FILE = 'data.yaml'
export const QCM_EXTENSION = '.qcm'
export const QCM_MIME = 'application/zip'

/** Garde-fous contre les archives piégées. Mêmes valeurs que dans le backend Rust. */
export const ARCHIVE_LIMITS = {
  maxArchiveBytes: 20 * 1024 * 1024,
  maxDataBytes: 1024 * 1024,
  maxMediaBytes: 3 * 1024 * 1024,
  maxTotalBytes: 60 * 1024 * 1024,
} as const

export interface QcmArchive {
  data: QcmData
  /** Clé = chemin relatif `media/nom.webp`, valeur = octets WebP. */
  media: Map<string, Uint8Array>
}

/** Valide un objet JavaScript quelconque contre le schéma. Lance `QcmFormatError('E_SCHEMA')`. */
export function validateQcm(input: unknown): QcmData {
  const result = QcmSchema.safeParse(input)
  if (!result.success) {
    throw new QcmFormatError('E_SCHEMA', formatZodIssues(result.error))
  }
  return result.data
}

/** Texte `data.yaml` → données validées. */
export function parseQcmYaml(yamlText: string): QcmData {
  let raw: unknown
  try {
    raw = parseYaml(yamlText, { schema: 'core', maxAliasCount: 0 })
  } catch (error) {
    throw new QcmFormatError('E_YAML', [error instanceof Error ? error.message : String(error)])
  }
  return validateQcm(raw)
}

/** Données validées → texte `data.yaml` stable et lisible (ordre des clés fixe, `correct: false` omis). */
export function stringifyQcmYaml(input: QcmData): string {
  const data = validateQcm(input)
  const meta = data.meta
  const plain = {
    version: data.version,
    meta: {
      title: meta.title,
      subject: meta.subject,
      level: meta.level,
      chapter: meta.chapter,
      language: meta.language,
      ...(meta.author ? { author: meta.author } : {}),
      ...(meta.description ? { description: meta.description } : {}),
    },
    questions: data.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      ...(question.image ? { image: question.image } : {}),
      choices: question.choices.map((choice) =>
        choice.correct ? { text: choice.text, correct: true } : { text: choice.text },
      ),
      ...(question.hint ? { hint: question.hint } : {}),
      explanation: question.explanation,
    })),
  }
  return stringifyYaml(plain, { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' })
}

/** Vrai si les octets commencent par un en-tête RIFF....WEBP. */
export function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
}

/** Octets d'un fichier `.qcm` → données validées + images. */
export function readQcmArchive(bytes: Uint8Array): QcmArchive {
  if (bytes.length > ARCHIVE_LIMITS.maxArchiveBytes) {
    throw new QcmFormatError('E_TOO_BIG')
  }
  let total = 0
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        const wanted = file.name === DATA_FILE || MEDIA_PATH_REGEX.test(file.name)
        if (!wanted) return false
        const max = file.name === DATA_FILE ? ARCHIVE_LIMITS.maxDataBytes : ARCHIVE_LIMITS.maxMediaBytes
        total += file.originalSize
        if (file.originalSize > max || total > ARCHIVE_LIMITS.maxTotalBytes) {
          throw new QcmFormatError('E_TOO_BIG')
        }
        return true
      },
    })
  } catch (error) {
    if (error instanceof QcmFormatError) throw error
    throw new QcmFormatError('E_NOT_ZIP')
  }

  const dataBytes = files[DATA_FILE]
  if (!dataBytes) throw new QcmFormatError('E_NO_DATA')
  const data = parseQcmYaml(strFromU8(dataBytes))

  const media = new Map<string, Uint8Array>()
  for (const path of summarizeQcm(data).imagePaths) {
    const image = files[path]
    if (!image) throw new QcmFormatError('E_MEDIA_MISSING', [path])
    if (!isWebp(image)) throw new QcmFormatError('E_MEDIA_INVALID', [path])
    media.set(path, image)
  }
  return { data, media }
}

/** Données + images → octets d'un fichier `.qcm`. Seules les images référencées sont écrites. */
export function writeQcmArchive(archive: { data: QcmData; media?: ReadonlyMap<string, Uint8Array> }): Uint8Array {
  const data = validateQcm(archive.data)
  const zippable: Zippable = {
    [DATA_FILE]: [strToU8(stringifyQcmYaml(data)), { level: 9 }],
  }
  for (const path of summarizeQcm(data).imagePaths) {
    const image = archive.media?.get(path)
    if (!image) throw new QcmFormatError('E_MEDIA_MISSING', [path])
    if (!isWebp(image)) throw new QcmFormatError('E_MEDIA_INVALID', [path])
    if (image.length > ARCHIVE_LIMITS.maxMediaBytes) throw new QcmFormatError('E_TOO_BIG', [path])
    // WebP est déjà compressé : on stocke sans recompresser.
    zippable[path] = [image, { level: 0 }]
  }
  const bytes = zipSync(zippable)
  if (bytes.length > ARCHIVE_LIMITS.maxArchiveBytes) throw new QcmFormatError('E_TOO_BIG')
  return bytes
}

/** Nom de fichier sûr pour un export : « Les fractions ! » → `les-fractions.qcm`. */
export function qcmFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'qcm'}${QCM_EXTENSION}`
}
