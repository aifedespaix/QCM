<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { summarizeQcm, type QcmData } from '@qcm/core'
import { useQcmPlayer } from '../composables/useQcmPlayer.ts'
import { useQcmSound } from '../composables/useQcmSound.ts'
import QcmAnswerDock from './QcmAnswerDock.vue'
import QcmChoiceGrid from './QcmChoiceGrid.vue'
import QcmCompletionScreen from './QcmCompletionScreen.vue'
import QcmIntroCard from './QcmIntroCard.vue'
import QcmQuestionCard from './QcmQuestionCard.vue'

const props = withDefaults(
  defineProps<{
    qcm: QcmData
    /** Transforme un chemin `media/x.webp` en URL affichable (protocole `qcm://`, blob:, etc.). */
    resolveMedia?: (path: string) => string | undefined
    /** Affiche « Fermer » sur l'écran de fin. */
    closable?: boolean
    /** Écoute le clavier sur `window`. Mettre `false` quand le lecteur est intégré dans un formulaire. */
    keyboard?: boolean
  }>(),
  { resolveMedia: undefined, closable: false, keyboard: true },
)

const emit = defineEmits<{
  close: []
  complete: []
}>()

const sound = useQcmSound()
const player = useQcmPlayer(() => props.qcm, sound)
const { phase, index, total, question, selectedIndex, triedIndexes, correctIndex, isLast } = player

const summary = computed(() => summarizeQcm(props.qcm))
const imageUrl = computed(() => {
  const path = question.value?.image
  return path ? props.resolveMedia?.(path) : undefined
})
const resolved = computed(() => phase.value === 'correct' || phase.value === 'revealed')
const LETTERS = ['A', 'B', 'C', 'D'] as const

// Le bouton principal ne bouge pas entre « Valider » et « Continuer » : un double-clic
// involontaire ne doit pas faire sauter l'explication. Court délai après chaque changement d'état.
let lockedUntil = 0
function guarded(action: () => void): void {
  if (Date.now() < lockedUntil) return
  action()
}

// Un nouveau fichier remet le lecteur sur l'écran d'accueil.
watch(() => props.qcm, () => player.restart())
watch(phase, (value) => {
  lockedUntil = Date.now() + 450
  if (value === 'done') emit('complete')
})

function onKeydown(event: KeyboardEvent): void {
  if ((event.key === 'Enter' || event.key === ' ') && Date.now() < lockedUntil) return
  if (player.handleKey(event)) event.preventDefault()
}

onMounted(() => {
  if (props.keyboard) window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="w-full">
    <QcmIntroCard
      v-if="phase === 'intro'"
      :meta="qcm.meta"
      :question-count="summary.questionCount"
      :has-images="summary.hasImages"
      @start="player.start()"
    />

    <QcmCompletionScreen
      v-else-if="phase === 'done'"
      :title="qcm.meta.title"
      :question-count="summary.questionCount"
      :closable="closable"
      @restart="player.restart()"
      @close="emit('close')"
    />

    <QcmQuestionCard
      v-else-if="question"
      :key="question.id"
      :index="index"
      :total="total"
      :prompt="question.prompt"
      :image-url="imageUrl"
    >
      <QcmChoiceGrid
        :choices="question.choices"
        :selected-index="selectedIndex"
        :tried-indexes="triedIndexes"
        :correct-index="resolved ? correctIndex : null"
        @select="player.select($event)"
      />

      <QcmAnswerDock
        :kind="phase === 'retry' ? 'retry' : phase === 'correct' ? 'correct' : phase === 'revealed' ? 'revealed' : 'answering'"
        :selected-letter="selectedIndex === null ? null : LETTERS[selectedIndex]"
        :has-tried="triedIndexes.length > 0"
        :hint="question.hint"
        :explanation="question.explanation"
        :is-last="isLast"
        :show-keys="keyboard"
        @validate="guarded(player.validate)"
        @continue="guarded(player.next)"
        @reveal="player.reveal()"
      />
    </QcmQuestionCard>
  </div>
</template>
