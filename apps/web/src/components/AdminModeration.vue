<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { LEVEL_LABELS, SUBJECT_LABELS, type QcmArchive } from '@qcm/core'
import { QcmPlayer } from '@qcm/ui'
import {
  countQcmsByStatus,
  deleteQcm,
  fetchQcmArchive,
  listQcmsByStatus,
  qcmDownloadUrl,
  setQcmStatus,
  useAuth,
  type QcmRecord,
  type QcmStatus,
} from '../lib/pb.ts'
import { SUBJECT_TONES, questionCountLabel } from '../lib/subjects.ts'

const LETTERS = ['A', 'B', 'C', 'D'] as const
const TABS: readonly { id: QcmStatus; label: string; empty: string }[] = [
  { id: 'pending', label: 'À valider', empty: 'Aucun QCM en attente. Tout est relu.' },
  { id: 'published', label: 'Publiés', empty: 'Aucun QCM publié pour le moment.' },
  { id: 'hidden', label: 'Masqués', empty: 'Aucun QCM masqué.' },
]
const STATUS_LABELS: Record<QcmStatus, string> = { pending: 'À valider', published: 'Publié', hidden: 'Masqué' }

const { user, loginWithGoogle } = useAuth()
const isAdmin = computed(() => user.value?.admin === true)

const tab = ref<QcmStatus>('pending')
const counts = reactive<Record<QcmStatus, number>>({ pending: 0, published: 0, hidden: 0 })
const items = ref<QcmRecord[]>([])
const page = ref(1)
const totalPages = ref(1)
const listState = ref<'loading' | 'ready' | 'error'>('loading')

const selectedId = ref('')
/** Petit écran : `true` affiche la relecture à la place de la liste. */
const showDetail = ref(false)
const archive = shallowRef<QcmArchive | null>(null)
const reviewState = ref<'loading' | 'ready' | 'error'>('loading')
const playing = ref(false)
const busy = ref(false)
const actionError = ref('')
/** Dernière décision, pour pouvoir l'annuler. */
const lastAction = ref<{ id: string; title: string; from: QcmStatus; to: QcmStatus } | null>(null)
const loginError = ref('')

const mediaUrls = new Map<string, string>()
let reviewToken = 0

const selected = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)
const activeTab = computed(() => TABS.find((item) => item.id === tab.value) ?? TABS[0]!)

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function clearMedia(): void {
  for (const url of mediaUrls.values()) URL.revokeObjectURL(url)
  mediaUrls.clear()
}

function resolveMedia(path: string): string | undefined {
  const cached = mediaUrls.get(path)
  if (cached) return cached
  const bytes = archive.value?.media.get(path)
  if (!bytes) return undefined
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const url = URL.createObjectURL(new Blob([buffer], { type: 'image/webp' }))
  mediaUrls.set(path, url)
  return url
}

async function refreshCounts(): Promise<void> {
  await Promise.all(
    TABS.map(async (item) => {
      counts[item.id] = await countQcmsByStatus(item.id)
    }),
  ).catch(() => {})
}

async function loadList(append = false): Promise<void> {
  if (!append) {
    listState.value = 'loading'
    page.value = 1
  }
  try {
    const result = await listQcmsByStatus(tab.value, page.value)
    items.value = append ? [...items.value, ...result.items] : result.items
    totalPages.value = Math.max(1, result.totalPages)
    counts[tab.value] = result.totalItems
    listState.value = 'ready'
    if (!selected.value) selectedId.value = items.value[0]?.id ?? ''
  } catch {
    listState.value = 'error'
  }
}

function loadMore(): void {
  page.value += 1
  void loadList(true)
}

function select(id: string): void {
  selectedId.value = id
  showDetail.value = true
  actionError.value = ''
  window.scrollTo({ top: 0 })
}

function switchTab(id: QcmStatus): void {
  if (tab.value === id) return
  tab.value = id
  selectedId.value = ''
  showDetail.value = false
  items.value = []
  void loadList()
}

/** Retire le QCM traité de la liste et passe au suivant. */
function dropFromList(id: string): void {
  const index = items.value.findIndex((item) => item.id === id)
  items.value = items.value.filter((item) => item.id !== id)
  counts[tab.value] = Math.max(0, counts[tab.value] - 1)
  const next = items.value[index] ?? items.value[index - 1]
  selectedId.value = next?.id ?? ''
  if (!next) showDetail.value = false
  window.scrollTo({ top: 0 })
}

