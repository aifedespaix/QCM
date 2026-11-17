<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { confirm } from '@tauri-apps/plugin-dialog'
import { QcmFormatError, matchLibrary, qcmFingerprint, type LibraryMatch, type QcmHistoryEntry } from '@qcm/core'
import { QcmLogo, QcmPlayer, QcmSoundToggle, QcmStatsDashboard, QcmThemeToggle, useQcmHistory } from '@qcm/ui'
import { LibraryError, downloadLibraryQcm, findLibraryRecords, getLibraryRecord, libraryAvailable, type LibraryRecord } from './lib/library.ts'
import {
  exportLibraryQcm,
  exportStoredQcm,
  listStoredQcms,
  loadQcm,
  loadStoredQcm,
  onOpenFileRequest,
  onQcmFileDrop,
  pickQcmFile,
  pickSaveLocation,
  removeStoredQcm,
  resolveMedia,
  storeQcm,
  takePendingFile,
  type OpenedQcm,
} from './lib/qcmFile.ts'
import { checkForUpdate, installUpdate, type AvailableUpdate } from './lib/updater.ts'
import LoadingScreen from './components/LoadingScreen.vue'
import HomeView from './views/HomeView.vue'
import LibraryView from './views/LibraryView.vue'

/** Écran affiché quand aucun QCM n'est en cours. */
type Page = 'home' | 'library' | 'stats'
/** Ce qui recouvre l'écran : chargement, lecteur, erreur d'ouverture. */
type Overlay = 'none' | 'loading' | 'player' | 'error'

const page = ref<Page>('home')
const overlay = ref<Overlay>('loading')
const opened = shallowRef<OpenedQcm | null>(null)
const errorMessage = ref('')
const errorDetails = ref<string[]>([])
/** Change à chaque ouverture : force un lecteur neuf, même pour le même fichier. */
const openCount = ref(0)
const unlisten: Array<() => void> = []

const { history, recents, recordOpen, recordUpdate, link, recordResult, clearAttempts } = useQcmHistory()
/** Empreintes des QCM dont l'application garde une copie : eux seuls peuvent être relancés hors-ligne. */
const stored = ref(new Set<string>())
/** Clé du QCM en cours dans le suivi. */
let currentKey = ''
const onlineLibrary = ref(false)
const downloadingId = ref('')
const downloadError = ref('')
/** Confirmation d'un « Enregistrer sous » réussi, affichée sur l'écran de la bibliothèque. */
const exportNotice = ref('')

const localQcms = computed(() => recents.value.filter((entry) => stored.value.has(entry.key)))
/** Lien de chaque QCM de l'ordinateur avec la bibliothèque en ligne (dernier état connu). */
const remote = ref<ReadonlyMap<string, LibraryMatch>>(new Map())

/** Relit le dossier de l'application : une copie supprimée à la main ne doit plus compter comme « sur cet ordinateur ». */
async function refreshStored(): Promise<void> {
  stored.value = await listStoredQcms()
}

/**
 * Relie les QCM de l'ordinateur à la bibliothèque en ligne : retrouve le QCM d'un fichier ouvert
 * depuis le disque (même empreinte de contenu), repère les nouvelles versions et les QCM retirés.
 * Ne regarde que les copies réellement présentes. Sans réseau, rien ne change : on réessaie plus tard.
 */
let syncing = false
async function syncLibrary(): Promise<void> {
  if (syncing || !onlineLibrary.value) return
  syncing = true
  try {
    await refreshStored()
    const entries = localQcms.value
    if (entries.length === 0) {
      remote.value = new Map()
      return
    }
    const { records, complete } = await findLibraryRecords({
      ids: [...new Set(entries.flatMap((entry) => (entry.recordId ? [entry.recordId] : [])))],
      fingerprints: entries.filter((entry) => !entry.recordId).map((entry) => entry.key),
    })
    const matches = matchLibrary(entries, records, complete)
    for (const entry of entries) {
      const match = matches.get(entry.key)
      if (match && match.state !== 'removed' && match.recordId !== entry.recordId) link(entry.key, match.recordId)
    }
    remote.value = matches
  } catch {
    // Hors-ligne ou bibliothèque muette : on garde le dernier état connu.
  } finally {
    syncing = false
  }
}

/** Mise à jour : proposée uniquement sur l'écran d'accueil, jamais pendant un QCM. */
const update = shallowRef<AvailableUpdate | null>(null)
const updateState = ref<'idle' | 'installing' | 'failed'>('idle')
const updatePercent = ref<number | null>(null)

