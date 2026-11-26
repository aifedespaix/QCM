<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { LEVELS, LEVEL_LABELS, SUBJECTS, SUBJECT_LABELS, formatRelativeDay, type LibraryMatch, type Level, type QcmHistoryEntry, type Subject } from '@qcm/core'
import { QcmSubjectBand, SUBJECT_HUES } from '@qcm/ui'
import { LibraryError, listLibrary, type LibraryRecord, type LibrarySort } from '../lib/library.ts'

const props = defineProps<{
  /** QCM conservés sur cet ordinateur, du plus récemment ouvert au plus ancien. */
  local: readonly QcmHistoryEntry[]
  /** Lien de ces QCM avec la bibliothèque en ligne (dernier état connu ; vide hors-ligne). */
  remote: ReadonlyMap<string, LibraryMatch>
  /** Identifiant du QCM en ligne en cours de téléchargement. */
  downloadingId: string
  /** Message à afficher après un téléchargement qui n'a pas abouti. */
  downloadError: string
  /** Confirmation après un « Télécharger… » réussi. */
  exportNotice: string
}>()

const emit = defineEmits<{
  openRecord: [record: LibraryRecord]
  openLocal: [key: string]
  updateLocal: [entry: QcmHistoryEntry]
  exportRecord: [record: LibraryRecord]
  exportLocal: [entry: QcmHistoryEntry]
  removeLocal: [entry: QcmHistoryEntry]
  chooseFile: []
}>()

type Tab = 'online' | 'local'
/**
 * `offline` : pas de réponse (pas d'Internet, serveur muet). `unconfigured` : application
 * construite sans adresse de bibliothèque. Dans les deux cas, les QCM de l'ordinateur prennent le relais.
 */
type OnlineState = 'loading' | 'ready' | 'offline' | 'unconfigured'

const TAB_KEY = 'qcm.library.tab'
function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'local' ? 'local' : 'online'
  } catch {
    return 'online'
  }
}
const tab = ref<Tab>(readTab())
watch(tab, (value) => {
  try {
    localStorage.setItem(TAB_KEY, value)
  } catch {
    // Stockage indisponible : l'onglet ne sera simplement pas mémorisé.
  }
})
const filters = reactive<{ search: string; subject: Subject | ''; level: Level | ''; sort: LibrarySort }>({
  search: '',
  subject: '',
  level: '',
  sort: 'recent',
})
const online = ref<OnlineState>('loading')
const items = ref<LibraryRecord[]>([])
const page = ref(1)
const totalPages = ref(1)
const totalItems = ref(0)
const loadingMore = ref(false)
let debounce: ReturnType<typeof setTimeout> | undefined
let requestToken = 0

const filtered = computed(() => !!(filters.search.trim() || filters.subject || filters.level))
/** Sans réponse de la bibliothèque en ligne, l'onglet « En ligne » montre les QCM de l'ordinateur. */
const showLocal = computed(() => tab.value === 'local' || online.value === 'offline' || online.value === 'unconfigured')
/**
 * Où en est un QCM de la bibliothèque sur cet ordinateur : `none` (absent), `current` (même version),
 * `outdated` (une copie existe mais la version en ligne a changé), `present` (copie dont la version
 * ne peut pas être comparée : QCM publié sans empreinte).
 */
function copyState(item: LibraryRecord): 'none' | 'current' | 'outdated' | 'present' {
  const copy = props.local.find((entry) => (item.fingerprint ? entry.key === item.fingerprint : false) || entry.recordId === item.id)
  if (!copy) return 'none'
  if (!item.fingerprint) return 'present'
  return copy.key === item.fingerprint ? 'current' : 'outdated'
}

const localItems = computed(() => {
  const search = filters.search.trim().toLocaleLowerCase('fr')
  const list = props.local.filter(
    (entry) =>
      (!filters.subject || entry.subject === filters.subject) &&
      (!filters.level || entry.level === filters.level) &&
      (!search || `${entry.title} ${entry.chapter}`.toLocaleLowerCase('fr').includes(search)),
  )
  return filters.sort === 'title' ? [...list].sort((a, b) => a.title.localeCompare(b.title, 'fr')) : list
})

