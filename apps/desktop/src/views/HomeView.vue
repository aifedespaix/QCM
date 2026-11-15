<script setup lang="ts">
import { LEVEL_LABELS, SUBJECT_LABELS, formatRelativeDay, type QcmHistoryEntry } from '@qcm/core'
import { QcmLogo, SUBJECT_TONES } from '@qcm/ui'
import type { AvailableUpdate } from '../lib/updater.ts'

defineProps<{
  /** QCM conservés sur cet ordinateur, du plus récemment ouvert au plus ancien. */
  recents: readonly QcmHistoryEntry[]
  update: AvailableUpdate | null
  updateState: 'idle' | 'installing' | 'failed'
  updatePercent: number | null
}>()

const emit = defineEmits<{
  chooseFile: []
  openLibrary: []
  openRecent: [key: string]
  startUpdate: []
}>()

const TIPS = [
  { keys: ['A', 'B', 'C', 'D'], text: 'Choisir une réponse' },
  { keys: ['Entrée'], text: 'Valider et continuer' },
  { keys: ['.qcm'], text: 'Double-clic sur un fichier pour l\'ouvrir' },
] as const
</script>

<template>
  <!-- Deux colonnes : l'essentiel au centre, les derniers QCM à droite avec leur propre défilement. -->
  <div class="home-glow grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_16rem] gap-5 px-6 pb-6 md:grid-cols-[minmax(0,1fr)_18rem] lg:grid-cols-[minmax(0,1fr)_21rem]">
    <div class="flex min-h-0 flex-col overflow-y-auto">
      <div class="mx-auto my-auto flex w-full max-w-2xl flex-col gap-5 py-1">
        <section class="qcm-panel flex flex-col items-center gap-5 p-7 text-center lg:p-9">
          <QcmLogo :size="88" />
          <div>
            <h1 class="text-3xl font-extrabold lg:text-4xl">Prêt à réviser ?</h1>
            <p class="mt-2 text-lg text-ink-soft">Ouvre un fichier .qcm, ou choisis un QCM dans la bibliothèque. Tu peux aussi glisser un fichier dans cette fenêtre.</p>
          </div>
          <div class="grid w-full max-w-xl gap-3 lg:grid-cols-2">
            <button type="button" class="qcm-block qcm-block-primary text-xl" :disabled="updateState === 'installing'" @click="emit('chooseFile')">
              Ouvrir un fichier
            </button>
            <button type="button" class="qcm-block qcm-block-quiet text-xl" :disabled="updateState === 'installing'" @click="emit('openLibrary')">
              Bibliothèque
            </button>
          </div>
          <ul class="flex flex-wrap justify-center gap-2" aria-label="Ce que QCM garantit">
            <li class="qcm-chip bg-badge-a">Une question à la fois</li>
            <li class="qcm-chip bg-badge-c">Sans chronomètre</li>
            <li class="qcm-chip bg-badge-d">Sans score</li>
          </ul>
        </section>

        <section v-if="update" class="qcm-card bg-selected p-6" aria-labelledby="update-title">
          <h2 id="update-title" class="text-xl font-extrabold">Une nouvelle version de QCM est prête.</h2>
          <p class="mt-1 text-base font-medium">Version {{ update.version }}. L'installation prend environ une minute, puis QCM se rouvre.</p>
          <p v-if="updateState === 'installing'" role="status" class="mt-4 text-lg font-bold">
            Mise à jour en cours{{ updatePercent === null ? '…' : ` : ${updatePercent} %` }}
          </p>
          <template v-else>
            <p v-if="updateState === 'failed'" role="alert" class="qcm-note qcm-note-retry mt-4">
              La mise à jour n'a pas pu se faire. Tu peux réessayer plus tard. QCM fonctionne normalement.
            </p>
            <button type="button" class="qcm-block qcm-block-quiet mt-4 w-full" @click="emit('startUpdate')">Mettre à jour</button>
          </template>
        </section>

        <section class="hidden gap-3 lg:grid lg:grid-cols-3" aria-label="Raccourcis clavier">
          <div v-for="tip in TIPS" :key="tip.text" class="qcm-panel flex flex-col items-center gap-2 p-3 text-center">
            <p class="flex gap-1.5" aria-hidden="true">
              <span v-for="key in tip.keys" :key="key" class="qcm-key bg-surface">{{ key }}</span>
            </p>
            <p class="text-sm font-semibold text-ink-soft">{{ tip.text }}</p>
          </div>
        </section>
      </div>
    </div>

    <aside class="qcm-panel flex min-h-0 flex-col overflow-hidden" aria-labelledby="recents-title">
      <header class="flex flex-none items-baseline justify-between gap-2 border-b-[1.5px] border-line-soft px-5 py-3.5">
        <h2 id="recents-title" class="text-xl font-extrabold">Derniers QCM</h2>
        <span v-if="recents.length > 0" class="text-sm font-bold text-ink-soft">{{ recents.length }}</span>
      </header>

      <p v-if="recents.length === 0" class="m-auto max-w-56 p-5 text-center font-medium text-ink-soft">
        Les QCM que tu ouvres apparaissent ici. Un clic suffit pour les refaire.
      </p>
      <ol v-else class="min-h-0 flex-1 overflow-y-auto p-2">
        <li v-for="entry in recents" :key="entry.key">
          <button
            type="button"
            class="group flex w-full cursor-pointer items-start gap-3 rounded-2xl p-2.5 text-left hover:bg-sunken"
            :aria-label="`Relancer ${entry.title}`"
            @click="emit('openRecent', entry.key)"
          >
            <span class="mt-0.5 flex size-10 flex-none items-center justify-center rounded-xl border-2 border-line" :class="SUBJECT_TONES[entry.subject]" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="line-clamp-2 leading-snug font-extrabold">{{ entry.title }}</span>
              <span class="truncate text-sm font-semibold text-ink-soft">{{ SUBJECT_LABELS[entry.subject] }} · {{ LEVEL_LABELS[entry.level] }}</span>
              <span class="text-xs font-semibold text-ink-soft">
                {{ entry.questionCount === 1 ? '1 question' : `${entry.questionCount} questions` }} · ouvert {{ formatRelativeDay(entry.openedAt) }}
              </span>
            </span>
          </button>
        </li>
      </ol>

      <footer v-if="recents.length > 0" class="flex-none border-t-[1.5px] border-line-soft p-2">
        <button type="button" class="qcm-text-button w-full justify-center" @click="emit('openLibrary')">Tout voir dans la bibliothèque →</button>
      </footer>
    </aside>
  </div>
</template>
