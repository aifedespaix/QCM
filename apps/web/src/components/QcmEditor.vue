<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  LEVELS,
  LEVEL_LABELS,
  LIMITS,
  QCM_AI_PROMPT,
  QcmFormatError,
  SUBJECTS,
  SUBJECT_LABELS,
  aiCorrectionMessage,
  readQcmArchive,
  type QcmData,
} from '@qcm/core'
import { QcmPlayer } from '@qcm/ui'
import {
  addChoice,
  addQuestion,
  buildQcm,
  createDraft,
  draftMediaResolver,
  draftToData,
  draftToText,
  duplicateQuestion,
  isDraftEmpty,
  loadArchiveIntoDraft,
  loadTextIntoDraft,
  metaIssues,
  moveQuestion,
  questionIssues,
  removeChoice,
  removeQuestion,
  removeQuestionImage,
  setQuestionImage,
  type DraftQuestion,
} from '../lib/editorDraft.ts'
import { publishQcm, saveQcmLocally, useAuth } from '../lib/pb.ts'

const LETTERS = ['A', 'B', 'C', 'D'] as const
const BADGES = ['bg-badge-a', 'bg-badge-b', 'bg-badge-c', 'bg-badge-d'] as const

type StepId = 'start' | 'meta' | 'questions' | 'finish'
const STEPS: readonly { id: StepId; label: string; title: string }[] = [
  { id: 'start', label: 'Départ', title: 'Comment veux-tu commencer ?' },
  { id: 'meta', label: 'Informations', title: 'Les informations du QCM' },
  { id: 'questions', label: 'Questions', title: 'Les questions' },
  { id: 'finish', label: 'Finaliser', title: 'Vérifier et terminer' },
]
type StartMode = 'blank' | 'text' | 'file'

const { user, loginWithGoogle } = useAuth()
const draft = createDraft()
const resolveMedia = draftMediaResolver(draft)

const step = ref<StepId>('start')
const startMode = ref<StartMode>('blank')
/** Index de la question affichée à l'étape « Questions ». */
const current = ref(0)
const summaryOpen = ref(false)
const stepHeading = ref<HTMLElement | null>(null)

const preview = shallowRef<QcmData | null>(null)
const problems = ref<string[]>([])
const notice = ref('')
const publishedId = ref('')
const busy = ref(false)
/** `true` juste après un enregistrement ou une publication : quitter la page ne perd rien. */
const saved = ref(false)

const pastedText = ref('')
const importProblems = ref<string[]>([])
const promptVisible = ref(false)
const copied = ref('')
const dragKey = ref<number | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

const stepIndex = computed(() => STEPS.findIndex((item) => item.id === step.value))
const activeStep = computed(() => STEPS[stepIndex.value] ?? STEPS[0]!)
const question = computed(() => draft.questions[current.value] ?? draft.questions[0]!)
const infoIssues = computed(() => metaIssues(draft))
const issuesByQuestion = computed(() => draft.questions.map((item) => questionIssues(item)))
const readyCount = computed(() => issuesByQuestion.value.filter((issues) => issues.length === 0).length)
const allReady = computed(() => infoIssues.value.length === 0 && readyCount.value === draft.questions.length)
const hasImages = computed(() => draft.questions.some((item) => item.image))

const questionChecks = computed(() => {
  const item = question.value
  const texts = item.choices.map((choice) => choice.text.trim().toLocaleLowerCase('fr'))
  return [
    { label: 'Énoncé', ok: !!item.prompt.trim() },
    { label: 'Réponses remplies et différentes', ok: texts.every(Boolean) && new Set(texts).size === texts.length },
    { label: 'Explication', ok: !!item.explanation.trim() },
  ]
})

function stepDone(id: StepId): boolean {
  if (id === 'start') return stepIndex.value > 0
  if (id === 'meta') return infoIssues.value.length === 0
  if (id === 'questions') return readyCount.value === draft.questions.length
  return saved.value
}

function goStep(id: StepId): void {
  step.value = id
  summaryOpen.value = false
  problems.value = []
  if (id !== 'finish') notice.value = ''
  void nextTick(() => {
    stepHeading.value?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
  })
}

function goQuestion(index: number): void {
  current.value = Math.min(Math.max(0, index), draft.questions.length - 1)
  goStep('questions')
}

function shiftStep(direction: -1 | 1): void {
  const target = STEPS[stepIndex.value + direction]
  if (target) goStep(target.id)
}