async function load(more = false): Promise<void> {
  const token = ++requestToken
  if (more) loadingMore.value = true
  else online.value = 'loading'
  try {
    const result = await listLibrary({ ...filters, page: more ? page.value + 1 : 1 })
    if (token !== requestToken) return
    items.value = more ? [...items.value, ...result.items] : result.items
    page.value = result.page
    totalPages.value = Math.max(1, result.totalPages)
    totalItems.value = result.totalItems
    online.value = 'ready'
  } catch (error) {
    if (token !== requestToken) return
    online.value = error instanceof LibraryError && error.reason === 'unconfigured' ? 'unconfigured' : 'offline'
  } finally {
    if (token === requestToken) loadingMore.value = false
  }
}

function resetFilters(): void {
  Object.assign(filters, { search: '', subject: '', level: '', sort: 'recent' })
}

/** « publié hier », « publié le 12 mars »… (vide si la date manque). */
function publishedLabel(item: LibraryRecord): string {
  const time = item.created ? Date.parse(item.created.replace(' ', 'T')) : NaN
  return Number.isNaN(time) ? '' : `publié ${formatRelativeDay(time)}`
}

function commentLabel(count: number): string {
  return count === 1 ? '1 commentaire' : `${count} commentaires`
}

function countLabel(count: number): string {
  return count === 1 ? '1 question' : `${count} questions`
}

watch(filters, () => {
  clearTimeout(debounce)
  if (online.value === 'unconfigured') return
  debounce = setTimeout(() => void load(), 300)
})

// Le réseau revient : la bibliothèque en ligne se recharge toute seule.
function onOnline(): void {
  if (online.value === 'offline') void load()
}