async function startUpdate(): Promise<void> {
  if (!update.value || updateState.value === 'installing') return
  updateState.value = 'installing'
  updatePercent.value = null
  try {
    await installUpdate(update.value, (percent) => {
      updatePercent.value = percent
    })
  } catch {
    updateState.value = 'failed'
  }
}

function showError(error: unknown): void {
  opened.value = null
  if (error instanceof QcmFormatError) {
    errorMessage.value = error.message
    errorDetails.value = error.details.slice(0, 5)
  } else {
    errorMessage.value = 'Ce fichier ne peut pas être ouvert.'
    errorDetails.value = []
  }
  overlay.value = 'error'
}

/** Lance le lecteur et note l'ouverture dans le suivi. */
function play(qcm: OpenedQcm, extra: { recordId?: string; fileName?: string } = {}, replaces?: string): string {
  opened.value = qcm
  // Nouvelle version d'un QCM de la bibliothèque : elle prend la place de l'ancienne (suivi conservé).
  currentKey = replaces && replaces !== qcmFingerprint(qcm.data) ? recordUpdate(replaces, qcm.data, extra) : recordOpen(qcm.data, extra)
  openCount.value += 1
  overlay.value = 'player'
  return currentKey
}

/**
 * Ouvre un fichier `.qcm` (dialogue, glisser-déposer, double-clic, téléchargement) et en garde
 * une copie : il reste dans « Derniers QCM » même si le fichier est ensuite déplacé ou supprimé.
 */
async function openPath(path: string, recordId?: string): Promise<void> {
  overlay.value = 'loading'
  try {
    const qcm = await loadQcm(path)
    const key = qcmFingerprint(qcm.data)
    // La copie est faite AVANT d'écrire quoi que ce soit dans le suivi : on ne note « sur cet ordinateur » que ce qui y est vraiment.
    let kept = false
    try {
      await storeQcm(path, key)
      kept = true
    } catch {
      // Copie impossible (disque plein…) : le QCM se joue quand même, il ne sera pas dans la liste.
    }
    // Version précédente du même QCM en ligne : la nouvelle la remplace (suivi repris, ancienne copie retirée).
    const previous = kept && recordId ? localQcms.value.find((entry) => entry.recordId === recordId && entry.key !== key) : undefined
    play(qcm, recordId ? { recordId } : { fileName: qcm.fileName }, previous?.key)
    if (kept) {
      if (previous) await removeStoredQcm(previous.key).catch(() => {})
      await refreshStored()
      void syncLibrary()
    }
  } catch (error) {
    showError(error)
  }
}

/** Rouvre la copie conservée d'un QCM. */
async function openStored(key: string): Promise<void> {
  overlay.value = 'loading'
  try {
    play(await loadStoredQcm(key))
  } catch (error) {
    // La copie a disparu (dossier de l'application vidé) : la liste se remet à jour.
    stored.value = await listStoredQcms()
    showError(error)
  }
}

async function openRecord(record: Pick<LibraryRecord, 'id' | 'file' | 'fingerprint'>): Promise<void> {
  if (downloadingId.value) return
  downloadingId.value = record.id
  downloadError.value = ''
  try {
    // La copie de l'ordinateur est déjà la version en ligne : inutile de la télécharger à nouveau.
    const same = record.fingerprint ? localQcms.value.find((entry) => entry.key === record.fingerprint) : undefined
    if (same) {
      try {
        play(await loadStoredQcm(same.key), { recordId: record.id })
        return
      } catch {
        await refreshStored() // copie disparue : on retélécharge
      }
    }
    const path = await downloadLibraryQcm(record)
    await openPath(path, record.id)
  } catch (error) {
    // Pas de réseau : la copie déjà présente sur l'ordinateur prend le relais.
    const local = localQcms.value.find((entry) => entry.recordId === record.id)
    if (local) await openStored(local.key)
    else {
      overlay.value = 'none'
      downloadError.value =
        error instanceof LibraryError && error.reason === 'missing'
          ? 'Ce QCM n\'est plus dans la bibliothèque en ligne.'
          : 'Le téléchargement n\'a pas abouti. Vérifie la connexion à Internet, puis réessaie.'
    }
  } finally {
    downloadingId.value = ''
  }
}

/** « Relancer » depuis le suivi : copie locale d'abord, sinon nouveau téléchargement. */
function canReopen(entry: QcmHistoryEntry): boolean {
  return stored.value.has(entry.key) || (onlineLibrary.value && !!entry.recordId)
}

