<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** `correct` : bonne réponse. `retry` : pas encore. `revealed` : la réponse est montrée. */
  kind: 'correct' | 'retry' | 'revealed'
  /** Explication (correct, revealed) ou indice (retry). */
  text?: string
  /** Dernière question : le bouton dit « Terminer ». */
  isLast?: boolean
}>()

const emit = defineEmits<{
  continue: []
  retry: []
  reveal: []
}>()

const title = computed(() => {
  if (props.kind === 'correct') return 'Bonne réponse.'
  if (props.kind === 'retry') return 'Pas encore.'
  return 'Voici la bonne réponse.'
})

const tone = computed(() =>
  props.kind === 'retry' ? 'bg-retry text-retry-ink' : props.kind === 'correct' ? 'bg-correct text-correct-ink' : 'bg-selected text-ink',
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div role="status" aria-live="polite" class="rounded-2xl border-2 border-line px-5 py-4" :class="tone">
      <p class="text-xl font-extrabold">{{ title }}</p>
      <p v-if="text" class="mt-1 text-lg font-medium">{{ text }}</p>
      <p v-else-if="kind === 'retry'" class="mt-1 text-lg font-medium">Tu peux essayer une autre réponse.</p>
    </div>

    <div v-if="kind === 'retry'" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <button type="button" class="qcm-block qcm-block-primary" @click="emit('retry')">
        Réessayer
        <span class="qcm-key" aria-hidden="true">Entrée</span>
      </button>
      <button type="button" class="qcm-block qcm-block-quiet" @click="emit('reveal')">Voir la réponse</button>
    </div>
    <button v-else type="button" class="qcm-block qcm-block-primary w-full" @click="emit('continue')">
      {{ isLast ? 'Terminer' : 'Continuer' }}
      <span class="qcm-key" aria-hidden="true">Entrée</span>
    </button>
  </div>
</template>
