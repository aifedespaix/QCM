import { QcmFormatError } from './errors.ts'
import { ARCHIVE_LIMITS } from './archive.ts'

export const WEBP_MAX_DIMENSION = 1280
export const WEBP_QUALITY = 0.82

export interface WebpResult {
  bytes: Uint8Array
  width: number
  height: number
}

export interface WebpOptions {
  /** Plus grand côté autorisé en pixels. Défaut : 1280. */
  maxDimension?: number
  /** Qualité WebP entre 0 et 1. Défaut : 0.82. */
  quality?: number
}

/** Calcule la taille finale en conservant les proportions, sans jamais agrandir. */
export function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxDimension) return { width, height }
  const scale = maxDimension / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Construit un chemin `media/...webp` valide et unique : (`q3`, `Schéma Cellule.PNG`) → `media/q3_schema-cellule.webp`. */
export function mediaPathFor(questionId: string, originalName: string, taken: Iterable<string> = []): string {
  const base = originalName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const stem = `${questionId}_${base || 'image'}`.slice(0, 56)
  const used = new Set(taken)
  let candidate = `media/${stem}.webp`
  for (let n = 2; used.has(candidate); n++) {
    candidate = `media/${stem}-${n}.webp`
  }
  return candidate
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    return canvas.convertToBlob({ type: 'image/webp', quality })
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
}

/**
 * Convertit une image du navigateur (PNG, JPEG, GIF, WebP, SVG...) en WebP redimensionné.
 * Navigateur uniquement (Canvas API). Lance `QcmFormatError('E_IMAGE')` si la conversion échoue.
 */
export async function imageToWebp(source: Blob, options: WebpOptions = {}): Promise<WebpResult> {
  const maxDimension = options.maxDimension ?? WEBP_MAX_DIMENSION
  let quality = options.quality ?? WEBP_QUALITY

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch {
    throw new QcmFormatError('E_IMAGE', ['Format d\'image non reconnu.'])
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension)
    // Jusqu'à 3 essais en baissant la qualité si le fichier dépasse la limite du format.
    for (let attempt = 0; attempt < 3; attempt++) {
      const blob = await encode(bitmap, width, height, quality)
      if (!blob || blob.type !== 'image/webp') {
        throw new QcmFormatError('E_IMAGE', ['Ce navigateur ne sait pas créer d\'images WebP.'])
      }
      if (blob.size <= ARCHIVE_LIMITS.maxMediaBytes) {
        return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
      }
      quality -= 0.2
    }
    throw new QcmFormatError('E_IMAGE', ['Image trop lourde même après compression.'])
  } finally {
    bitmap.close()
  }
}
