<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  choices: readonly { text: string }[]
  selectedIndex: number | null
  /** Réponses déjà essayées : grisées et non cliquables. */
  triedIndexes: readonly number[]
  /** Si renseigné, la bonne réponse est mise en avant et toute la grille est figée. */
  correctIndex: number | null
  /** Fige la grille sans montrer la bonne réponse. */
  locked?: boolean
  /** Place comptée (question avec image) : chaque rangée prend sa hauteur, sans s'aligner sur la plus haute. */
  dense?: boolean
}>()

const emit = defineEmits<{ select: [index: number] }>()

const LETTERS = ['A', 'B', 'C', 'D'] as const
const BADGES = ['bg-badge-a', 'bg-badge-b', 'bg-badge-c', 'bg-badge-d'] as const

/**
 * Réponses courtes (un mot, un nombre) : deux colonnes même sur téléphone, pour laisser
 * la place à l'énoncé et à l'image. Réponses longues : une colonne, lecture ligne à ligne.
 */
const compact = computed(() => props.choices.every((choice) => choice.text.length <= 14))

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
  <!-- Rangées de même hauteur qui se partagent toute la place donnée par le lecteur. -->
  <div
    role="radiogroup"
    aria-label="Réponses possibles"
    class="qcm-enter grid gap-2.5 sm:auto-rows-fr sm:grid-cols-2 sm:gap-4"
    :class="[compact ? 'grid-cols-2' : 'grid-cols-1', dense && !compact ? 'auto-rows-auto' : 'auto-rows-fr']"
  >
    <button
      v-for="(choice, index) in choices"
      :key="index"
      type="button"
      role="radio"
      class="qcm-block qcm-choice relative w-full"
      :class="stateClass(index)"
      :aria-checked="selectedIndex === index"
      :disabled="isDisabled(index)"
      @click="emit('select', index)"
    >
      <span class="qcm-key" :class="BADGES[index]" aria-hidden="true">{{ LETTERS[index] }}</span>
      <span class="min-w-0 flex-1 break-words" :class="triedIndexes.includes(index) ? 'line-through decoration-2' : ''">{{ choice.text }}</span>
      <!-- Marque d'état posée sur le coin : elle ne prend aucune place, le texte ne bouge pas. -->
      <span
        v-if="correctIndex === index || triedIndexes.includes(index) || selectedIndex === index"
        class="qcm-pop absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border-2 border-line bg-surface text-ink"
        aria-hidden="true"
      >
        <svg v-if="correctIndex === index" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        <svg v-else-if="triedIndexes.includes(index)" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
        <span v-else class="size-3 rounded-full bg-ink" />
      </span>
      <span v-if="correctIndex === index" class="sr-only">Bonne réponse</span>
      <span v-else-if="triedIndexes.includes(index)" class="sr-only">Déjà essayée</span>
    </button>
  </div>
</template>
