<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { summarizeQcm, type QcmData, type QcmSessionResult } from '@qcm/core'
import { useQcmPlayer } from '../composables/useQcmPlayer.ts'
import { useQcmSound } from '../composables/useQcmSound.ts'
import QcmAnswerDock from './QcmAnswerDock.vue'
import QcmChoiceGrid from './QcmChoiceGrid.vue'
import QcmCompletionScreen, { type QcmSuggestion } from './QcmCompletionScreen.vue'
import QcmIntroCard from './QcmIntroCard.vue'
import QcmQuestionCard from './QcmQuestionCard.vue'
import QcmSoundToggle from './QcmSoundToggle.vue'

const props = withDefaults(
  defineProps<{
    qcm: QcmData
    /** Transforme un chemin `media/x.webp` en URL affichable (protocole `qcm://`, blob:, etc.). */
    resolveMedia?: (path: string) => string | undefined
    /** Affiche la croix « Quitter » en haut et « Fermer » sur l'écran de fin. */
    closable?: boolean
    /** Plein écran : recouvre la page, bloque son défilement et respecte les encoches du téléphone. */
    immersive?: boolean
    /** Écoute le clavier sur `window`. Mettre `false` quand le lecteur est intégré dans un formulaire. */
    keyboard?: boolean
    /** QCM à proposer sur l'écran de fin (`undefined` : aucun ; tableau vide : « tu maîtrises tout »). */
    suggestions?: readonly QcmSuggestion[]
  }>(),
  { resolveMedia: undefined, closable: false, immersive: false, keyboard: true, suggestions: undefined },
)

const emit = defineEmits<{
  close: []
  complete: []
  /** Un QCM proposé sur l'écran de fin a été choisi. */
  suggest: [key: string]
  /** « Retourner à la bibliothèque » sur l'écran de fin. */
  library: []
  /**
   * Résultat d'un passage, pour le suivi : émis à la fin du QCM, ou quand il est quitté
   * après au moins une question terminée (`completed: false`).
   */
  result: [result: QcmSessionResult]
}>()

const sound = useQcmSound()
const player = useQcmPlayer(() => props.qcm, sound)
const { phase, index, total, question, selectedIndexes, triedIndexes, correctIndexes, multiple, isLast } = player

const summary = computed(() => summarizeQcm(props.qcm))
const imageUrl = computed(() => {
  const path = question.value?.image
  return path ? props.resolveMedia?.(path) : undefined
})
const resolved = computed(() => phase.value === 'correct' || phase.value === 'revealed')
const LETTERS = ['A', 'B', 'C', 'D'] as const
const inQuestion = computed(() => phase.value !== 'intro' && phase.value !== 'done' && question.value !== undefined)
const answers = computed(() =>
  correctIndexes.value.flatMap((position) => {
    const choice = question.value?.choices[position]
    const letter = LETTERS[position]
    return choice && letter ? [{ letter, text: choice.text }] : []
  }),
)
/** Nombre de bonnes réponses à cocher, seulement quand la question en demande plusieurs. */
const answerCount = computed(() => (multiple.value ? correctIndexes.value.length : 0))
/** Jusqu'à 12 questions : un segment par question. Au-delà, une barre continue. */
const segmented = computed(() => total.value <= 12)

// Le bouton principal ne bouge pas entre « Valider » et « Continuer » : un double-clic
// involontaire ne doit pas faire sauter l'explication. Le verrou ne joue que juste après
// « Valider » (passage à bonne réponse / réponse montrée), et reste court : un clic
// volontaire sur « Continuer » n'est jamais retardé, même pendant l'animation.
const DOUBLE_CLICK_GUARD_MS = 250
let lockedUntil = 0
function guarded(action: () => void): void {
  if (Date.now() < lockedUntil) return
  action()
}

/** `true` quand le passage en cours a déjà été transmis. */
let reported = false
function report(completed: boolean): void {
  if (reported || player.results.value.length === 0) return
  reported = true
  emit('result', { questions: [...player.results.value], total: total.value, completed })
}

// Un nouveau fichier remet le lecteur sur l'écran d'accueil.
watch(() => props.qcm, () => {
  reported = true
  player.restart()
})
watch(phase, (value, previous) => {
  lockedUntil = value === 'correct' || value === 'revealed' ? Date.now() + DOUBLE_CLICK_GUARD_MS : 0
  if (previous === 'intro') reported = false
  if (value === 'done') {
    report(true)
    emit('complete')
  }
})

function onKeydown(event: KeyboardEvent): void {
  if ((event.key === 'Enter' || event.key === ' ') && Date.now() < lockedUntil) return
  if (player.handleKey(event)) event.preventDefault()
}

