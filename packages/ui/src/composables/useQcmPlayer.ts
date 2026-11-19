import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { correctIndexOf, correctIndexesOf, isMultipleAnswer, type QcmData, type QcmQuestion, type QuestionResult } from '@qcm/core'

/**
 * Machine à états du lecteur QCM.
 *
 *   intro ──start──▶ answering ──validate(bonne)──▶ correct ──next──▶ answering | done
 *                        │  ▲
 *        validate(autre) │  │ retry / select
 *                        ▼  │
 *                       retry ──reveal──▶ revealed ──next──▶ answering | done
 *
 * Aucun score, aucun chronomètre : une erreur mène à « retry », jamais à un échec.
 */
export type QcmPhase = 'intro' | 'answering' | 'retry' | 'correct' | 'revealed' | 'done'

export interface QcmPlayerSounds {
  playSelect?: () => void
  playCorrect?: () => void
  playSoft?: () => void
  playComplete?: () => void
}

export function useQcmPlayer(source: MaybeRefOrGetter<QcmData>, sounds: QcmPlayerSounds = {}) {
  const phase = ref<QcmPhase>('intro')
  const index = ref(0)
  /** Réponses cochées (une seule, ou plusieurs si la question a plusieurs bonnes réponses). */
  const selectedIndexes = ref<number[]>([])
  /** Mauvaises réponses déjà essayées sur la question en cours : elles restent grisées. */
  const triedIndexes = ref<number[]>([])
  /** Validations ratées sur la question en cours (pour le suivi). */
  const wrongCount = ref(0)
  /** Résultat de chaque question terminée depuis `start` (pour le suivi, jamais affiché à l'élève). */
  const results = ref<QuestionResult[]>([])

  const questions = computed<QcmQuestion[]>(() => toValue(source).questions)
  const total = computed(() => questions.value.length)
  const question = computed<QcmQuestion | undefined>(() => questions.value[index.value])
  const correctIndex = computed(() => (question.value ? correctIndexOf(question.value) : -1))
  const correctIndexes = computed(() => (question.value ? correctIndexesOf(question.value) : []))
  /** `true` si la question demande de cocher plusieurs réponses. */
  const multiple = computed(() => (question.value ? isMultipleAnswer(question.value) : false))
  /** Première réponse cochée (`null` si rien n'est coché) : pratique pour les questions à réponse unique. */
  const selectedIndex = computed(() => selectedIndexes.value[0] ?? null)
  const isLast = computed(() => index.value >= total.value - 1)

  function resetQuestion(): void {
    selectedIndexes.value = []
    triedIndexes.value = []
    wrongCount.value = 0
  }

  function start(): void {
    index.value = 0
    results.value = []
    resetQuestion()
    phase.value = 'answering'
  }

  function select(choiceIndex: number): void {
    if (phase.value !== 'answering' && phase.value !== 'retry') return
    const choices = question.value?.choices ?? []
    if (choiceIndex < 0 || choiceIndex >= choices.length) return
    if (triedIndexes.value.includes(choiceIndex)) return
    if (multiple.value) {
      // Plusieurs bonnes réponses : chaque appui coche ou décoche, dans l'ordre des réponses.
      selectedIndexes.value = selectedIndexes.value.includes(choiceIndex)
        ? selectedIndexes.value.filter((item) => item !== choiceIndex)
        : [...selectedIndexes.value, choiceIndex].sort((a, b) => a - b)
    } else {
      selectedIndexes.value = [choiceIndex]
    }
    phase.value = 'answering'
    sounds.playSelect?.()
  }

  function validate(): void {
    if (phase.value !== 'answering' || selectedIndexes.value.length === 0) return
    const expected = correctIndexes.value
    if (selectedIndexes.value.length === expected.length && selectedIndexes.value.every((item) => expected.includes(item))) {
      phase.value = 'correct'
      sounds.playCorrect?.()
      return
    }
    // Seules les réponses fausses sont grisées : une bonne réponse cochée à moitié ne se révèle jamais.
    const wrong = selectedIndexes.value.filter((item) => !expected.includes(item))
    triedIndexes.value = [...triedIndexes.value, ...wrong]
    wrongCount.value += 1
    selectedIndexes.value = []
    phase.value = 'retry'
    sounds.playSoft?.()
  }

  function retry(): void {
    if (phase.value === 'retry') phase.value = 'answering'
  }

  /** « Voir la réponse » : montre la bonne réponse, sans pénalité. */
  function reveal(): void {
    if (phase.value !== 'retry' && phase.value !== 'answering') return
    selectedIndexes.value = []
    phase.value = 'revealed'
  }

  function next(): void {
    if (phase.value !== 'correct' && phase.value !== 'revealed') return
    if (question.value) {
      results.value = [
        ...results.value,
        { id: question.value.id, wrong: wrongCount.value, revealed: phase.value === 'revealed' },
      ]
    }
    if (isLast.value) {
      phase.value = 'done'
      sounds.playComplete?.()
      return
    }
    index.value += 1
    resetQuestion()
    phase.value = 'answering'
  }

  function restart(): void {
    index.value = 0
    resetQuestion()
    phase.value = 'intro'
  }

  /** Action principale de l'écran courant (touches Entrée et Espace). */
  function primary(): void {
    switch (phase.value) {
      case 'intro':
        return start()
      case 'answering':
        return validate()
      case 'retry':
        return retry()
      case 'correct':
      case 'revealed':
        return next()
      case 'done':
        return
    }
  }

  /**
   * Raccourcis clavier : 1-4 ou A-D pour choisir, Entrée ou Espace pour l'action principale.
   * Retourne `true` si la touche a été utilisée (l'appelant fait alors `preventDefault`).
   */
  function handleKey(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return false
    const target = event.target as Element | null
    const inside = (selector: string): boolean =>
      typeof target?.closest === 'function' && target.closest(selector) !== null
    if (inside('input, textarea, select, [contenteditable="true"]')) return false

    if (event.key === 'Enter' || event.key === ' ') {
      // Un bouton qui a le focus garde son comportement natif, sauf une réponse (role="radio") :
      // après un clic sur une réponse, Entrée doit valider et non re-sélectionner.
      if (inside('button:not([role="radio"]):not([role="checkbox"]), a[href]')) return false
      if (phase.value === 'done') return false
      primary()
      return true
    }

    if (phase.value !== 'answering' && phase.value !== 'retry') return false
    const key = event.key.toLowerCase()
    const byDigit = ['1', '2', '3', '4'].indexOf(key)
    const choiceIndex = byDigit >= 0 ? byDigit : ['a', 'b', 'c', 'd'].indexOf(key)
    if (choiceIndex < 0) return false
    select(choiceIndex)
    return true
  }

  return {
    phase,
    index,
    total,
    question,
    selectedIndex,
    selectedIndexes,
    triedIndexes,
    wrongCount,
    multiple,
    correctIndexes,
    results,
    correctIndex,
    isLast,
    start,
    select,
    validate,
    retry,
    reveal,
    next,
    restart,
    primary,
    handleKey,
  }
}
