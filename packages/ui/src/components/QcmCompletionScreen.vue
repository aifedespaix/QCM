<script setup lang="ts">
import { LEVEL_LABELS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'
import { SUBJECT_TONES } from '../subjects.ts'

/** Un QCM proposé pour continuer à réviser. */
export interface QcmSuggestion {
  key: string
  title: string
  subject: Subject
  level: Level
  chapter: string
  /** Pourquoi on le propose : « À revoir », « Pas encore fait »… */
  reason: string
}

defineProps<{
  title: string
  questionCount: number
  /** Affiche le bouton « Fermer » (lecteur desktop, aperçu web). */
  closable?: boolean
  /**
   * QCM à proposer. `undefined` : l'hôte n'en propose pas, rien ne s'affiche.
   * Tableau vide : tout est maîtrisé, on le dit.
   */
  suggestions?: readonly QcmSuggestion[]
}>()

const emit = defineEmits<{
  restart: []
  close: []
  open: [key: string]
  library: []
}>()
</script>

<template>
  <section class="qcm-card mx-auto flex w-full max-w-2xl flex-col gap-6 p-5 text-center sm:p-8" aria-labelledby="qcm-done-title">
    <h1 id="qcm-done-title" class="text-3xl font-extrabold text-ink">C'est terminé.</h1>
    <p class="text-lg text-ink">
      Tu as vu {{ questionCount === 1 ? 'la question' : `les ${questionCount} questions` }} de
      <strong class="font-bold">« {{ title }} »</strong>.
    </p>

    <div v-if="suggestions && suggestions.length > 0" class="flex flex-col gap-3 text-left">
      <h2 class="text-center text-xl font-extrabold">Pour continuer à réviser</h2>
      <ul class="flex flex-col gap-2.5">
        <li v-for="item in suggestions" :key="item.key">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-surface p-3 text-left transition-transform hover:-translate-y-0.5 sm:p-4"
            @click="emit('open', item.key)"
          >
            <span class="min-w-0 flex-1">
              <span class="mb-1 flex flex-wrap gap-1.5">
                <span class="qcm-chip" :class="SUBJECT_TONES[item.subject]">{{ SUBJECT_LABELS[item.subject] }}</span>
                <span class="qcm-chip">{{ LEVEL_LABELS[item.level] }}</span>
                <span class="qcm-chip bg-retry text-retry-ink">{{ item.reason }}</span>
              </span>
              <span class="block text-base leading-snug font-extrabold break-words">{{ item.title }}</span>
              <span class="block text-sm font-semibold break-words text-ink-soft">{{ item.chapter }}</span>
            </span>
            <svg class="flex-none" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </li>
      </ul>
    </div>
    <p v-else-if="suggestions" class="qcm-note qcm-note-correct text-lg font-bold" role="status">
      Bravo, tu maîtrises tout !
    </p>

    <div class="grid grid-cols-1 gap-3" :class="closable || (suggestions && suggestions.length === 0) ? 'sm:grid-cols-2' : ''">
      <button
        type="button"
        class="qcm-block"
        :class="suggestions && suggestions.length > 0 ? 'qcm-block-quiet' : closable ? 'qcm-block-quiet' : 'qcm-block-primary'"
        @click="emit('restart')"
      >
        Recommencer
      </button>
      <button v-if="suggestions && suggestions.length === 0" type="button" class="qcm-block qcm-block-primary" @click="emit('library')">
        Retourner à la bibliothèque
      </button>
      <button v-else-if="closable" type="button" class="qcm-block qcm-block-primary" @click="emit('close')">Fermer</button>
    </div>
    <button v-if="suggestions && suggestions.length > 0" type="button" class="qcm-text-button mx-auto underline" @click="emit('library')">
      Retourner à la bibliothèque
    </button>
  </section>
</template>
