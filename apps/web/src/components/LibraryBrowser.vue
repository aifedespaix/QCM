<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { LEVELS, LEVEL_LABELS, SUBJECTS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'
import { downloadQcm, listQcms, qcmThumbnailUrl, useAuth, type QcmRecord, type QcmSort } from '../lib/pb.ts'
import { defaultLibraryState, libraryHeading, libraryHref, type LibraryState } from '../lib/libraryQuery.ts'
import { qcmPath } from '../lib/qcmUrl.ts'
import UiIcon from './UiIcon.vue'
import { SUBJECT_TONES, questionCountLabel } from '../lib/subjects.ts'

/**
 * Bibliothèque. La première page arrive rendue par le serveur (`initial`) : rien à attendre à
 * l'ouverture. Les recherches suivantes passent par le navigateur et mettent l'adresse à jour.
 */
const props = defineProps<{
  /** Filtres lus dans l'adresse par le serveur. */
  query?: LibraryState
  /** Résultats rendus par le serveur ; absents si PocketBase n'a pas répondu ou pour « Mes QCM ». */
  initial?: { items: QcmRecord[]; page: number; totalPages: number; totalItems: number } | null
}>()

const STATUS_CHIPS: Record<QcmRecord['status'], { label: string; tone: string }> = {
  pending: { label: 'En attente de validation', tone: 'bg-retry text-retry-ink' },
  published: { label: 'Publié', tone: 'bg-correct text-correct-ink' },
  hidden: { label: 'Masqué', tone: 'bg-sunken' },
}

const start = props.query ?? defaultLibraryState()
const { user } = useAuth()
const filters = reactive<{ search: string; subject: Subject | ''; level: Level | ''; sort: QcmSort; mine: boolean }>({
  search: start.search,
  subject: start.subject,
  level: start.level,
  sort: start.sort,
  // `/bibliotheque?mes=1` ouvre directement « Mes QCM ».
  mine: start.mine,
})
/** « Mes QCM » n'a de sens que connecté. */
const mineActive = computed(() => filters.mine && !!user.value)
const items = ref<QcmRecord[]>(props.initial?.items ?? [])
const page = ref(props.initial?.page ?? start.page)
const totalPages = ref(props.initial?.totalPages ?? 1)
const totalItems = ref(props.initial?.totalItems ?? 0)
const state = ref<'loading' | 'ready' | 'error'>(props.initial && !start.mine ? 'ready' : 'loading')
/** Une recherche est en cours alors que des résultats sont affichés (pas de squelette, la liste reste). */
const refreshing = ref(false)
const filtered = computed(() => !!(filters.search.trim() || filters.subject || filters.level))
let debounce: ReturnType<typeof setTimeout> | undefined

const SORT_LABELS: Record<QcmSort, string> = { recent: 'Les plus récents', rating: 'Les mieux notés', title: 'Titre (A à Z)' }
/** Téléphone : le panneau de filtres (matière, niveau, tri) est replié dans la barre du bas. */
const sheetOpen = ref(false)
/** Filtres choisis dans le panneau (la recherche est toujours visible, elle ne compte pas). */
const activeFilters = computed(() =>
  [
    filters.subject ? SUBJECT_LABELS[filters.subject] : '',
    filters.level ? LEVEL_LABELS[filters.level] : '',
    filters.sort !== 'recent' ? SORT_LABELS[filters.sort] : '',
  ].filter(Boolean),
)
/** Titre de la page : suit la matière et le niveau choisis (même texte que celui rendu par le serveur). */
const heading = computed(() => libraryHeading(filters.subject, filters.level))
const resultLabel = computed(() =>
  state.value !== 'ready' ? 'Voir les résultats' : totalItems.value === 0 ? 'Aucun QCM' : totalItems.value === 1 ? 'Voir 1 QCM' : `Voir ${totalItems.value} QCM`,
)

/** Adresse d'une page de résultats (liens de pagination, lisibles sans JavaScript et par les moteurs). */
function pageHref(target: number): string {
  return libraryHref({ ...filters, mine: mineActive.value, page: target })
}

/** Lance la recherche tout de suite, replie le panneau et range le clavier. */
function submit(): void {
  clearTimeout(debounce)
  page.value = 1
  void load()
  sheetOpen.value = false
  if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-search-dock]')) document.activeElement.blur()
}