async function decide(status: QcmStatus): Promise<void> {
  const record = selected.value
  if (!record || busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    await setQcmStatus(record.id, status)
    lastAction.value = { id: record.id, title: record.title, from: record.status, to: status }
    counts[status] += 1
    dropFromList(record.id)
  } catch {
    actionError.value = 'La décision n\'a pas été enregistrée. Tu peux réessayer.'
  } finally {
    busy.value = false
  }
}

async function undo(): Promise<void> {
  const action = lastAction.value
  if (!action || busy.value) return
  busy.value = true
  try {
    await setQcmStatus(action.id, action.from)
    lastAction.value = null
    await Promise.all([refreshCounts(), loadList()])
    if (tab.value === action.from) selectedId.value = action.id
  } catch {
    actionError.value = 'L\'annulation n\'a pas abouti.'
  } finally {
    busy.value = false
  }
}

async function remove(): Promise<void> {
  const record = selected.value
  if (!record || busy.value) return
  if (!window.confirm(`Supprimer définitivement « ${record.title} » ? Cette action ne peut pas être annulée.`)) return
  busy.value = true
  actionError.value = ''
  try {
    await deleteQcm(record.id)
    lastAction.value = null
    dropFromList(record.id)
  } catch {
    actionError.value = 'La suppression n\'a pas abouti.'
  } finally {
    busy.value = false
  }
}

function login(): void {
  loginError.value = ''
  loginWithGoogle().catch(() => {
    loginError.value = 'La connexion n\'a pas abouti.'
  })
}

// Charge le contenu du QCM sélectionné pour le relire question par question.
watch(selected, async (record, previous) => {
  if (record?.id === previous?.id) return
  const token = ++reviewToken
  playing.value = false
  archive.value = null
  clearMedia()
  if (!record) return
  reviewState.value = 'loading'
  try {
    const loaded = await fetchQcmArchive(record)
    if (token !== reviewToken) return
    archive.value = loaded
    reviewState.value = 'ready'
  } catch {
    if (token === reviewToken) reviewState.value = 'error'
  }
})

watch(
  isAdmin,
  (admin) => {
    if (!admin) return
    void refreshCounts()
    void loadList()
  },
  { immediate: true },
)

onBeforeUnmount(clearMedia)
</script>

