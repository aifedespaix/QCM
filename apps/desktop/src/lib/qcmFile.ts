import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import {
  QCM_ERROR_CODES,
  QcmFormatError,
  parseQcmYaml,
  summarizeQcm,
  type QcmData,
  type QcmErrorCode,
} from '@qcm/core'

/** Réponse de la commande Rust `load_qcm`. */
interface LoadedQcmPayload {
  path: string
  fileName: string
  yaml: string
  /** Chemins `media/x.webp` disponibles via le protocole `qcm://`. */
  media: string[]
}

export interface OpenedQcm {
  path: string
  fileName: string
  data: QcmData
}

const OPEN_FILE_EVENT = 'qcm-open-file'

function toErrorCode(value: unknown): QcmErrorCode {
  return QCM_ERROR_CODES.includes(value as QcmErrorCode) ? (value as QcmErrorCode) : 'E_OPEN'
}

function toOpened(payload: LoadedQcmPayload): OpenedQcm {
  const data = parseQcmYaml(payload.yaml)
  const missing = summarizeQcm(data).imagePaths.filter((image) => !payload.media.includes(image))
  if (missing.length > 0) throw new QcmFormatError('E_MEDIA_MISSING', missing)
  return { path: payload.path, fileName: payload.fileName, data }
}

async function command<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(name, args)
  } catch (code) {
    throw new QcmFormatError(toErrorCode(code))
  }
}

/** Charge un fichier `.qcm` : Rust dézippe, `@qcm/core` valide le YAML. */
export async function loadQcm(path: string): Promise<OpenedQcm> {
  return toOpened(await command<LoadedQcmPayload>('load_qcm', { path }))
}

// ---------------------------------------------------------------- QCM conservés
//
// Chaque QCM ouvert est copié dans le dossier de données de l'application, sous son empreinte
// (`qcmFingerprint`). « Derniers QCM » rouvre cette copie : déplacer, renommer ou supprimer le
// fichier d'origine ne casse rien.

/** Rouvre la copie conservée d'un QCM. */
export async function loadStoredQcm(key: string): Promise<OpenedQcm> {
  return toOpened(await command<LoadedQcmPayload>('load_stored_qcm', { key }))
}

/** Conserve une copie du fichier `path` sous l'empreinte `key`. */
export function storeQcm(path: string, key: string): Promise<void> {
  return invoke('store_qcm', { path, key })
}

/** Empreintes des QCM conservés sur cet ordinateur. */
export async function listStoredQcms(): Promise<Set<string>> {
  try {
    return new Set(await invoke<string[]>('list_stored_qcms'))
  } catch {
    return new Set()
  }
}

export function removeStoredQcm(key: string): Promise<void> {
  return invoke('remove_stored_qcm', { key })
}

/** `media/x.webp` → URL servie par le protocole Rust `qcm://` (http://qcm.localhost/ sous Windows). */
export function resolveMedia(path: string): string {
  return convertFileSrc(path, 'qcm')
}

/** Chemin reçu au lancement (double-clic dans l'Explorateur) ou à chaud. `null` s'il n'y en a pas. */
export function takePendingFile(): Promise<string | null> {
  return invoke<string | null>('take_pending_file')
}

/** Prévenu quand une deuxième instance a transmis un fichier à ouvrir. */
export function onOpenFileRequest(handler: () => void): Promise<UnlistenFn> {
  return listen(OPEN_FILE_EVENT, () => handler())
}

/** Glisser-déposer d'un fichier `.qcm` sur la fenêtre. */
export function onQcmFileDrop(handler: (path: string) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type !== 'drop') return
    const path = event.payload.paths.find((candidate) => candidate.toLowerCase().endsWith('.qcm'))
    if (path) handler(path)
  })
}

/** Boîte de dialogue native « Ouvrir ». */
export async function pickQcmFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: 'Ouvrir un QCM',
    filters: [{ name: 'QCM', extensions: ['qcm'] }],
  })
  return typeof selected === 'string' ? selected : null
}