function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && sheetOpen.value) sheetOpen.value = false
}

const AUTO_RETRY_DELAYS_MS = [2000, 5000, 10000]
let autoRetryTimer: ReturnType<typeof setTimeout> | undefined
let autoRetries = 0

/** L'adresse suit la recherche affichée (partage, favori, retour arrière, rechargement). */
function syncUrl(): void {
  const target = pageHref(page.value)
  if (window.location.pathname + window.location.search !== target) window.history.replaceState(null, '', target)
}

let loadId = 0
async function load(): Promise<void> {
  // Une réponse tardive d'une ancienne requête ne doit pas écraser la plus récente.
  const id = ++loadId
  clearTimeout(autoRetryTimer)
  syncUrl()
  // Des résultats sont à l'écran : ils restent visibles pendant la recherche. Sinon, squelette.
  // On n'affiche jamais « la bibliothèque est vide » avant une vraie réponse du serveur.
  if (state.value === 'ready') refreshing.value = true
  else state.value = 'loading'
  try {
    const { mine: _mine, ...query } = filters
    const result = await listQcms({ ...query, page: page.value, ...(mineActive.value && user.value ? { owner: user.value.id } : {}) })
    if (id !== loadId) return
    items.value = result.items
    totalPages.value = Math.max(1, result.totalPages)
    totalItems.value = result.totalItems
    state.value = 'ready'
    refreshing.value = false
    autoRetries = 0
  } catch {
    if (id !== loadId) return
    refreshing.value = false
    state.value = 'error'
    // On réessaie seul quelques fois avant de laisser la main au bouton « Réessayer ».
    const delay = AUTO_RETRY_DELAYS_MS[autoRetries++]
    if (delay !== undefined) autoRetryTimer = setTimeout(() => void load(), delay)
  }
}

function goTo(target: number): void {
  page.value = Math.min(Math.max(1, target), totalPages.value)
  void load()
  window.scrollTo({ top: 0 })
}

function resetFilters(): void {
  Object.assign(filters, { search: '', subject: '', level: '', sort: 'recent' })
}

watch(
  () => [filters.search, filters.subject, filters.level, filters.sort],
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      page.value = 1
      void load()
    }, 300)
  },
)

// Premier affichage (le compte est alors connu) puis connexion, déconnexion ou bascule « Mes QCM ».
// Les résultats rendus par le serveur ne sont rechargés que s'ils ne conviennent pas.
const mounted = ref(false)
watch(
  () => (mounted.value ? `${mineActive.value}:${user.value?.id ?? ''}` : null),
  (key, previous) => {
    if (key === null) return
    // Premier passage : les résultats du serveur conviennent, sauf pour « Mes QCM ».
    if (previous === null && state.value === 'ready' && !mineActive.value) return
    if (previous !== null) page.value = 1
    void load()
  },
)

// Retour du réseau après une erreur : on recharge la liste sans attendre un clic.
function onOnline(): void {
  if (state.value === 'error') void load()
}