async function reopen(key: string): Promise<void> {
  if (stored.value.has(key)) return openStored(key)
  const entry = history.value.entries.find((item) => item.key === key)
  if (!entry?.recordId) return
  overlay.value = 'loading'
  try {
    await openRecord(await getLibraryRecord(entry.recordId))
    // Le message d'échec s'affiche sur l'écran de la bibliothèque.
    if (downloadError.value) page.value = 'library'
  } catch {
    overlay.value = 'none'
    page.value = 'library'
    downloadError.value = 'Ce QCM n\'est plus sur cet ordinateur et la bibliothèque en ligne ne répond pas.'
  }
}

/** « Mettre à jour » un QCM de l'ordinateur : retélécharge la version en ligne, qui remplace l'ancienne. */
async function updateLocal(entry: QcmHistoryEntry): Promise<void> {
  if (!entry.recordId) return
  downloadError.value = ''
  try {
    await openRecord(await getLibraryRecord(entry.recordId))
  } catch {
    downloadError.value = 'La mise à jour n\'a pas abouti. Vérifie la connexion à Internet, puis réessaie.'
  }
}

async function removeLocal(entry: QcmHistoryEntry): Promise<void> {
  const sure = await confirm(`Retirer « ${entry.title} » de cet ordinateur ? Le suivi déjà enregistré est conservé.`, {
    title: 'Retirer ce QCM',
    okLabel: 'Retirer',
    cancelLabel: 'Annuler',
  })
  if (!sure) return
  await removeStoredQcm(entry.key).catch(() => {})
  await refreshStored()
}

/**
 * « Télécharger… » : l'élève choisit où ranger le fichier. Une copie déjà sur l'ordinateur est
 * recopiée telle quelle, sinon le QCM est téléchargé directement à l'endroit choisi.
 */
async function exportQcm(target: { title: string; key?: string; record?: Pick<LibraryRecord, 'id' | 'file'> }): Promise<void> {
  downloadError.value = ''
  exportNotice.value = ''
  try {
    const dest = await pickSaveLocation(target.title)
    if (!dest) return
    const key = target.key ?? localQcms.value.find((entry) => entry.recordId === target.record?.id)?.key
    if (key) await exportStoredQcm(key, dest)
    else if (target.record) await exportLibraryQcm(target.record.id, target.record.file, dest)
    else return
    exportNotice.value = `« ${target.title} » est enregistré.`
  } catch {
    downloadError.value = 'Le fichier n\'a pas pu être enregistré à cet endroit. Choisis un autre dossier, ou vérifie la connexion à Internet.'
  }
}

async function clearStats(): Promise<void> {
  const sure = await confirm('Effacer tout le suivi enregistré sur cet ordinateur ?', {
    title: 'Effacer le suivi',
    okLabel: 'Effacer',
    cancelLabel: 'Annuler',
  })
  if (sure) clearAttempts()
}

async function openPending(): Promise<boolean> {
  const path = await takePendingFile()
  if (!path) return false
  await openPath(path)
  return true
}

async function chooseFile(): Promise<void> {
  const path = await pickQcmFile()
  if (path) await openPath(path)
}

function closeOverlay(): void {
  opened.value = null
  overlay.value = 'none'
}

function go(target: Page): void {
  downloadError.value = ''
  exportNotice.value = ''
  page.value = target
}

function onKeydown(event: KeyboardEvent): void {
  // Échap ramène à l'accueil depuis la bibliothèque ou le suivi (jamais pendant un QCM).
  if (event.key !== 'Escape' || overlay.value !== 'none' || page.value === 'home') return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, select, textarea')) return
  go('home')
}

function onBackOnline(): void {
  void syncLibrary()
}

// Chaque visite de la bibliothèque revérifie les copies présentes et les versions en ligne.
watch(page, (value) => {
  if (value === 'library') void syncLibrary()
})

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('online', onBackOnline)
  unlisten.push(await onOpenFileRequest(() => void openPending()))
  unlisten.push(await onQcmFileDrop((path) => void openPath(path)))
  await refreshStored()
  onlineLibrary.value = await libraryAvailable()
  void syncLibrary()
  if (!(await openPending())) overlay.value = 'none'
  // Sans réseau, `checkForUpdate` renvoie `null` : rien ne s'affiche.
  update.value = await checkForUpdate()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('online', onBackOnline)
  for (const stop of unlisten) stop()
})
</script>