// ---------------------------------------------------------------- Questions

function appendQuestion(): void {
  const index = addQuestion(draft)
  if (index >= 0) goQuestion(index)
}

function duplicateCurrent(): void {
  const index = duplicateQuestion(draft, current.value)
  if (index >= 0) current.value = index
}

function moveCurrent(direction: -1 | 1): void {
  const target = current.value + direction
  if (target < 0 || target >= draft.questions.length) return
  moveQuestion(draft, current.value, direction)
  current.value = target
}

function removeCurrent(): void {
  const item = question.value
  const filled = item.prompt.trim() || item.explanation.trim() || item.image || item.choices.some((choice) => choice.text.trim())
  if (filled && !window.confirm(`Supprimer la question ${current.value + 1} ?`)) return
  removeQuestion(draft, current.value)
  current.value = Math.min(current.value, draft.questions.length - 1)
}

async function attachImage(target: DraftQuestion, file: File | undefined): Promise<void> {
  dragKey.value = null
  if (!file) return
  problems.value = []
  try {
    await setQuestionImage(draft, target, file, file.name)
  } catch (error) {
    report(error)
  }
}

function onImageInput(target: DraftQuestion, event: Event): void {
  const input = event.target as HTMLInputElement
  void attachImage(target, input.files?.[0])
  input.value = ''
}

// ---------------------------------------------------------------- Import

function confirmReplace(): boolean {
  return isDraftEmpty(draft) || window.confirm('Remplacer le QCM en cours par celui que tu importes ?')
}

function afterImport(): void {
  const count = draft.questions.length
  current.value = 0
  pastedText.value = ''
  importProblems.value = []
  goStep('meta')
  notice.value = `${count === 1 ? '1 question importée' : `${count} questions importées`}. Vérifie les informations, puis relis les questions.`
}

function importText(): void {
  importProblems.value = []
  if (!pastedText.value.trim()) {
    importProblems.value = ['Colle d\'abord le texte du QCM dans la zone ci-dessus.']
    return
  }
  if (!confirmReplace()) return
  try {
    loadTextIntoDraft(draft, pastedText.value)
    afterImport()
  } catch (error) {
    importProblems.value =
      error instanceof QcmFormatError ? (error.details.length > 0 ? error.details : [error.message]) : ['Ce texte ne peut pas être lu.']
  }
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !confirmReplace()) return
  importProblems.value = []
  try {
    loadArchiveIntoDraft(draft, readQcmArchive(new Uint8Array(await file.arrayBuffer())))
    afterImport()
  } catch (error) {
    importProblems.value = error instanceof QcmFormatError ? [error.message, ...error.details] : ['Ce fichier ne peut pas être ouvert.']
  }
}

async function copy(id: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = id
  } catch {
    copied.value = ''
    promptVisible.value = true
    problems.value = ['La copie automatique est bloquée par le navigateur. Sélectionne le texte et copie-le à la main.']
  }
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (copied.value = ''), 2500)
}

// ---------------------------------------------------------------- Terminer

function report(error: unknown): void {
  notice.value = ''
  if (error instanceof QcmFormatError) {
    problems.value = error.details.length > 0 ? error.details : [error.message]
  } else {
    problems.value = ['Une erreur est survenue. Tu peux réessayer.']
  }
}

function attempt<T>(action: () => T): T | undefined {
  problems.value = []
  try {
    return action()
  } catch (error) {
    report(error)
    return undefined
  }
}

function showPreview(): void {
  const data = attempt(() => draftToData(draft))
  if (data) preview.value = data
}

function exportFile(): void {
  const built = attempt(() => buildQcm(draft))
  if (!built) return
  saveQcmLocally(built.bytes, built.data.meta.title)
  publishedId.value = ''
  notice.value = 'Le fichier .qcm est enregistré dans tes téléchargements.'
  void nextTick(() => (saved.value = true))
}

function copyText(): void {
  const text = attempt(() => draftToText(draft))
  if (text) void copy('yaml', text)
}