// Retour sur l'onglet ou page restaurée depuis le cache du navigateur : une requête a pu être
// suspendue en arrière-plan. Si la liste n'est pas là, on relance.
function onWake(): void {
  if (document.visibilityState === 'visible' && state.value !== 'ready') {
    autoRetries = 0
    void load()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onEscape)
  window.addEventListener('online', onOnline)
  window.addEventListener('pageshow', onWake)
  document.addEventListener('visibilitychange', onWake)
  mounted.value = true
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('pageshow', onWake)
  document.removeEventListener('visibilitychange', onWake)
  clearTimeout(autoRetryTimer)
  clearTimeout(debounce)
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-extrabold sm:text-4xl">{{ heading }}</h1>
        <p class="mt-1 text-lg text-ink-soft">Des QCM relus avant publication, à essayer en ligne ou à télécharger.</p>
      </div>
      <a href="/editeur" class="qcm-block qcm-block-quiet qcm-block-sm no-underline">+ Proposer un QCM</a>
    </header>
    <form class="qcm-panel sticky top-[calc(var(--site-header)+0.5rem)] z-20 hidden gap-3 p-3 sm:grid sm:grid-cols-3 lg:grid-cols-[2fr_1fr_1fr_1fr]" role="search" @submit.prevent="submit">
      <div class="sm:col-span-3 lg:col-span-1">
        <!-- Libellés lus par les lecteurs d'écran : chaque liste affiche déjà son choix (« Toutes les matières »…). -->
        <label class="sr-only" for="lib-search">Rechercher</label>
        <div class="relative">
          <UiIcon name="search" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-soft" />
          <input id="lib-search" v-model="filters.search" class="qcm-field pl-11" type="search" placeholder="Rechercher un titre, un chapitre, un mot…" />
        </div>
      </div>
      <div>
        <label class="sr-only" for="lib-subject">Matière</label>
        <select id="lib-subject" v-model="filters.subject" class="qcm-field">
          <option value="">Toutes les matières</option>
          <option v-for="subject in SUBJECTS" :key="subject" :value="subject">{{ SUBJECT_LABELS[subject] }}</option>
        </select>
      </div>
      <div>
        <label class="sr-only" for="lib-level">Niveau</label>
        <select id="lib-level" v-model="filters.level" class="qcm-field">
          <option value="">Tous les niveaux</option>
          <option v-for="level in LEVELS" :key="level" :value="level">{{ LEVEL_LABELS[level] }}</option>
        </select>
      </div>
      <div>
        <label class="sr-only" for="lib-sort">Trier par</label>
        <select id="lib-sort" v-model="filters.sort" class="qcm-field">
          <option value="recent">Trier : les plus récents</option>
          <option value="rating">Trier : les mieux notés</option>
          <option value="title">Trier : titre (A à Z)</option>
        </select>
      </div>
    </form>


    <!--
      Téléphone : recherche et filtres dans une barre fixée en bas, juste au-dessus des onglets du site.
      Repliée : le champ de recherche + un bouton « Filtres » (pastille = nombre de filtres actifs).
      Dépliée : matière, niveau, tri, puis « Voir N QCM » qui lance la recherche et replie le panneau.
    -->
    <div class="sm:hidden" data-search-dock>
      <div v-if="sheetOpen" class="fixed inset-0 z-30 bg-ink/40" aria-hidden="true" @click="sheetOpen = false" />
      <form
        class="fixed inset-x-0 z-40 flex flex-col gap-3 rounded-t-3xl border-t-2 border-line bg-surface px-4 py-3 shadow-soft"
        style="bottom: var(--site-tabbar)"
        role="search"
        aria-label="Rechercher dans la bibliothèque"
        @submit.prevent="submit"
      >
        <div id="lib-sheet" v-show="sheetOpen" class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-extrabold">Filtres</h2>
            <button type="button" class="qcm-text-button" :disabled="activeFilters.length === 0" @click="Object.assign(filters, { subject: '', level: '', sort: 'recent' })">Effacer</button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="qcm-label" for="lib-m-subject">Matière</label>
              <select id="lib-m-subject" v-model="filters.subject" class="qcm-field">
                <option value="">Toutes</option>
                <option v-for="subject in SUBJECTS" :key="subject" :value="subject">{{ SUBJECT_LABELS[subject] }}</option>
              </select>
            </div>
            <div>
              <label class="qcm-label" for="lib-m-level">Niveau</label>
              <select id="lib-m-level" v-model="filters.level" class="qcm-field">
                <option value="">Tous</option>
                <option v-for="level in LEVELS" :key="level" :value="level">{{ LEVEL_LABELS[level] }}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="qcm-label" for="lib-m-sort">Trier par</label>
            <select id="lib-m-sort" v-model="filters.sort" class="qcm-field">
              <option v-for="(label, value) in SORT_LABELS" :key="value" :value="value">{{ label }}</option>
            </select>
          </div>
          <button type="submit" class="qcm-block qcm-block-primary justify-center">{{ resultLabel }}</button>
        </div>

        <!-- Filtres actifs, lisibles sans ouvrir le panneau. -->
        <p v-if="!sheetOpen && activeFilters.length > 0" class="flex items-center gap-2 text-sm font-bold text-ink-soft">
          <span class="min-w-0 flex-1 truncate">{{ activeFilters.join(' · ') }}</span>
          <button type="button" class="qcm-text-button min-h-9" @click="Object.assign(filters, { subject: '', level: '', sort: 'recent' })">Effacer</button>
        </p>

        <div class="flex items-center gap-2">
          <div class="relative min-w-0 flex-1">
            <UiIcon name="search" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-soft" />
            <label class="sr-only" for="lib-m-search">Rechercher</label>
            <input id="lib-m-search" v-model="filters.search" class="qcm-field pl-11" type="search" enterkeyhint="search" placeholder="Titre, chapitre, mot…" />
          </div>
          <button
            type="button"
            class="qcm-icon-button relative flex-none"
            :class="sheetOpen ? 'bg-selected' : ''"
            :aria-expanded="sheetOpen"
            aria-controls="lib-sheet"
            :aria-label="activeFilters.length > 0 ? `Filtres, ${activeFilters.length} actif${activeFilters.length > 1 ? 's' : ''}` : 'Filtres'"
            @click="sheetOpen = !sheetOpen"
          >
            <UiIcon :name="sheetOpen ? 'close' : 'sliders'" />
            <span v-if="activeFilters.length > 0 && !sheetOpen" class="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border-2 border-line bg-primary text-xs font-extrabold" aria-hidden="true">{{ activeFilters.length }}</span>
          </button>
        </div>
      </form>
    </div>

    <div v-if="user" role="radiogroup" aria-label="QCM affichés" class="inline-flex gap-1 self-start rounded-2xl bg-sunken p-1">
      <button
        v-for="option in [
          { mine: false, label: 'Toute la bibliothèque' },
          { mine: true, label: 'Mes QCM' },
        ]"
        :key="option.label"
        type="button"
        role="radio"
        :aria-checked="filters.mine === option.mine"
        class="min-h-11 cursor-pointer rounded-xl border-2 px-4 font-bold"
        :class="filters.mine === option.mine ? 'border-line bg-surface shadow-block-sm' : 'border-transparent text-ink-soft hover:text-ink'"
        @click="filters.mine = option.mine"
      >
        {{ option.label }}
      </button>
    </div>

    <ul v-if="state === 'loading'" class="qcm-library-grid" role="status" aria-label="Chargement de la bibliothèque">
      <li v-for="n in 8" :key="n" class="qcm-panel flex gap-3 overflow-hidden p-2 sm:flex-col sm:p-0">
        <div class="qcm-skeleton qcm-library-thumb w-28 flex-none rounded-xl sm:w-full sm:rounded-none" />
        <div class="flex flex-1 flex-col gap-2 py-1 sm:px-3.5 sm:pb-3.5">
          <div class="qcm-skeleton h-5 w-3/4" />
          <div class="qcm-skeleton h-4 w-1/2" />
        </div>
      </li>
    </ul>

    <div v-else-if="state === 'error'" role="alert" class="qcm-note qcm-note-retry flex flex-wrap items-center justify-between gap-3 text-lg">
      La bibliothèque ne répond pas pour le moment. Tu peux réessayer dans un instant.
      <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="load()">Réessayer</button>
    </div>

    <div v-else-if="items.length === 0" class="qcm-panel flex flex-col items-center gap-4 p-10 text-center">
      <p class="text-xl font-extrabold">
        {{ filtered ? 'Aucun QCM ne correspond à cette recherche.' : mineActive ? 'Tu n\'as pas encore proposé de QCM.' : 'La bibliothèque est encore vide.' }}
      </p>
      <button v-if="filtered" type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="resetFilters">Effacer les filtres</button>
      <a v-else href="/editeur" class="qcm-block qcm-block-primary qcm-block-sm no-underline">{{ mineActive ? 'Créer un QCM' : 'Créer le premier QCM' }}</a>
    </div>

    <template v-else>
      <p class="text-base font-bold text-ink-soft" role="status">{{ refreshing ? 'Recherche…' : totalItems === 1 ? '1 QCM' : `${totalItems} QCM` }}</p>
      <!--
        Cartes compactes : toute la carte mène à la fiche (lien étiré sur le titre), seule l'icône
        de téléchargement (et « Modifier » pour ses propres QCM) reste au-dessus.
        Téléphone : une ligne par QCM, vignette à gauche. À partir de sm : grille de 2 à 4 colonnes.
      -->
      <ul class="qcm-library-grid transition-opacity" :class="refreshing ? 'opacity-60' : ''" :aria-busy="refreshing">
        <li
          v-for="item in items"
          :key="item.id"
          class="qcm-panel group relative flex gap-3 overflow-hidden p-2 transition-transform hover:-translate-y-0.5 focus-within:-translate-y-0.5 sm:flex-col sm:gap-0 sm:p-0"
        >
          <div class="qcm-library-thumb relative w-28 flex-none self-start overflow-hidden rounded-xl sm:w-full sm:rounded-none">
            <img v-if="qcmThumbnailUrl(item)" :src="qcmThumbnailUrl(item)" alt="" width="480" height="270" loading="lazy" decoding="async" class="h-full w-full bg-bg object-cover sm:border-b-[1.5px] sm:border-line-soft" />
            <div v-else class="flex h-full w-full items-center justify-center sm:border-b-[1.5px] sm:border-line-soft" :class="SUBJECT_TONES[item.subject]" aria-hidden="true">
              <span class="px-2 text-center text-sm font-extrabold opacity-80 sm:text-lg">{{ SUBJECT_LABELS[item.subject] }}</span>
            </div>
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-1 py-0.5 pr-1 sm:p-3.5 sm:pt-3">
            <p class="flex flex-wrap gap-1">
              <span v-if="qcmThumbnailUrl(item)" class="qcm-chip qcm-chip-sm" :class="SUBJECT_TONES[item.subject]">{{ SUBJECT_LABELS[item.subject] }}</span>
              <span class="qcm-chip qcm-chip-sm">{{ LEVEL_LABELS[item.level] }}</span>
              <span v-if="mineActive" class="qcm-chip qcm-chip-sm" :class="STATUS_CHIPS[item.status].tone">{{ STATUS_CHIPS[item.status].label }}</span>
            </p>
            <h2 class="line-clamp-2 text-base leading-snug font-extrabold sm:text-lg" :title="item.title">
              <a :href="qcmPath(item)" class="no-underline after:absolute after:inset-0 group-hover:underline">{{ item.title }}</a>
            </h2>
            <p class="truncate text-sm font-medium text-ink-soft" :title="item.chapter">{{ item.chapter }}</p>
            <div class="mt-auto flex items-center gap-2 pt-1">
              <p class="flex min-w-0 flex-1 items-center gap-x-2 overflow-hidden text-sm font-bold whitespace-nowrap text-ink-soft">
                <span>{{ questionCountLabel(item.question_count) }}</span>
                <span v-if="item.rating_count > 0" :aria-label="`Note ${item.rating_avg.toFixed(1)} sur 5`">★ {{ item.rating_avg.toFixed(1) }}</span>
              </p>
              <a v-if="mineActive" :href="`/editeur?id=${item.id}`" class="qcm-icon-button qcm-icon-button-sm relative z-10 flex-none no-underline" :aria-label="`Modifier ${item.title}`" title="Modifier">
                <UiIcon name="pencil" :size="18" />
              </a>
              <button type="button" class="qcm-icon-button qcm-icon-button-sm relative z-10 flex-none" :aria-label="`Télécharger ${item.title}`" title="Télécharger" @click="downloadQcm(item)">
                <UiIcon name="download" :size="18" />
              </button>
            </div>
          </div>
        </li>
      </ul>

      <nav v-if="totalPages > 1" aria-label="Pages de résultats" class="flex items-center justify-center gap-4">
        <a v-if="page > 1" :href="pageHref(page - 1)" rel="prev" class="qcm-block qcm-block-quiet qcm-block-sm no-underline" @click.prevent="goTo(page - 1)">← Précédente</a>
        <span v-else class="qcm-block qcm-block-quiet qcm-block-sm opacity-50" aria-disabled="true">← Précédente</span>
        <span class="text-base font-bold">Page {{ page }} sur {{ totalPages }}</span>
        <a v-if="page < totalPages" :href="pageHref(page + 1)" rel="next" class="qcm-block qcm-block-quiet qcm-block-sm no-underline" @click.prevent="goTo(page + 1)">Suivante →</a>
        <span v-else class="qcm-block qcm-block-quiet qcm-block-sm opacity-50" aria-disabled="true">Suivante →</span>
      </nav>
    </template>
    <!-- Place pour la barre de recherche fixée en bas (téléphone). -->
    <div class="h-24 sm:hidden" aria-hidden="true" />
  </div>
</template>