<template>
  <!-- Pendant un QCM, le lecteur occupe toute la fenêtre : sa croix remplace le bandeau. -->
  <LoadingScreen v-if="overlay === 'loading'" />

  <div v-else-if="overlay === 'player' && opened" class="h-dvh">
    <QcmPlayer :key="openCount" :qcm="opened.data" :resolve-media="resolveMedia" closable @close="closeOverlay" @result="recordResult(currentKey, $event)" />
  </div>

  <div v-else class="flex h-dvh flex-col bg-bg text-ink">
    <header class="flex flex-none items-center justify-between gap-4 px-6 py-4">
      <div class="flex min-w-0 items-center gap-2">
        <button type="button" class="flex cursor-pointer items-center gap-3 rounded-2xl" aria-label="QCM, accueil" :aria-current="page === 'home' ? 'page' : undefined" @click="go('home')">
          <QcmLogo :size="40" class="flex-none" />
          <span class="text-2xl leading-none font-extrabold tracking-tight">QCM</span>
        </button>
        <button v-if="page !== 'home' && overlay === 'none'" type="button" class="qcm-text-button ml-2" @click="go('home')">← Accueil</button>
      </div>
      <nav class="flex items-center gap-3" aria-label="Navigation">
        <button
          type="button"
          class="qcm-icon-button"
          :class="page === 'library' ? 'bg-selected' : ''"
          aria-label="Bibliothèque"
          title="Bibliothèque"
          :aria-current="page === 'library' ? 'page' : undefined"
          @click="closeOverlay(), go('library')"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13" /></svg>
        </button>
        <button
          type="button"
          class="qcm-icon-button"
          :class="page === 'stats' ? 'bg-selected' : ''"
          aria-label="Suivi des révisions (parents)"
          title="Suivi des révisions (parents)"
          :aria-current="page === 'stats' ? 'page' : undefined"
          @click="closeOverlay(), go('stats')"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" /></svg>
        </button>
        <span class="h-8 w-0.5 rounded-full bg-line-soft" aria-hidden="true" />
        <QcmSoundToggle />
        <QcmThemeToggle />
      </nav>
    </header>

    <main class="flex min-h-0 flex-1 flex-col" :class="overlay === 'none' && page === 'home' ? '' : 'overflow-y-auto'">
      <section v-if="overlay === 'error'" class="qcm-card m-auto flex w-full max-w-xl flex-col gap-5 p-8" role="alert">
        <h1 class="text-2xl font-extrabold">Ce QCM ne s'ouvre pas.</h1>
        <p class="qcm-note qcm-note-retry text-lg">{{ errorMessage }}</p>
        <ul v-if="errorDetails.length > 0" class="list-disc pl-6 text-base text-ink-soft select-text">
          <li v-for="detail in errorDetails" :key="detail">{{ detail }}</li>
        </ul>
        <div class="grid gap-3 sm:grid-cols-2">
          <button type="button" class="qcm-block qcm-block-primary" @click="chooseFile">Ouvrir un autre fichier</button>
          <button type="button" class="qcm-block qcm-block-quiet" @click="closeOverlay">Retour</button>
        </div>
      </section>

      <HomeView
        v-else-if="page === 'home'"
        :recents="localQcms"
        :update="update"
        :update-state="updateState"
        :update-percent="updatePercent"
        @choose-file="chooseFile"
        @open-library="go('library')"
        @open-recent="openStored"
        @start-update="startUpdate"
      />

      <LibraryView
        v-else-if="page === 'library'"
        :local="localQcms"
        :remote="remote"
        :downloading-id="downloadingId"
        :download-error="downloadError"
        :export-notice="exportNotice"
        @open-record="openRecord"
        @export-record="exportQcm({ title: $event.title, record: $event })"
        @export-local="exportQcm({ title: $event.title, key: $event.key })"
        @open-local="openStored"
        @update-local="updateLocal"
        @remove-local="removeLocal"
        @choose-file="chooseFile"
      />

      <div v-else class="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 pb-8">
        <header>
          <h1 class="text-3xl font-extrabold">Suivi des révisions</h1>
          <p class="max-w-3xl text-ink-soft">Un espace pour les parents : ce qui est acquis, ce qui mérite d'être revu. Pendant un QCM, l'élève ne voit jamais de score.</p>
        </header>
        <QcmStatsDashboard :history="history" :can-open="canReopen" @open="reopen" @clear="clearStats">
          <template #empty>
            <button type="button" class="qcm-block qcm-block-primary qcm-block-sm" @click="go('library')">Choisir un QCM dans la bibliothèque</button>
          </template>
        </QcmStatsDashboard>
      </div>
    </main>
  </div>
</template>