// Sans réponse, on réessaie seul de temps en temps : plus besoin de recharger la page.
let retryTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  void load()
  window.addEventListener('online', onOnline)
  retryTimer = setInterval(() => {
    if (online.value === 'offline' && !document.hidden) void load()
  }, 15000)
})
onBeforeUnmount(() => {
  clearInterval(retryTimer)
  clearTimeout(debounce)
  window.removeEventListener('online', onOnline)
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 pb-8">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-3xl font-extrabold">Bibliothèque</h1>
        <p class="text-ink-soft">Des QCM relus avant publication. Un QCM ouvert une fois reste disponible sans Internet.</p>
      </div>
      <div role="radiogroup" aria-label="QCM affichés" class="inline-flex gap-1 rounded-2xl bg-sunken p-1">
        <button
          v-for="option in [
            { id: 'online', label: 'En ligne' },
            { id: 'local', label: `Installés (${local.length})` },
          ] as const"
          :key="option.id"
          type="button"
          role="radio"
          :aria-checked="tab === option.id"
          class="min-h-11 cursor-pointer rounded-xl border-2 px-4 font-bold"
          :class="tab === option.id ? 'border-line bg-surface shadow-block-sm' : 'border-transparent text-ink-soft hover:text-ink'"
          @click="tab = option.id"
        >
          {{ option.label }}
        </button>
      </div>
    </header>

    <form class="qcm-panel sticky top-2 z-20 grid grid-cols-2 gap-4 p-4 lg:grid-cols-[2fr_1fr_1fr_1fr]" role="search" @submit.prevent>
      <div class="col-span-2 lg:col-span-1">
        <label class="qcm-label" for="lib-search">Rechercher</label>
        <input id="lib-search" v-model="filters.search" class="qcm-field" type="search" placeholder="Un titre, un chapitre, un mot…" />
      </div>
      <div>
        <label class="qcm-label" for="lib-subject">Matière</label>
        <select id="lib-subject" v-model="filters.subject" class="qcm-field">
          <option value="">Toutes les matières</option>
          <option v-for="subject in SUBJECTS" :key="subject" :value="subject">{{ SUBJECT_LABELS[subject] }}</option>
        </select>
      </div>
      <div>
        <label class="qcm-label" for="lib-level">Niveau</label>
        <select id="lib-level" v-model="filters.level" class="qcm-field">
          <option value="">Tous les niveaux</option>
          <option v-for="level in LEVELS" :key="level" :value="level">{{ LEVEL_LABELS[level] }}</option>
        </select>
      </div>
      <div class="col-span-2 lg:col-span-1">
        <label class="qcm-label" for="lib-sort">Trier par</label>
        <select id="lib-sort" v-model="filters.sort" class="qcm-field">
          <option value="recent">{{ showLocal ? 'Ouverts récemment' : 'Les plus récents' }}</option>
          <option v-if="!showLocal" value="rating">Les mieux notés</option>
          <option v-if="!showLocal" value="comments">Les plus commentés</option>
          <option value="title">Titre (A à Z)</option>
        </select>
      </div>
    </form>

    <p v-if="downloadError" role="alert" class="qcm-note qcm-note-retry">{{ downloadError }}</p>
    <p v-else-if="exportNotice" role="status" class="qcm-note qcm-note-correct font-bold">✓ {{ exportNotice }}</p>

    <!-- Pas de réponse de la bibliothèque en ligne : on le dit calmement, et on montre ce qui est disponible. -->
    <div v-if="tab === 'online' && online === 'offline'" role="status" class="qcm-note qcm-note-info flex flex-wrap items-center justify-between gap-3">
      <span>
        <strong class="font-extrabold">Pas de connexion à la bibliothèque en ligne.</strong>
        Voici les QCM déjà sur cet ordinateur : ils fonctionnent sans Internet.
      </span>
      <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="load()">Réessayer</button>
    </div>
    <p v-else-if="tab === 'online' && online === 'unconfigured'" role="status" class="qcm-note qcm-note-info">
      La bibliothèque en ligne n'est pas disponible dans cette version. Voici les QCM déjà sur cet ordinateur.
    </p>

    <!-- ───────────── Sur cet ordinateur ───────────── -->
    <template v-if="showLocal">
      <div v-if="localItems.length === 0" class="qcm-panel flex flex-col items-center gap-4 p-10 text-center">
        <p class="text-xl font-extrabold">
          {{ local.length === 0 ? 'Aucun QCM sur cet ordinateur pour le moment.' : 'Aucun QCM ne correspond à cette recherche.' }}
        </p>
        <button v-if="local.length === 0" type="button" class="qcm-block qcm-block-primary qcm-block-sm" @click="emit('chooseFile')">Ouvrir un fichier .qcm</button>
        <button v-else type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="resetFilters">Effacer les filtres</button>
      </div>
      <ul v-else class="qcm-library-grid">
        <li v-for="entry in localItems" :key="entry.key" class="qcm-panel qcm-library-card flex flex-col overflow-hidden" :class="SUBJECT_HUES[entry.subject]">
          <QcmSubjectBand :subject="entry.subject" :level="entry.level" />
          <div class="flex flex-1 flex-col gap-1.5 p-3.5 pt-3">
            <p v-if="remote.has(entry.key)" class="flex flex-wrap gap-1">
              <span v-if="remote.get(entry.key)?.state === 'outdated'" class="qcm-chip qcm-chip-sm bg-selected">Mise à jour disponible</span>
              <span v-else-if="remote.get(entry.key)?.state === 'removed'" class="qcm-chip qcm-chip-sm" title="Ta copie reste installée sur cet ordinateur.">Retiré de la bibliothèque</span>
              <span v-else class="qcm-chip qcm-chip-sm">Dans la bibliothèque</span>
            </p>
            <h2 class="line-clamp-2 text-lg leading-snug font-extrabold break-words" :title="entry.title">{{ entry.title }}</h2>
            <p class="truncate text-sm font-medium text-ink-soft" :title="entry.chapter">{{ entry.chapter }}</p>
            <p class="mt-auto pt-1 text-sm font-bold text-ink-soft">{{ countLabel(entry.questionCount) }} · ouvert {{ formatRelativeDay(entry.openedAt) }}</p>
            <div class="mt-1 flex items-center gap-1.5">
              <button type="button" class="qcm-block qcm-block-primary qcm-block-sm qcm-block-xs flex-1" :aria-label="`Ouvrir ${entry.title}`" @click="emit('openLocal', entry.key)">Ouvrir</button>
              <button v-if="remote.get(entry.key)?.state === 'outdated'" type="button" class="qcm-block qcm-block-quiet qcm-block-sm qcm-block-xs" :disabled="downloadingId !== ''" :aria-label="`Mettre à jour ${entry.title}`" @click="emit('updateLocal', entry)">Mettre à jour</button>
              <button type="button" class="qcm-icon-button qcm-icon-button-sm flex-none" :aria-label="`Télécharger ${entry.title}…`" title="Télécharger…" @click="emit('exportLocal', entry)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>
              </button>
              <button type="button" class="qcm-text-button underline" :aria-label="`Retirer ${entry.title} de cet ordinateur`" @click="emit('removeLocal', entry)">Retirer</button>
            </div>
          </div>
        </li>
      </ul>
    </template>

    <!-- ───────────── En ligne ───────────── -->
    <ul v-else-if="online === 'loading'" class="qcm-library-grid" role="status" aria-label="Chargement de la bibliothèque">
      <li v-for="n in 8" :key="n" class="qcm-panel flex flex-col gap-1.5 p-3.5">
        <div class="qcm-skeleton h-5 w-1/3" />
        <div class="qcm-skeleton h-6 w-3/4" />
        <div class="qcm-skeleton h-4 w-1/2" />
        <div class="qcm-skeleton mt-2 h-10 w-full" />
      </li>
    </ul>

    <div v-else-if="items.length === 0" class="qcm-panel flex flex-col items-center gap-4 p-10 text-center">
      <p class="text-xl font-extrabold">{{ filtered ? 'Aucun QCM ne correspond à cette recherche.' : 'La bibliothèque est encore vide.' }}</p>
      <button v-if="filtered" type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="resetFilters">Effacer les filtres</button>
    </div>

    <template v-else>
      <p class="text-base font-bold text-ink-soft" role="status">{{ totalItems === 1 ? '1 QCM' : `${totalItems} QCM` }}</p>
      <ul class="qcm-library-grid">
        <li v-for="item in items" :key="item.id" class="qcm-panel qcm-library-card flex flex-col overflow-hidden" :class="SUBJECT_HUES[item.subject]">
          <QcmSubjectBand :subject="item.subject" :level="item.level" />
          <div class="flex flex-1 flex-col gap-1.5 p-3.5 pt-3">
            <p v-if="copyState(item) !== 'none'" class="flex flex-wrap gap-1">
              <span v-if="copyState(item) === 'outdated'" class="qcm-chip qcm-chip-sm bg-selected">Mise à jour disponible</span>
              <span v-else class="qcm-chip qcm-chip-sm bg-correct text-correct-ink">Installé</span>
            </p>
            <h2 class="line-clamp-2 text-lg leading-snug font-extrabold break-words" :title="item.title">{{ item.title }}</h2>
            <p class="truncate text-sm font-medium text-ink-soft" :title="item.chapter">{{ item.chapter }}</p>
            <p v-if="item.description" class="line-clamp-2 text-sm text-ink-soft" :title="item.description">{{ item.description }}</p>
            <p class="mt-auto flex flex-wrap gap-x-2.5 pt-1 text-sm font-bold text-ink-soft">
              <span>{{ countLabel(item.question_count) }}</span>
              <span v-if="publishedLabel(item)">{{ publishedLabel(item) }}</span>
            </p>
            <p class="flex flex-wrap gap-x-3 text-sm font-extrabold">
              <span v-if="item.rating_count > 0" :aria-label="`Note ${item.rating_avg.toFixed(1)} sur 5, ${item.rating_count} ${item.rating_count > 1 ? 'notes' : 'note'}`">
                ★ {{ item.rating_avg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }}
                <span class="font-semibold text-ink-soft">({{ item.rating_count }})</span>
              </span>
              <span v-else class="font-semibold text-ink-soft">☆ Pas encore noté</span>
              <span v-if="item.comment_count" class="font-semibold text-ink-soft">{{ commentLabel(item.comment_count) }}</span>
            </p>
            <div class="mt-1 flex items-center gap-1.5">
              <button
                type="button"
                class="qcm-block qcm-block-primary qcm-block-sm qcm-block-xs flex-1"
                :disabled="downloadingId !== ''"
                :aria-label="`Ouvrir ${item.title}`"
                @click="emit('openRecord', item)"
              >
                {{ downloadingId === item.id ? 'Téléchargement…' : copyState(item) === 'outdated' ? 'Mettre à jour' : 'Ouvrir' }}
              </button>
              <button type="button" class="qcm-icon-button qcm-icon-button-sm flex-none" :disabled="downloadingId !== ''" :aria-label="`Télécharger ${item.title}…`" title="Télécharger…" @click="emit('exportRecord', item)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>
              </button>
            </div>
          </div>
        </li>
      </ul>
      <button v-if="page < totalPages" type="button" class="qcm-block qcm-block-quiet qcm-block-sm self-center px-8" :disabled="loadingMore" @click="load(true)">
        {{ loadingMore ? 'Chargement…' : 'Afficher la suite' }}
      </button>
    </template>
  </div>
</template>
