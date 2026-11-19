<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * Barre d'action d'une question, collée en bas de l'écran.
 *
 * Deux éléments, toujours à la même place et de la même taille :
 *   - un emplacement de message (consigne, indice, explication) de hauteur fixe ;
 *   - le bouton principal.
 * Quand le message est plus long que son emplacement, il grandit VERS LE HAUT, par-dessus
 * les réponses, sans rien décaler : ni les réponses, ni le bouton ne bougent.
 */
const props = withDefaults(
  defineProps<{
    /** `answering` : choix en cours. `retry` : pas encore. `correct` / `revealed` : question résolue. */
    kind: 'answering' | 'retry' | 'correct' | 'revealed'
    /** Lettres des réponses choisies (A à D) ; vide si rien n'est choisi. */
    selectedLetters?: readonly string[]
    /** Nombre de bonnes réponses à cocher quand il y en a plusieurs (`0` ou `1` : réponse unique). */
    answerCount?: number
    /** Au moins une réponse a déjà été essayée : l'indice reste affiché. */
    hasTried?: boolean
    hint?: string
    explanation?: string
    /** Bonne(s) réponse(s), rappelée(s) dans le message une fois la question résolue. */
    answers?: readonly { letter: string; text: string }[]
    /** Dernière question : le bouton dit « Terminer ». */
    isLast?: boolean
    /** Affiche les rappels de touches du clavier. */
    showKeys?: boolean
  }>(),
  { selectedLetters: () => [], answerCount: 0, hasTried: false, hint: undefined, explanation: undefined, answers: () => [], isLast: false, showKeys: true },
)

const emit = defineEmits<{
  validate: []
  continue: []
  reveal: []
}>()

const multiple = computed(() => props.answerCount > 1)
const selectedLetter = computed(() => (props.selectedLetters.length === 0 ? null : props.selectedLetters.join(' · ')))
const resolved = computed(() => props.kind === 'correct' || props.kind === 'revealed')
const hinting = computed(() => !resolved.value && (props.kind === 'retry' || props.hasTried))

const status = computed(() => {
  if (props.kind === 'correct') return { title: multiple.value ? 'Bonnes réponses.' : 'Bonne réponse.', icon: 'M5 12.5l4.5 4.5L19 7.5' }
  if (props.kind === 'revealed') return { title: 'Voici la réponse.', icon: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z' }
  if (props.kind === 'retry') return { title: 'Pas encore.', icon: 'M4 12a8 8 0 1 0 2.6-5.9M4 4.5v4h4' }
  if (multiple.value) {
    if (props.selectedLetters.length > 0) return { title: `Réponses ${selectedLetter.value} (${props.selectedLetters.length} sur ${props.answerCount})`, icon: '' }
    return { title: `Choisis ${props.answerCount} réponses`, icon: '' }
  }
  if (props.selectedLetters.length > 0) return { title: `Réponse ${props.selectedLetters[0]} choisie`, icon: '' }
  return { title: props.hasTried ? 'Choisis une autre réponse' : 'Choisis une réponse', icon: '' }
})

/** Texte du message : explication une fois résolu, indice après un essai, consigne sinon. */
const message = computed(() => {
  if (resolved.value) return props.explanation ?? ''
  if (hinting.value) return props.hint || 'Relis la question, puis essaie une autre réponse.'
  return ''
})

/** Consigne tant que rien n'est joué : version tactile, et version clavier sur grand écran. */
const guide = computed(() => {
  if (resolved.value || hinting.value) return null
  if (multiple.value) {
    if (props.selectedLetters.length > 0) return { touch: 'Touche une réponse pour la décocher, puis valide.', keys: 'Touche une réponse pour la décocher. Entrée pour valider.' }
    return { touch: 'Touche toutes les bonnes réponses, puis valide.', keys: 'Touches A, B, C, D pour cocher, puis Entrée.' }
  }
  if (props.selectedLetters.length > 0) return { touch: 'Tu peux encore changer, puis valider.', keys: 'Tu peux encore changer. Entrée pour valider.' }
  return { touch: 'Touche une réponse, puis valide.', keys: 'Touches A, B, C, D pour choisir, puis Entrée.' }
})

const tone = computed(() => {
  if (props.kind === 'correct') return 'border-line bg-correct text-correct-ink'
  if (props.kind === 'revealed') return 'border-line bg-selected text-ink'
  if (hinting.value) return 'border-line bg-retry text-retry-ink'
  return 'border-transparent text-ink'
})

const announcement = computed(() => {
  if (props.kind === 'answering') return ''
  const answer = resolved.value ? props.answers.map((item) => `Réponse ${item.letter} : ${item.text}.`).join(' ') : ''
  return [status.value.title, answer, message.value].filter(Boolean).join(' ')
})

// Un indice est replié sur deux lignes : les réponses restent visibles pour réessayer.
// L'explication, elle, s'ouvre en entier : la question est finie, c'est elle qu'on lit.
const expanded = ref(false)
const truncated = ref(false)
const bodyEl = ref<HTMLElement | null>(null)
const open = computed(() => resolved.value || expanded.value)

function measure(): void {
  const el = bodyEl.value
  if (!el || open.value) return
  truncated.value = el.scrollHeight > el.clientHeight + 2
}

watch(
  () => [props.kind, message.value],
  async () => {
    expanded.value = false
    truncated.value = false
    await nextTick()
    measure()
  },
)

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => window.removeEventListener('resize', measure))

