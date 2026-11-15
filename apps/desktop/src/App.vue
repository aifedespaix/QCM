<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { QcmFormatError } from '@qcm/core'
import { QcmLogo, QcmPlayer, QcmSoundToggle, QcmThemeToggle } from '@qcm/ui'
import {
  loadQcm,
  onOpenFileRequest,
  onQcmFileDrop,
  pickQcmFile,
  resolveMedia,
  takePendingFile,
  type OpenedQcm,
} from './lib/qcmFile.ts'
import { checkForUpdate, installUpdate, type AvailableUpdate } from './lib/updater.ts'

const TIPS = [
  { keys: ['A', 'B', 'C', 'D'], text: 'Choisir une réponse' },
  { keys: ['Entrée'], text: 'Valider et continuer' },
  { keys: ['.qcm'], text: 'Double-clic sur un fichier pour l\'ouvrir' },
] as const

type View = 'home' | 'loading' | 'player' | 'error'

const view = ref<View>('loading')
const opened = shallowRef<OpenedQcm | null>(null)
const errorMessage = ref('')
const errorDetails = ref<string[]>([])
/** Change à chaque ouverture : force un lecteur neuf, même pour le même fichier. */
const openCount = ref(0)
const unlisten: Array<() => void> = []

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

async function openPath(path: string): Promise<void> {
  view.value = 'loading'
  try {
    opened.value = await loadQcm(path)
    openCount.value += 1
    view.value = 'player'
  } catch (error) {
    opened.value = null
    if (error instanceof QcmFormatError) {
      errorMessage.value = error.message
      errorDetails.value = error.details.slice(0, 5)
    } else {
      errorMessage.value = 'Ce fichier ne peut pas être ouvert.'
      errorDetails.value = []
    }
    view.value = 'error'
  }
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

function goHome(): void {
  opened.value = null
  view.value = 'home'
}

onMounted(async () => {
  unlisten.push(await onOpenFileRequest(() => void openPending()))
  unlisten.push(await onQcmFileDrop((path) => void openPath(path)))
  if (!(await openPending())) view.value = 'home'
  // Sans réseau, `checkForUpdate` renvoie `null` : rien ne s'affiche.
  update.value = await checkForUpdate()
})

onBeforeUnmount(() => {
  for (const stop of unlisten) stop()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg text-ink">
    <header class="flex items-center justify-between gap-4 px-6 py-4">
      <div class="flex min-w-0 items-center gap-3">
        <QcmLogo :size="40" class="flex-none" />
        <p v-if="view === 'player' && opened" class="truncate text-base font-bold text-ink-soft">{{ opened.fileName }}</p>
        <p v-else class="text-2xl leading-none font-extrabold tracking-tight">QCM</p>
      </div>
      <div class="flex items-center gap-3">
        <button v-if="view === 'player'" type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" @click="goHome">
          Fermer le QCM
        </button>
        <QcmSoundToggle />
        <QcmThemeToggle />
      </div>
    </header>

    <main class="flex flex-1 items-center justify-center px-6 pb-10" :class="view === 'home' ? 'home-glow' : ''">
      <QcmPlayer
        v-if="view === 'player' && opened"
        :key="openCount"
        :qcm="opened.data"
        :resolve-media="resolveMedia"
        closable
        @close="goHome"
      />

      <div v-else-if="view === 'home'" class="flex w-full max-w-2xl flex-col gap-6">
        <section class="qcm-panel flex flex-col items-center gap-6 p-8 text-center sm:p-10">
          <QcmLogo :size="96" />
          <div>
            <h1 class="text-4xl font-extrabold">Prêt à réviser ?</h1>
            <p class="mt-2 text-lg text-ink-soft">Ouvre un fichier .qcm pour commencer. Tu peux aussi le glisser dans cette fenêtre.</p>
          </div>
          <button
            type="button"
            class="qcm-block qcm-block-primary w-full max-w-md text-xl"
            :disabled="updateState === 'installing'"
            @click="chooseFile"
          >
            Ouvrir un QCM
          </button>
          <ul class="flex flex-wrap justify-center gap-2" aria-label="Ce que QCM garantit">
            <li class="qcm-chip bg-badge-a">Une question à la fois</li>
            <li class="qcm-chip bg-badge-c">Sans chronomètre</li>
            <li class="qcm-chip bg-badge-d">Sans score</li>
          </ul>
        </section>

        <section class="grid gap-4 sm:grid-cols-3" aria-label="Raccourcis clavier">
          <div v-for="tip in TIPS" :key="tip.text" class="qcm-panel flex flex-col items-center gap-2 p-4 text-center">
            <p class="flex gap-1.5" aria-hidden="true">
              <span v-for="key in tip.keys" :key="key" class="qcm-key bg-surface">{{ key }}</span>
            </p>
            <p class="text-base font-semibold text-ink-soft">{{ tip.text }}</p>
          </div>
        </section>

        <section v-if="update" class="qcm-card bg-selected p-6" aria-labelledby="update-title">
          <h2 id="update-title" class="text-xl font-extrabold">Une nouvelle version de QCM est prête.</h2>
          <p class="mt-1 text-base font-medium">Version {{ update.version }}. L'installation prend environ une minute, puis QCM se rouvre.</p>
          <p v-if="updateState === 'installing'" role="status" class="mt-4 text-lg font-bold">
            Mise à jour en cours{{ updatePercent === null ? '…' : ` : ${updatePercent} %` }}
          </p>
          <template v-else>
            <p v-if="updateState === 'failed'" role="alert" class="mt-4 rounded-2xl border-2 border-line bg-retry px-4 py-3 font-medium text-retry-ink">
              La mise à jour n'a pas pu se faire. Tu peux réessayer plus tard. QCM fonctionne normalement.
            </p>
            <button type="button" class="qcm-block qcm-block-quiet mt-4 w-full" @click="startUpdate">Mettre à jour</button>
          </template>
        </section>
      </div>

      <section v-else-if="view === 'error'" class="qcm-card flex w-full max-w-xl flex-col gap-5 p-8" role="alert">
        <h1 class="text-2xl font-extrabold">Ce QCM ne s'ouvre pas.</h1>
        <p class="rounded-2xl border-2 border-line bg-retry px-5 py-4 text-lg font-medium text-retry-ink">{{ errorMessage }}</p>
        <ul v-if="errorDetails.length > 0" class="list-disc pl-6 text-base text-ink-soft select-text">
          <li v-for="detail in errorDetails" :key="detail">{{ detail }}</li>
        </ul>
        <button type="button" class="qcm-block qcm-block-primary w-full" @click="chooseFile">Ouvrir un autre QCM</button>
      </section>

      <p v-else class="text-lg font-bold text-ink-soft" role="status">Ouverture du QCM…</p>
    </main>
  </div>
</template>
