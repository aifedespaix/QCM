<script setup lang="ts">
const props = defineProps<{
  choices: readonly { text: string }[]
  selectedIndex: number | null
  /** Réponses déjà essayées : grisées et non cliquables. */
  triedIndexes: readonly number[]
  /** Si renseigné, la bonne réponse est mise en avant et toute la grille est figée. */
  correctIndex: number | null
  /** Fige la grille sans montrer la bonne réponse. */
  locked?: boolean
}>()

const emit = defineEmits<{ select: [index: number] }>()

const LETTERS = ['A', 'B', 'C', 'D'] as const
const BADGES = ['bg-badge-a', 'bg-badge-b', 'bg-badge-c', 'bg-badge-d'] as const

function isDisabled(index: number): boolean {
  return props.locked === true || props.correctIndex !== null || props.triedIndexes.includes(index)
}

function stateClass(index: number): string {
  if (props.correctIndex === index) return 'bg-correct text-correct-ink'
  if (props.triedIndexes.includes(index)) return 'border-dashed opacity-55 shadow-none'
  if (props.correctIndex !== null) return 'opacity-55 shadow-none'
  if (props.selectedIndex === index) return 'bg-selected translate-x-[2px] translate-y-[2px] shadow-block-sm'
  return ''
}
</script>

<template>
  <div role="radiogroup" aria-label="Réponses possibles" class="qcm-enter grid grid-cols-1 gap-4 sm:grid-cols-2">
    <button
      v-for="(choice, index) in choices"
      :key="index"
      type="button"
      role="radio"
      class="qcm-block w-full"
      :class="stateClass(index)"
      :aria-checked="selectedIndex === index"
      :disabled="isDisabled(index)"
      @click="emit('select', index)"
    >
      <span class="qcm-key" :class="BADGES[index]" aria-hidden="true">{{ LETTERS[index] }}</span>
      <span class="flex-1" :class="triedIndexes.includes(index) ? 'line-through decoration-2' : ''">{{ choice.text }}</span>
      <!-- Marque d'état : emplacement réservé, la réponse ne change jamais de hauteur. -->
      <span class="flex size-7 flex-none items-center justify-center" aria-hidden="true">
        <svg v-if="correctIndex === index" class="qcm-pop" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        <svg v-else-if="triedIndexes.includes(index)" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
        <span v-else-if="selectedIndex === index" class="size-3.5 rounded-full border-2 border-line bg-ink" />
      </span>
      <span v-if="correctIndex === index" class="sr-only">Bonne réponse</span>
      <span v-else-if="triedIndexes.includes(index)" class="sr-only">Déjà essayée</span>
    </button>
  </div>
</template>