function onPrimary(): void {
  if (resolved.value) emit('continue')
  else emit('validate')
}
</script>

<template>
  <div class="relative z-10 flex flex-col gap-2 sm:flex-row sm:gap-4">
    <!-- Emplacement du message : hauteur fixe. Le cadre est ancré en bas et grandit vers le haut. -->
    <div class="relative h-[5.25rem] min-w-0 flex-none sm:flex-1">
      <div
        class="absolute inset-x-0 bottom-0 flex max-h-[min(22rem,58dvh)] min-h-full flex-col rounded-2xl border-2 px-3 py-2 transition-colors duration-150"
        :class="[tone, open && (resolved || truncated) ? 'shadow-block' : '']"
      >
        <div class="flex h-8 flex-none items-center gap-2">
          <span
            class="flex size-7 flex-none items-center justify-center rounded-full border-2 border-line text-sm font-extrabold"
            :class="!resolved && !hinting ? (selectedLetter ? 'bg-selected' : 'bg-sunken text-ink-soft') : 'bg-surface text-ink'"
            aria-hidden="true"
          >
            <svg v-if="status.icon" :key="kind" class="qcm-pop" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path :d="status.icon" />
            </svg>
            <template v-else>{{ multiple ? (selectedLetters.length || '?') : (selectedLetter ?? '?') }}</template>
          </span>
          <p class="min-w-0 flex-1 truncate text-lg leading-none font-extrabold">{{ status.title }}</p>
          <button v-if="hinting" type="button" class="qcm-dock-link" @click="emit('reveal')">Voir la réponse</button>
        </div>

        <div
          ref="bodyEl"
          class="min-h-0 text-[0.95rem] leading-[1.3] font-medium"
          :class="[open ? 'overflow-y-auto' : 'line-clamp-2', !resolved && !hinting ? 'text-ink-soft' : '', expanded ? 'pb-8' : '']"
        >
          <p v-for="item in resolved ? answers : []" :key="item.letter" class="mb-1 flex items-center gap-2 font-extrabold">
            <span class="flex size-6 flex-none items-center justify-center rounded-lg border-2 border-line bg-surface text-xs text-ink" aria-hidden="true">{{ item.letter }}</span>
            <span class="min-w-0 break-words">{{ item.text }}</span>
          </p>
          <p v-if="guide">
            <span :class="showKeys ? 'sm:hidden' : ''">{{ guide.touch }}</span>
            <span v-if="showKeys" class="hidden sm:inline">{{ guide.keys }}</span>
          </p>
          <p v-else>{{ message }}</p>
        </div>

        <!-- Indice plus long que deux lignes : un appui l'ouvre en entier, par-dessus les réponses. -->
        <button
          v-if="hinting && (truncated || expanded)"
          type="button"
          class="qcm-dock-link absolute right-2 bottom-[0.45rem] h-[1.35rem] gap-1 border-0 bg-retry pr-0 pl-1.5 text-retry-ink underline shadow-[-0.75rem_0_0.5rem_var(--qcm-retry)]"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Replier' : 'Lire tout' }}
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path :d="expanded ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Action principale : toujours ici, toujours la même taille. -->
    <button
      type="button"
      class="qcm-block qcm-block-primary min-h-14 w-full flex-none text-xl sm:w-60"
      :disabled="!resolved && !selectedLetter"
      @click="onPrimary"
    >
      {{ resolved ? (isLast ? 'Terminer' : 'Continuer') : 'Valider' }}
      <span v-if="showKeys" class="qcm-key hidden text-base sm:inline-flex" aria-hidden="true">Entrée</span>
      <svg v-else-if="resolved" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </button>

    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </div>
</template>