<template>
  <!-- Accès -->
  <section v-if="!isAdmin" class="qcm-panel mx-auto mt-6 flex max-w-xl flex-col items-center gap-4 p-10 text-center">
    <h1 class="text-3xl font-extrabold">Modération</h1>
    <template v-if="!user">
      <p class="text-lg text-ink-soft">Cette page est réservée aux personnes qui relisent les QCM. Connecte-toi pour continuer.</p>
      <button type="button" class="qcm-block qcm-block-primary" @click="login">Se connecter avec Google</button>
      <p v-if="loginError" role="alert" class="font-semibold text-retry-ink">{{ loginError }}</p>
    </template>
    <template v-else>
      <p class="text-lg text-ink-soft">Ton compte n'a pas accès à la modération.</p>
      <a href="/bibliotheque" class="qcm-block qcm-block-quiet no-underline">Retour à la bibliothèque</a>
    </template>
  </section>

  <div v-else class="flex flex-col gap-5">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-extrabold sm:text-4xl">Modération</h1>
        <p class="mt-1 text-lg text-ink-soft">
          {{ counts.pending === 0 ? 'Aucun QCM n\'attend de relecture.' : counts.pending === 1 ? '1 QCM attend ta relecture.' : `${counts.pending} QCM attendent ta relecture.` }}
        </p>
      </div>
      <div role="tablist" aria-label="État des QCM" class="flex w-full gap-1 rounded-2xl bg-sunken p-1 sm:w-auto">
        <button
          v-for="item in TABS"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          class="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl border-2 px-1 text-sm font-bold whitespace-nowrap sm:gap-2 sm:px-4 sm:text-base"
          :class="tab === item.id ? 'border-line bg-surface shadow-block-sm' : 'border-transparent hover:bg-surface/60'"
          @click="switchTab(item.id)"
        >
          {{ item.label }}
          <span class="qcm-chip px-2" :class="item.id === 'pending' && counts.pending > 0 ? 'bg-retry text-retry-ink' : 'bg-bg'">{{ counts[item.id] }}</span>
        </button>
      </div>
    </header>

    <p v-if="lastAction" role="status" class="qcm-note qcm-note-correct flex flex-wrap items-center justify-between gap-x-4">
      <span>« {{ lastAction.title }} » : {{ lastAction.to === 'published' ? 'validé, visible dans la bibliothèque' : lastAction.to === 'hidden' ? 'masqué de la bibliothèque' : 'remis en attente' }}.</span>
      <button type="button" class="qcm-text-button underline" :disabled="busy" @click="undo">Annuler</button>
    </p>

    <div class="grid gap-5 lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start">
      <!-- Liste -->
      <section
        class="qcm-panel flex-col overflow-hidden lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100dvh-7.5rem)]"
        :class="showDetail ? 'hidden' : 'flex'"
        :aria-label="`QCM : ${activeTab.label}`"
      >
        <ul v-if="listState === 'loading'" class="flex flex-col gap-2 p-3" role="status" aria-label="Chargement">
          <li v-for="n in 4" :key="n" class="qcm-skeleton h-16" />
        </ul>
        <div v-else-if="listState === 'error'" role="alert" class="flex flex-col gap-3 p-5">
          <p class="font-bold">La liste ne se charge pas.</p>
          <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="loadList()">Réessayer</button>
        </div>
        <p v-else-if="items.length === 0" class="p-6 text-center text-lg font-bold text-ink-soft">{{ activeTab.empty }}</p>
        <ul v-else class="min-h-0 flex-1 overflow-y-auto p-2">
          <li v-for="item in items" :key="item.id">
            <button
              type="button"
              class="flex w-full cursor-pointer flex-col gap-1 rounded-xl border-2 px-3 py-2.5 text-left"
              :class="selectedId === item.id ? 'border-line bg-selected' : 'border-transparent hover:bg-sunken'"
              :aria-current="selectedId === item.id ? 'true' : undefined"
              @click="select(item.id)"
            >
              <span class="leading-snug font-extrabold">{{ item.title }}</span>
              <span class="text-sm font-semibold text-ink-soft">
                {{ SUBJECT_LABELS[item.subject] }} · {{ LEVEL_LABELS[item.level] }} · {{ questionCountLabel(item.question_count) }}
              </span>
              <span class="text-sm text-ink-soft">{{ item.expand?.owner?.name || 'Membre' }} · {{ formatDate(item.created) }}</span>
            </button>
          </li>
          <li v-if="page < totalPages" class="p-2">
            <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm w-full" @click="loadMore">Afficher la suite</button>
          </li>
        </ul>
      </section>

      <!-- Relecture -->
      <section class="min-w-0 flex-col gap-4 lg:flex" :class="showDetail ? 'flex' : 'hidden'" aria-label="Relecture">
        <button type="button" class="qcm-text-button self-start lg:hidden" @click="showDetail = false">← Retour à la liste</button>

        <p v-if="!selected" class="qcm-panel p-10 text-center text-lg font-bold text-ink-soft">
          {{ listState === 'ready' && items.length === 0 ? activeTab.empty : 'Choisis un QCM dans la liste pour le relire.' }}
        </p>

        <template v-else>
          <div class="qcm-panel flex flex-col gap-4 p-5 sm:p-7">
            <p class="flex flex-wrap gap-1.5">
              <span class="qcm-chip" :class="selected.status === 'published' ? 'bg-correct text-correct-ink' : 'bg-retry text-retry-ink'">{{ STATUS_LABELS[selected.status] }}</span>
              <span class="qcm-chip" :class="SUBJECT_TONES[selected.subject]">{{ SUBJECT_LABELS[selected.subject] }}</span>
              <span class="qcm-chip">{{ LEVEL_LABELS[selected.level] }}</span>
              <span class="qcm-chip">{{ questionCountLabel(selected.question_count) }}</span>
              <span class="qcm-chip">{{ selected.has_images ? 'Avec images' : 'Sans image' }}</span>
            </p>
            <div>
              <h2 class="text-2xl leading-tight font-extrabold sm:text-3xl">{{ selected.title }}</h2>
              <p class="mt-1 font-semibold text-ink-soft">
                {{ selected.chapter }} · Proposé par {{ selected.expand?.owner?.name || 'un membre' }} le {{ formatDate(selected.created) }}
              </p>
            </div>
            <p v-if="selected.description" class="text-lg">{{ selected.description }}</p>
            <div class="flex flex-wrap gap-x-1">
              <button type="button" class="qcm-text-button underline" :disabled="reviewState !== 'ready'" @click="playing = !playing">
                {{ playing ? 'Revenir à la relecture' : 'Essayer comme un élève' }}
              </button>
              <a :href="qcmDownloadUrl(selected)" class="qcm-text-button underline">Télécharger le fichier</a>
              <a :href="`/qcm?id=${selected.id}`" class="qcm-text-button underline">Ouvrir la fiche</a>
            </div>
          </div>

          <!-- Décision : reste visible pendant la relecture -->
          <div class="qcm-card sticky top-3 z-20 lg:top-[4.75rem] flex flex-wrap items-center gap-3 p-3 sm:px-5">
            <p class="mr-auto hidden font-extrabold sm:block">Ta décision</p>
            <button v-if="selected.status !== 'published'" type="button" class="qcm-block qcm-block-primary qcm-block-sm flex-1 bg-correct sm:flex-none sm:px-7" :disabled="busy" @click="decide('published')">
              ✓ Valider et publier
            </button>
            <button v-if="selected.status !== 'hidden'" type="button" class="qcm-block qcm-block-quiet qcm-block-sm flex-1 sm:flex-none" :disabled="busy" @click="decide('hidden')">
              {{ selected.status === 'pending' ? 'Refuser (masquer)' : 'Masquer' }}
            </button>
            <button type="button" class="qcm-text-button underline" :disabled="busy" @click="remove">Supprimer</button>
            <p v-if="actionError" role="alert" class="w-full font-semibold text-retry-ink">{{ actionError }}</p>
          </div>

          <div v-if="reviewState === 'loading'" class="qcm-panel flex flex-col gap-3 p-6" role="status" aria-label="Chargement des questions">
            <div class="qcm-skeleton h-6 w-2/3" />
            <div class="qcm-skeleton h-12 w-full" />
            <div class="qcm-skeleton h-12 w-full" />
          </div>
          <p v-else-if="reviewState === 'error' || !archive" role="alert" class="qcm-note qcm-note-retry">
            Le fichier de ce QCM est illisible ou ne respecte pas le format. Il ne peut pas être joué : mieux vaut le refuser.
          </p>
          <QcmPlayer v-else-if="playing" :qcm="archive.data" :resolve-media="resolveMedia" :keyboard="false" closable @close="playing = false" />
          <ol v-else class="flex flex-col gap-4">
            <li v-for="(question, index) in archive.data.questions" :key="question.id" class="qcm-panel flex flex-col gap-3 p-5 sm:p-6">
              <p class="text-sm font-bold text-ink-soft">Question {{ index + 1 }} sur {{ archive.data.questions.length }}</p>
              <h3 class="text-xl leading-snug font-extrabold">{{ question.prompt }}</h3>
              <img v-if="question.image && resolveMedia(question.image)" :src="resolveMedia(question.image)" alt="Image de la question" class="max-h-64 self-start rounded-xl border-2 border-line bg-bg object-contain" />
              <ul class="grid gap-2 sm:grid-cols-2">
                <li
                  v-for="(choice, choiceIndex) in question.choices"
                  :key="choiceIndex"
                  class="flex items-center gap-3 rounded-xl border-2 px-3 py-2 font-semibold"
                  :class="choice.correct ? 'border-line bg-correct text-correct-ink' : 'border-line-soft'"
                >
                  <span class="qcm-key size-8 min-w-8 text-sm" aria-hidden="true">{{ LETTERS[choiceIndex] }}</span>
                  <span class="flex-1">{{ choice.text }}</span>
                  <span v-if="choice.correct" class="text-sm font-extrabold">Bonne réponse</span>
                </li>
              </ul>
              <dl class="grid gap-2 text-base">
                <div v-if="question.hint" class="rounded-xl bg-retry px-4 py-2.5 text-retry-ink">
                  <dt class="text-sm font-extrabold">Indice</dt>
                  <dd class="font-medium">{{ question.hint }}</dd>
                </div>
                <div class="rounded-xl bg-sunken px-4 py-2.5">
                  <dt class="text-sm font-extrabold">Explication</dt>
                  <dd class="font-medium">{{ question.explanation }}</dd>
                </div>
              </dl>
            </li>
          </ol>
        </template>
      </section>
    </div>
  </div>
</template>