async function publish(): Promise<void> {
  const built = attempt(() => buildQcm(draft))
  if (!built) return
  busy.value = true
  try {
    const record = await publishQcm(built)
    publishedId.value = record.id
    notice.value =
      record.status === 'published'
        ? 'Ton QCM est publié dans la bibliothèque.'
        : 'Ton QCM est envoyé. Il apparaîtra dans la bibliothèque après validation.'
    saved.value = true
  } catch (error) {
    if (error instanceof QcmFormatError) report(error)
    else problems.value = ['La publication n\'a pas abouti. Vérifie ta connexion, puis réessaie.']
  } finally {
    busy.value = false
  }
}

function login(): void {
  loginWithGoogle().catch(() => {
    problems.value = ['La connexion n\'a pas abouti.']
  })
}

watch(draft, () => (saved.value = false), { deep: true })

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!saved.value && !isDraftEmpty(draft)) event.preventDefault()
}

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <div v-if="preview" class="flex flex-col gap-5">
    <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm self-start" @click="preview = null">← Revenir à l'éditeur</button>
    <QcmPlayer :qcm="preview" :resolve-media="resolveMedia" closable @close="preview = null" />
  </div>

  <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
    <div class="flex min-w-0 flex-col gap-5">
      <!-- Fil d'étapes -->
      <nav aria-label="Étapes de création">
        <ol class="grid grid-cols-4 gap-2">
          <li v-for="(item, index) in STEPS" :key="item.id">
            <button
              type="button"
              class="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 px-1 py-2.5 text-center transition-colors sm:flex-row sm:justify-center sm:gap-2.5 sm:px-3"
              :class="step === item.id ? 'border-line bg-surface shadow-block-sm' : 'border-transparent hover:bg-sunken'"
              :aria-current="step === item.id ? 'step' : undefined"
              @click="goStep(item.id)"
            >
              <span
                class="flex size-8 flex-none items-center justify-center rounded-full border-2 border-line text-sm font-extrabold"
                :class="stepDone(item.id) ? 'bg-correct text-correct-ink' : step === item.id ? 'bg-primary' : 'bg-surface'"
                aria-hidden="true"
              >
                <svg v-if="stepDone(item.id)" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                <template v-else>{{ index + 1 }}</template>
              </span>
              <span class="text-sm font-bold sm:text-base">{{ item.label }}</span>
              <span class="sr-only">{{ stepDone(item.id) ? '(terminé)' : '' }}</span>
            </button>
          </li>
        </ol>
      </nav>

      <section class="qcm-panel flex flex-col gap-6 p-5 sm:p-8" :aria-labelledby="`step-${step}`">
        <header>
          <p class="text-sm font-bold text-ink-soft">Étape {{ stepIndex + 1 }} sur {{ STEPS.length }}</p>
          <h2 :id="`step-${step}`" ref="stepHeading" tabindex="-1" class="text-2xl font-extrabold outline-none sm:text-3xl">{{ activeStep.title }}</h2>
        </header>

        <p v-if="notice && step !== 'finish'" role="status" class="qcm-note qcm-note-correct">{{ notice }}</p>

        <!-- ───────────── Étape 1 : départ ───────────── -->
        <template v-if="step === 'start'">
          <div role="radiogroup" aria-label="Point de départ" class="grid gap-3 sm:grid-cols-3">
            <button
              v-for="option in [
                { id: 'blank', title: 'Partir de zéro', text: 'Tu écris tes questions une par une.', tone: 'bg-badge-a' },
                { id: 'text', title: 'Coller un texte', text: 'Un QCM rédigé par un assistant IA.', tone: 'bg-badge-d' },
                { id: 'file', title: 'Ouvrir un fichier .qcm', text: 'Pour modifier un QCM existant.', tone: 'bg-badge-b' },
              ] as const"
              :key="option.id"
              type="button"
              role="radio"
              :aria-checked="startMode === option.id"
              class="flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-4 text-left transition-colors"
              :class="startMode === option.id ? 'border-line bg-selected shadow-block-sm' : 'border-line-soft bg-surface hover:border-ink-soft'"
              @click="startMode = option.id"
            >
              <span class="qcm-tile size-11" :class="option.tone" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path v-if="option.id === 'blank'" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
                  <path v-else-if="option.id === 'text'" d="M9 4h6v3H9zM9 5.5H6V20h12V5.5h-3M9 11h6M9 15h4" />
                  <path v-else d="M4 7V5h6l2 2h8v12H4V7z" />
                </svg>
              </span>
              <span class="text-lg font-extrabold">{{ option.title }}</span>
              <span class="text-sm font-medium text-ink-soft">{{ option.text }}</span>
            </button>
          </div>

          <p v-if="startMode === 'blank'" class="text-lg text-ink-soft">
            Trois étapes t'attendent : les informations, les questions, puis la vérification. Le sommaire reste affiché pour savoir où tu en es.
          </p>

          <div v-else-if="startMode === 'text'" class="flex flex-col gap-5">
            <div class="rounded-2xl border-2 border-line-soft bg-bg p-4 sm:p-5">
              <h3 class="flex items-center gap-3 text-lg font-extrabold"><span class="qcm-key size-8 min-w-8 bg-surface text-sm">1</span>Demande le QCM à ton assistant IA</h3>
              <p class="mt-2 text-ink-soft">
                Copie ce prompt dans ChatGPT, Claude, Mistral ou un autre assistant, puis colle ton cours à la suite. L'assistant répond avec un texte au bon format.
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" class="qcm-block qcm-block-primary qcm-block-sm" @click="copy('prompt', QCM_AI_PROMPT)">
                  {{ copied === 'prompt' ? 'Prompt copié ✓' : 'Copier le prompt' }}
                </button>
                <button type="button" class="qcm-text-button" :aria-expanded="promptVisible" @click="promptVisible = !promptVisible">
                  {{ promptVisible ? 'Masquer le prompt' : 'Lire le prompt' }}
                </button>
              </div>
              <pre v-if="promptVisible" tabindex="0" class="mt-3 max-h-72 overflow-auto rounded-xl border-2 border-line-soft bg-surface p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">{{ QCM_AI_PROMPT }}</pre>
            </div>

            <div class="rounded-2xl border-2 border-line-soft bg-bg p-4 sm:p-5">
              <h3 class="flex items-center gap-3 text-lg font-extrabold"><span class="qcm-key size-8 min-w-8 bg-surface text-sm">2</span>Colle sa réponse ici</h3>
              <label class="sr-only" for="import-text">Texte du QCM</label>
              <textarea
                id="import-text"
                v-model="pastedText"
                class="qcm-field mt-3 font-mono text-sm"
                rows="9"
                spellcheck="false"
                placeholder="version: 1&#10;meta:&#10;  title: &quot;Les fractions égales&quot;&#10;  subject: maths&#10;  …"
              />
              <div v-if="importProblems.length > 0" role="alert" class="qcm-note qcm-note-retry mt-3">
                <p class="font-extrabold">Ce texte n'est pas encore au bon format :</p>
                <ul class="mt-1 list-disc pl-6 text-sm font-medium break-words">
                  <li v-for="problem in importProblems.slice(0, 12)" :key="problem">{{ problem }}</li>
                </ul>
                <button type="button" class="qcm-text-button mt-2 underline" @click="copy('fix', aiCorrectionMessage(importProblems))">
                  {{ copied === 'fix' ? 'Message copié ✓' : 'Copier le message de correction pour l\'assistant' }}
                </button>
              </div>
              <button type="button" class="qcm-block qcm-block-primary mt-4 w-full sm:w-fit sm:px-8" @click="importText">Importer ce texte</button>
            </div>
          </div>

          <div v-else class="flex flex-col gap-3">
            <label
              for="import-file"
              class="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink-soft bg-bg px-5 py-10 text-center hover:bg-sunken"
            >
              <span class="text-lg font-extrabold">Choisir un fichier .qcm</span>
              <span class="text-sm font-medium text-ink-soft">Ses questions et ses images sont chargées dans l'éditeur.</span>
            </label>
            <input id="import-file" class="sr-only" type="file" accept=".qcm,application/zip" @change="importFile" />
            <div v-if="importProblems.length > 0" role="alert" class="qcm-note qcm-note-retry">
              <p v-for="problem in importProblems.slice(0, 6)" :key="problem">{{ problem }}</p>
            </div>
          </div>
        </template>

        <!-- ───────────── Étape 2 : informations ───────────── -->
        <div v-else-if="step === 'meta'" class="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="qcm-label" for="meta-title">Titre <span class="qcm-label-aside">{{ draft.title.length }} / {{ LIMITS.title }}</span></label>
            <input id="meta-title" v-model="draft.title" class="qcm-field text-lg" :maxlength="LIMITS.title" placeholder="Exemple : Les fractions égales" />
          </div>
          <div>
            <label class="qcm-label" for="meta-subject">Matière</label>
            <select id="meta-subject" v-model="draft.subject" class="qcm-field">
              <option v-for="subject in SUBJECTS" :key="subject" :value="subject">{{ SUBJECT_LABELS[subject] }}</option>
            </select>
          </div>
          <div>
            <label class="qcm-label" for="meta-level">Niveau</label>
            <select id="meta-level" v-model="draft.level" class="qcm-field">
              <option v-for="level in LEVELS" :key="level" :value="level">{{ LEVEL_LABELS[level] }}</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="qcm-label" for="meta-chapter">Chapitre <span class="qcm-label-aside">{{ draft.chapter.length }} / {{ LIMITS.chapter }}</span></label>
            <input id="meta-chapter" v-model="draft.chapter" class="qcm-field" :maxlength="LIMITS.chapter" placeholder="Exemple : Chapitre 4 — Fractions" />
          </div>
          <div class="sm:col-span-2">
            <label class="qcm-label" for="meta-description">Description <span class="qcm-label-aside">facultatif · {{ draft.description.length }} / {{ LIMITS.description }}</span></label>
            <textarea id="meta-description" v-model="draft.description" class="qcm-field" rows="2" :maxlength="LIMITS.description" placeholder="Une phrase qui dit ce que l'élève va revoir." />
          </div>
          <div class="sm:col-span-2">
            <label class="qcm-label" for="meta-author">Auteur <span class="qcm-label-aside">facultatif</span></label>
            <input id="meta-author" v-model="draft.author" class="qcm-field" :maxlength="LIMITS.author" />
          </div>
        </div>

        <!-- ───────────── Étape 3 : questions ───────────── -->
        <template v-else-if="step === 'questions'">
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sunken px-3 py-2">
            <div class="flex items-center gap-1">
              <button type="button" class="qcm-text-button" :disabled="current === 0" aria-label="Question précédente" @click="current -= 1">←</button>
              <p class="px-1 text-base font-extrabold" aria-live="polite">Question {{ current + 1 }} sur {{ draft.questions.length }}</p>
              <button type="button" class="qcm-text-button" :disabled="current === draft.questions.length - 1" aria-label="Question suivante" @click="current += 1">→</button>
            </div>
            <div class="flex flex-wrap items-center">
              <button type="button" class="qcm-text-button" :disabled="current === 0" @click="moveCurrent(-1)">Monter</button>
              <button type="button" class="qcm-text-button" :disabled="current === draft.questions.length - 1" @click="moveCurrent(1)">Descendre</button>
              <button type="button" class="qcm-text-button" :disabled="draft.questions.length >= LIMITS.maxQuestions" @click="duplicateCurrent">Dupliquer</button>
              <button type="button" class="qcm-text-button" :disabled="draft.questions.length <= 1" @click="removeCurrent">Supprimer</button>
            </div>
          </div>

          <div :key="question.key" class="flex flex-col gap-5">
            <div>
              <label class="qcm-label" :for="`prompt-${question.key}`">Énoncé de la question <span class="qcm-label-aside">{{ question.prompt.length }} / {{ LIMITS.prompt }}</span></label>
              <textarea :id="`prompt-${question.key}`" v-model="question.prompt" class="qcm-field text-lg" rows="2" :maxlength="LIMITS.prompt" placeholder="Une seule idée, une phrase courte." />
            </div>

            <fieldset class="flex flex-col gap-2.5">
              <legend class="qcm-label w-full">Réponses <span class="qcm-label-aside">coche la bonne réponse</span></legend>
              <div
                v-for="(choice, choiceIndex) in question.choices"
                :key="choiceIndex"
                class="flex items-center gap-2 rounded-2xl border-2 p-1.5 pr-2 transition-colors sm:gap-3"
                :class="question.correctIndex === choiceIndex ? 'border-line bg-correct' : 'border-transparent'"
              >
                <label class="flex size-11 flex-none cursor-pointer items-center justify-center" :title="`La réponse ${LETTERS[choiceIndex]} est la bonne`">
                  <input
                    v-model="question.correctIndex"
                    type="radio"
                    class="size-6 cursor-pointer accent-[var(--qcm-correct-ink)]"
                    :name="`correct-${question.key}`"
                    :value="choiceIndex"
                    :aria-label="`La réponse ${LETTERS[choiceIndex]} est la bonne`"
                  />
                </label>
                <span class="qcm-key hidden sm:inline-flex" :class="BADGES[choiceIndex]" aria-hidden="true">{{ LETTERS[choiceIndex] }}</span>
                <input
                  v-model="choice.text"
                  class="qcm-field"
                  :maxlength="LIMITS.choiceText"
                  :placeholder="`Réponse ${LETTERS[choiceIndex]}`"
                  :aria-label="`Texte de la réponse ${LETTERS[choiceIndex]}`"
                />
                <button
                  type="button"
                  class="qcm-text-button flex-none"
                  :disabled="question.choices.length <= LIMITS.minChoices"
                  :aria-label="`Retirer la réponse ${LETTERS[choiceIndex]}`"
                  title="Retirer cette réponse"
                  @click="removeChoice(question, choiceIndex)"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              <button v-if="question.choices.length < LIMITS.maxChoices" type="button" class="qcm-text-button self-start underline" @click="addChoice(question)">
                + Ajouter une réponse
              </button>
            </fieldset>

            <div>
              <label class="qcm-label" :for="`explanation-${question.key}`">
                Explication de la bonne réponse <span class="qcm-label-aside">{{ question.explanation.length }} / {{ LIMITS.explanation }}</span>
              </label>
              <textarea :id="`explanation-${question.key}`" v-model="question.explanation" class="qcm-field" rows="2" :maxlength="LIMITS.explanation" placeholder="Une à trois phrases qui disent pourquoi c'est la bonne réponse." />
            </div>

            <div class="grid gap-5 sm:grid-cols-2">
              <div>
                <label class="qcm-label" :for="`hint-${question.key}`">Indice après une erreur <span class="qcm-label-aside">facultatif</span></label>
                <textarea :id="`hint-${question.key}`" v-model="question.hint" class="qcm-field" rows="3" :maxlength="LIMITS.hint" placeholder="Un rappel qui aide sans donner la réponse." />
              </div>
              <div>
                <p class="qcm-label">Image <span class="qcm-label-aside">facultatif</span></p>
                <div
                  class="flex min-h-[6.5rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-center transition-colors"
                  :class="dragKey === question.key ? 'border-line bg-selected' : 'border-ink-soft/60 bg-bg'"
                  @dragover.prevent="dragKey = question.key"
                  @dragleave="dragKey = null"
                  @drop.prevent="attachImage(question, $event.dataTransfer?.files[0])"
                >
                  <template v-if="question.image">
                    <img :src="question.image.url" alt="Aperçu de l'image" class="max-h-40 rounded-lg border-2 border-line object-contain" />
                    <button type="button" class="qcm-text-button underline" @click="removeQuestionImage(question)">Retirer l'image</button>
                  </template>
                  <template v-else>
                    <label :for="`image-${question.key}`" class="qcm-text-button cursor-pointer underline">Choisir une image</label>
                    <span class="text-sm font-medium text-ink-soft">ou dépose-la ici</span>
                    <input :id="`image-${question.key}`" class="sr-only" type="file" accept="image/*" @change="onImageInput(question, $event)" />
                  </template>
                </div>
              </div>
            </div>

            <ul class="flex flex-wrap gap-2" aria-label="État de cette question">
              <li
                v-for="check in questionChecks"
                :key="check.label"
                class="qcm-chip"
                :class="check.ok ? 'bg-correct text-correct-ink' : 'bg-sunken text-ink-soft'"
              >
                <span aria-hidden="true">{{ check.ok ? '✓' : '○' }}</span>
                {{ check.label }}
                <span class="sr-only">{{ check.ok ? ': fait' : ': à compléter' }}</span>
              </li>
            </ul>
          </div>

          <div v-if="problems.length > 0" role="alert" class="qcm-note qcm-note-retry">
            <p v-for="problem in problems" :key="problem">{{ problem }}</p>
          </div>

          <div class="flex flex-wrap gap-3 border-t-[1.5px] border-line-soft pt-5">
            <button v-if="current < draft.questions.length - 1" type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="current += 1">
              Question suivante →
            </button>
            <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" :disabled="draft.questions.length >= LIMITS.maxQuestions" @click="appendQuestion">
              + Ajouter une question
            </button>
          </div>
        </template>

        <!-- ───────────── Étape 4 : finaliser ───────────── -->
        <template v-else>
          <div v-if="allReady" class="qcm-note qcm-note-correct">
            <p class="text-lg font-extrabold">Tout est prêt.</p>
            <p class="font-medium">
              « {{ draft.title }} » · {{ draft.questions.length === 1 ? '1 question' : `${draft.questions.length} questions` }} ·
              {{ hasImages ? 'avec images' : 'sans image' }}
            </p>
          </div>
          <div v-else class="qcm-note qcm-note-retry">
            <p class="text-lg font-extrabold">Il reste des points à compléter :</p>
            <ul class="mt-2 flex flex-col gap-1.5">
              <li v-if="infoIssues.length > 0" class="flex flex-wrap items-center justify-between gap-x-3">
                <span><strong>Informations :</strong> {{ infoIssues.join(' ') }}</span>
                <button type="button" class="qcm-text-button underline" @click="goStep('meta')">Compléter</button>
              </li>
              <template v-for="(issues, index) in issuesByQuestion" :key="index">
                <li v-if="issues.length > 0" class="flex flex-wrap items-center justify-between gap-x-3">
                  <span><strong>Question {{ index + 1 }} :</strong> {{ issues.join(' ') }}</span>
                  <button type="button" class="qcm-text-button underline" @click="goQuestion(index)">Compléter</button>
                </li>
              </template>
            </ul>
          </div>

          <div v-if="problems.length > 0" role="alert" class="qcm-note qcm-note-retry">
            <p class="font-extrabold">À corriger :</p>
            <ul class="mt-1 list-disc pl-6 font-medium">
              <li v-for="problem in problems" :key="problem">{{ problem }}</li>
            </ul>
          </div>
          <p v-if="notice" role="status" class="qcm-note qcm-note-correct text-lg">
            {{ notice }}
            <a v-if="publishedId" :href="`/qcm?id=${publishedId}`" class="underline">Voir la fiche</a>
          </p>

          <div class="grid gap-4 md:grid-cols-3">
            <div class="flex flex-col gap-3 rounded-2xl border-2 border-line-soft bg-bg p-4">
              <h3 class="text-lg font-extrabold">Essayer</h3>
              <p class="flex-1 text-sm font-medium text-ink-soft">Joue le QCM comme le verra l'élève, avant de le partager.</p>
              <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" :disabled="!allReady" @click="showPreview">Essayer le QCM</button>
            </div>
            <div class="flex flex-col gap-3 rounded-2xl border-2 border-line-soft bg-bg p-4">
              <h3 class="text-lg font-extrabold">Enregistrer</h3>
              <p class="flex-1 text-sm font-medium text-ink-soft">Un fichier .qcm à ouvrir avec le lecteur Windows. Sans compte.</p>
              <button type="button" class="qcm-block qcm-block-primary qcm-block-sm" :disabled="!allReady" @click="exportFile">Enregistrer le fichier</button>
            </div>
            <div class="flex flex-col gap-3 rounded-2xl border-2 border-line-soft bg-bg p-4">
              <h3 class="text-lg font-extrabold">Publier</h3>
              <p class="flex-1 text-sm font-medium text-ink-soft">
                {{ user ? 'Propose ton QCM à la bibliothèque. Il est relu avant d\'apparaître.' : 'La publication demande une connexion avec Google.' }}
              </p>
              <button v-if="user" type="button" class="qcm-block qcm-block-quiet qcm-block-sm" :disabled="!allReady || busy" @click="publish">
                {{ busy ? 'Publication…' : 'Publier dans la bibliothèque' }}
              </button>
              <button v-else type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="login">Se connecter</button>
            </div>
          </div>

          <button type="button" class="qcm-text-button self-start underline" :disabled="!allReady" @click="copyText">
            {{ copied === 'yaml' ? 'Texte copié ✓' : 'Copier le QCM au format texte' }}
          </button>
        </template>
      </section>

      <div class="flex items-center justify-between gap-3">
        <button v-if="stepIndex > 0" type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="shiftStep(-1)">
          ← {{ STEPS[stepIndex - 1]?.label }}
        </button>
        <span v-else />
        <button v-if="stepIndex < STEPS.length - 1" type="button" class="qcm-block qcm-block-primary px-7" @click="shiftStep(1)">
          Continuer : {{ STEPS[stepIndex + 1]?.label }} →
        </button>
      </div>
    </div>

    <!-- ───────────── Sommaire : fixé à droite (grand écran) ou en bas (mobile) ───────────── -->
    <aside
      class="qcm-panel sticky bottom-3 z-30 flex max-h-[75dvh] flex-col overflow-hidden lg:top-24 lg:bottom-auto lg:max-h-[calc(100dvh-7.5rem)]"
      aria-label="Sommaire du QCM"
    >
      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3 text-left lg:hidden"
        :aria-expanded="summaryOpen"
        @click="summaryOpen = !summaryOpen"
      >
        <span class="font-extrabold">Sommaire</span>
        <span class="qcm-chip" :class="allReady ? 'bg-correct text-correct-ink' : ''">{{ readyCount }} / {{ draft.questions.length }} prêtes</span>
        <span aria-hidden="true">{{ summaryOpen ? '▼' : '▲' }}</span>
      </button>

      <div class="min-h-0 flex-1 flex-col lg:flex" :class="summaryOpen ? 'flex border-t-[1.5px] border-line-soft' : 'hidden'">
        <div class="flex flex-col gap-3 border-b-[1.5px] border-line-soft p-5">
          <p class="hidden text-sm font-bold text-ink-soft lg:block">Sommaire</p>
          <p class="text-xl leading-snug font-extrabold break-words" :class="draft.title.trim() ? '' : 'text-ink-soft'">
            {{ draft.title.trim() || 'QCM sans titre' }}
          </p>
          <p class="flex flex-wrap gap-1.5">
            <span class="qcm-chip">{{ SUBJECT_LABELS[draft.subject] }}</span>
            <span class="qcm-chip">{{ LEVEL_LABELS[draft.level] }}</span>
            <span v-if="draft.chapter.trim()" class="qcm-chip max-w-full truncate">{{ draft.chapter }}</span>
          </p>
          <div>
            <div class="h-2.5 overflow-hidden rounded-full border-2 border-line bg-sunken" aria-hidden="true">
              <div class="h-full bg-correct transition-[width]" :style="{ width: `${(readyCount / draft.questions.length) * 100}%` }" />
            </div>
            <p class="mt-1.5 text-sm font-bold text-ink-soft">
              {{ readyCount }} sur {{ draft.questions.length === 1 ? '1 question prête' : `${draft.questions.length} questions prêtes` }}
            </p>
          </div>
        </div>

        <ol class="min-h-0 flex-1 overflow-y-auto p-2">
          <li>
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-sunken"
              :class="step === 'meta' ? 'bg-selected' : ''"
              @click="goStep('meta')"
            >
              <span class="flex size-7 flex-none items-center justify-center rounded-full border-2 border-line text-xs font-extrabold" :class="infoIssues.length === 0 ? 'bg-correct text-correct-ink' : 'bg-surface'" aria-hidden="true">
                {{ infoIssues.length === 0 ? '✓' : 'i' }}
              </span>
              <span class="flex-1 font-bold">Informations</span>
              <span class="sr-only">{{ infoIssues.length === 0 ? 'complètes' : 'à compléter' }}</span>
            </button>
          </li>
          <li v-for="(item, index) in draft.questions" :key="item.key">
            <button
              type="button"
              class="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-sunken"
              :class="step === 'questions' && current === index ? 'bg-selected' : ''"
              :aria-current="step === 'questions' && current === index ? 'true' : undefined"
              @click="goQuestion(index)"
            >
              <span
                class="flex size-7 flex-none items-center justify-center rounded-full border-2 border-line text-xs font-extrabold"
                :class="issuesByQuestion[index]?.length === 0 ? 'bg-correct text-correct-ink' : 'bg-surface'"
                aria-hidden="true"
              >
                {{ index + 1 }}
              </span>
              <span class="min-w-0 flex-1 truncate text-sm font-semibold" :class="item.prompt.trim() ? '' : 'text-ink-soft italic'">
                {{ item.prompt.trim() || 'Question à écrire' }}
              </span>
              <span class="sr-only">{{ issuesByQuestion[index]?.length === 0 ? 'prête' : 'à compléter' }}</span>
            </button>
          </li>
        </ol>

        <div class="flex flex-col gap-2 border-t-[1.5px] border-line-soft p-3">
          <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm w-full" :disabled="draft.questions.length >= LIMITS.maxQuestions" @click="appendQuestion">
            + Ajouter une question
          </button>
          <button v-if="step !== 'finish'" type="button" class="qcm-text-button justify-center" @click="goStep('finish')">Vérifier et terminer →</button>
        </div>
      </div>
    </aside>
  </div>
</template>