onMounted(() => {
  // En plein écran, la page derrière ne défile pas.
  if (props.immersive) document.documentElement.classList.add('qcm-locked')
  if (props.keyboard) window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  // QCM quitté en cours de route : les questions déjà vues comptent pour le suivi.
  report(false)
  window.removeEventListener('keydown', onKeydown)
  if (props.immersive) document.documentElement.classList.remove('qcm-locked')
})
</script>

<template>
  <!--
    Le lecteur remplit exactement la place qu'on lui donne (hauteur 100 %) : rien ne défile.
    De haut en bas : barre de progression, énoncé, réponses, barre d'action.
  -->
  <div class="qcm-stage" :class="immersive ? 'qcm-screen' : ''">
    <header class="qcm-stage-column flex flex-none items-center gap-3 pt-2 pb-2 sm:pt-3">
      <button v-if="closable" type="button" class="qcm-icon-button size-11 flex-none shadow-none" aria-label="Quitter le QCM" title="Quitter le QCM" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

      <template v-if="inQuestion">
        <div
          class="flex min-w-0 flex-1 gap-1"
          role="progressbar"
          :aria-label="`Question ${index + 1} sur ${total}`"
          aria-valuemin="1"
          :aria-valuemax="total"
          :aria-valuenow="index + 1"
        >
          <template v-if="segmented">
            <span
              v-for="step in total"
              :key="step"
              class="h-3 flex-1 rounded-full border-2 border-line transition-colors duration-200"
              :class="step <= index ? 'bg-correct' : step === index + 1 ? 'bg-primary' : 'bg-sunken'"
            />
          </template>
          <span v-else class="h-3 flex-1 overflow-hidden rounded-full border-2 border-line bg-sunken">
            <span class="block h-full bg-correct transition-[width] duration-200" :style="{ width: `${((index + 1) / total) * 100}%` }" />
          </span>
        </div>
        <p class="flex-none text-base font-extrabold tabular-nums" aria-hidden="true">{{ index + 1 }}<span class="text-ink-soft"> / {{ total }}</span></p>
      </template>
      <p v-else class="min-w-0 flex-1 truncate text-base font-bold text-ink-soft">{{ qcm.meta.title }}</p>

      <QcmSoundToggle class="size-11 flex-none shadow-none" />
    </header>

    <div v-if="phase === 'intro' || phase === 'done' || !question" class="qcm-stage-column flex min-h-0 flex-1 flex-col overflow-y-auto pt-2 pb-4">
      <QcmIntroCard
        v-if="phase === 'intro'"
        class="my-auto"
        :meta="qcm.meta"
        :question-count="summary.questionCount"
        :has-images="summary.hasImages"
        :show-keys="keyboard"
        @start="player.start()"
      />
      <QcmCompletionScreen
        v-else-if="phase === 'done'"
        class="my-auto"
        :title="qcm.meta.title"
        :question-count="summary.questionCount"
        :closable="closable"
        :suggestions="suggestions"
        @restart="player.restart()"
        @close="emit('close')"
        @open="emit('suggest', $event)"
        @library="emit('library')"
      />
    </div>

    <template v-else>
      <!--
        Énoncé et réponses se partagent la hauteur selon un rapport fixe : d'une question à
        l'autre, les réponses restent au même endroit. Le défilement n'existe ici qu'en dernier
        recours (texte très long sur un très petit écran).
      -->
      <div class="qcm-stage-column flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-1 pb-3 sm:gap-5">
        <QcmQuestionCard :key="question.id" class="flex-[1_1_0]" :prompt="question.prompt" :image-url="imageUrl" :answer-count="answerCount" />
        <QcmChoiceGrid
          :key="`choices-${question.id}`"
          :class="imageUrl ? 'flex-[1_1_0]' : 'flex-[2_1_0]'"
          :dense="imageUrl !== undefined"
          :choices="question.choices"
          :selected-indexes="selectedIndexes"
          :tried-indexes="triedIndexes"
          :correct-indexes="resolved ? correctIndexes : null"
          :multiple="multiple"
          @select="player.select($event)"
        />
      </div>

      <div class="flex-none border-t-2 border-line-soft">
        <QcmAnswerDock
          :key="`dock-${question.id}`"
          class="qcm-stage-column pt-2 pb-3 sm:pt-3 sm:pb-4"
          :kind="phase === 'retry' ? 'retry' : phase === 'correct' ? 'correct' : phase === 'revealed' ? 'revealed' : 'answering'"
          :selected-letters="selectedIndexes.map((position) => LETTERS[position] ?? '')"
          :answer-count="answerCount"
          :has-tried="triedIndexes.length > 0"
          :hint="question.hint"
          :explanation="question.explanation"
          :answers="answers"
          :is-last="isLast"
          :show-keys="keyboard"
          @validate="guarded(player.validate)"
          @continue="guarded(player.next)"
          @reveal="player.reveal()"
        />
      </div>
    </template>
  </div>
</template>
