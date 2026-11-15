<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

/**
 * Barre d'action d'une question.
 *
 * Le bouton principal garde toujours la même place et la même taille : l'état (à gauche)
 * change sur place, et l'indice ou l'explication se déplie EN DESSOUS de la barre.
 * Rien de ce que l'élève vise ne bouge quand il valide.
 */
const props = withDefaults(
  defineProps<{
    /** `answering` : choix en cours. `retry` : pas encore. `correct` / `revealed` : question résolue. */
    kind: 'answering' | 'retry' | 'correct' | 'revealed'
    /** Lettre de la réponse choisie (A à D), ou `null` si rien n'est choisi. */
    selectedLetter?: string | null
    /** Au moins une réponse a déjà été essayée : l'indice reste affiché. */
    hasTried?: boolean
    hint?: string
    explanation?: string
    /** Dernière question : le bouton dit « Terminer ». */
    isLast?: boolean
    /** Affiche le rappel de la touche Entrée. */
    showKeys?: boolean
  }>(),
  { selectedLetter: null, hasTried: false, hint: undefined, explanation: undefined, isLast: false, showKeys: true },
)

const emit = defineEmits<{
  validate: []
  continue: []
  reveal: []
}>()

const resolved = computed(() => props.kind === 'correct' || props.kind === 'revealed')

const status = computed(() => {
  if (props.kind === 'correct') return { title: 'Bonne réponse.', tone: 'bg-correct text-correct-ink', icon: 'M5 12.5l4.5 4.5L19 7.5' }
  if (props.kind === 'revealed') return { title: 'Voici la réponse.', tone: 'bg-selected text-ink', icon: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z' }
  if (props.kind === 'retry') return { title: 'Pas encore.', tone: 'bg-retry text-retry-ink', icon: 'M4 12a8 8 0 1 0 2.6-5.9M4 4.5v4h4' }
  if (props.selectedLetter) return { title: `Réponse ${props.selectedLetter}`, tone: 'bg-selected text-ink', icon: '' }
  return { title: props.hasTried ? 'Choisis une autre réponse' : 'Choisis une réponse', tone: 'bg-sunken text-ink-soft', icon: '' }
})

/** Panneau déplié sous la barre : indice tant que la question n'est pas résolue, explication ensuite. */
const panel = computed(() => {
  if (resolved.value) {
    return props.explanation
      ? { label: 'Explication', text: props.explanation, tone: props.kind === 'correct' ? 'bg-correct text-correct-ink' : 'bg-selected text-ink' }
      : null
  }
  if (props.kind === 'retry' || props.hasTried) {
    return { label: 'Indice', text: props.hint || 'Relis la question, puis essaie une autre réponse.', tone: 'bg-retry text-retry-ink' }
  }
  return null
})

const canReveal = computed(() => !resolved.value && (props.kind === 'retry' || props.hasTried))

const announcement = computed(() => {
  if (props.kind === 'answering') return ''
  return [status.value.title, panel.value?.text].filter(Boolean).join(' ')
})

// Si le panneau s'ouvre sous le bord de l'écran, on l'amène doucement en vue.
const panelEl = ref<HTMLElement | null>(null)
watch(
  () => panel.value?.text,
  async (text) => {
    if (!text) return
    await nextTick()
    panelEl.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  },
)

function onPrimary(): void {
  if (resolved.value) emit('continue')
  else emit('validate')
}
</script>

<template>
  <div class="flex flex-col">
    <div class="flex flex-col gap-3 border-t-2 border-line-soft pt-5 sm:flex-row sm:items-center sm:gap-5">
      <!-- État : hauteur fixe, le texte change sur place. -->
      <div class="flex h-12 min-w-0 flex-1 items-center gap-3">
        <span
          class="flex size-12 flex-none items-center justify-center rounded-full border-2 border-line text-lg font-extrabold transition-colors duration-150"
          :class="status.tone"
          aria-hidden="true"
        >
          <svg v-if="status.icon" :key="kind" class="qcm-pop" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <path :d="status.icon" />
          </svg>
          <template v-else>{{ selectedLetter ?? '?' }}</template>
        </span>
        <p class="truncate text-xl font-extrabold" :class="kind === 'answering' && !selectedLetter ? 'text-ink-soft' : 'text-ink'">
          {{ status.title }}
        </p>
      </div>

      <!-- Action principale : toujours ici, toujours la même taille. -->
      <button
        type="button"
        class="qcm-block qcm-block-primary w-full flex-none sm:w-64"
        :disabled="!resolved && !selectedLetter"
        @click="onPrimary"
      >
        {{ resolved ? (isLast ? 'Terminer' : 'Continuer') : 'Valider' }}
        <span v-if="showKeys" class="qcm-key hidden sm:inline-flex" aria-hidden="true">Entrée</span>
        <svg v-else-if="resolved" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </div>

    <!-- Indice ou explication : se déplie sous la barre, sans rien pousser au-dessus. -->
    <div class="qcm-unfold" :class="panel ? 'qcm-unfold-open' : ''">
      <div class="min-h-0 overflow-hidden">
        <div v-if="panel" ref="panelEl" class="mt-5 rounded-2xl border-2 border-line px-5 py-4" :class="panel.tone">
          <p class="text-sm font-extrabold tracking-wide uppercase opacity-80">{{ panel.label }}</p>
          <p class="mt-1 text-lg font-medium">{{ panel.text }}</p>
          <button v-if="canReveal" type="button" class="qcm-block qcm-block-quiet qcm-block-sm mt-4" @click="emit('reveal')">
            Voir la réponse
          </button>
        </div>
      </div>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </div>
</template>
