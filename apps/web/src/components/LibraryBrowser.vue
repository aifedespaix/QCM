<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { LEVELS, LEVEL_LABELS, SUBJECTS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'
import { downloadQcm, listQcms, qcmThumbnailUrl, useAuth, type QcmRecord, type QcmSort } from '../lib/pb.ts'
import UiIcon from './UiIcon.vue'
import { SUBJECT_TONES, questionCountLabel } from '../lib/subjects.ts'

const STATUS_CHIPS: Record<QcmRecord['status'], { label: string; tone: string }> = {
  pending: { label: 'En attente de validation', tone: 'bg-retry text-retry-ink' },
  published: { label: 'Publié', tone: 'bg-correct text-correct-ink' },
  hidden: { label: 'Masqué', tone: 'bg-sunken' },
}

const { user } = useAuth()
const filters = reactive<{ search: string; subject: Subject | ''; level: Level | ''; sort: QcmSort; mine: boolean }>({
  search: '',
  subject: '',
  level: '',
  sort: 'recent',
  // `/bibliotheque?mes=1` ouvre directement « Mes QCM ».
  mine: new URLSearchParams(window.location.search).has('mes'),
})
/** « Mes QCM » n'a de sens que connecté. */
const mineActive = computed(() => filters.mine && !!user.value)
const items = ref<QcmRecord[]>([])
const page = ref(1)
const totalPages = ref(1)
const totalItems = ref(0)
const state = ref<'loading' | 'ready' | 'error'>('loading')
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
const resultLabel = computed(() =>
  state.value !== 'ready' ? 'Voir les résultats' : totalItems.value === 0 ? 'Aucun QCM' : totalItems.value === 1 ? 'Voir 1 QCM' : `Voir ${totalItems.value} QCM`,
)

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

let loadId = 0
async function load(): Promise<void> {
  // Une réponse tardive d'une ancienne requête ne doit pas écraser la plus récente.
  const id = ++loadId
  state.value = 'loading'
  try {
    const { mine: _mine, ...query } = filters
    const result = await listQcms({ ...query, page: page.value, ...(mineActive.value && user.value ? { owner: user.value.id } : {}) })
    if (id !== loadId) return
    items.value = result.items
    totalPages.value = Math.max(1, result.totalPages)
    totalItems.value = result.totalItems
    state.value = 'ready'
  } catch {
    if (id === loadId) state.value = 'error'
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

watch(filters, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})

// Connexion ou déconnexion pendant que « Mes QCM » est coché : la liste change.
watch(
  () => user.value?.id,
  () => {
    if (filters.mine) void load()
  },
)

watch(
  () => filters.mine,
  (mine) => {
    const url = new URL(window.location.href)
    if (mine) url.searchParams.set('mes', '1')
    else url.searchParams.delete('mes')
    window.history.replaceState(null, '', url)
  },
)

// Retour du réseau après une erreur : on recharge la liste sans attendre un clic.
function onOnline(): void {
  if (state.value === 'error') void load()
}

onMounted(() => {
  window.addEventListener('keydown', onEscape)
  window.addEventListener('online', onOnline)
  void load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
  window.removeEventListener('online', onOnline)
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <form class="qcm-panel sticky top-[calc(var(--site-header)+0.5rem)] z-20 hidden grid-cols-1 gap-4 p-4 sm:grid sm:grid-cols-3 sm:p-5 lg:grid-cols-[2fr_1fr_1fr_1fr]" role="search" @submit.prevent="submit">
      <div class="sm:col-span-3 lg:col-span-1">
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
      <div>
        <label class="qcm-label" for="lib-sort">Trier par</label>
        <select id="lib-sort" v-model="filters.sort" class="qcm-field">
          <option value="recent">Les plus récents</option>
          <option value="rating">Les mieux notés</option>
          <option value="title">Titre (A à Z)</option>
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

    <ul v-if="state === 'loading'" class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Chargement de la bibliothèque">
      <li v-for="n in 6" :key="n" class="qcm-panel flex flex-col gap-3 p-4">
        <div class="qcm-skeleton aspect-video w-full" />
        <div class="qcm-skeleton h-6 w-3/4" />
        <div class="qcm-skeleton h-4 w-1/2" />
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
      <p class="text-base font-bold text-ink-soft" role="status">{{ totalItems === 1 ? '1 QCM' : `${totalItems} QCM` }}</p>
      <ul class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="item in items"
          :key="item.id"
          class="qcm-panel group relative flex flex-col overflow-hidden transition-transform hover:-translate-y-0.5 focus-within:-translate-y-0.5"
        >
          <img v-if="qcmThumbnailUrl(item)" :src="qcmThumbnailUrl(item)" alt="" loading="lazy" class="aspect-video w-full border-b-[1.5px] border-line-soft bg-bg object-cover" />
          <div v-else class="flex aspect-[3/1] w-full items-center justify-center border-b-[1.5px] border-line-soft" :class="SUBJECT_TONES[item.subject]" aria-hidden="true">
            <span class="px-4 text-center text-2xl font-extrabold opacity-80">{{ SUBJECT_LABELS[item.subject] }}</span>
          </div>
          <div class="flex flex-1 flex-col gap-3 p-5">
            <p class="flex flex-wrap gap-1.5">
              <span class="qcm-chip" :class="SUBJECT_TONES[item.subject]">{{ SUBJECT_LABELS[item.subject] }}</span>
              <span class="qcm-chip">{{ LEVEL_LABELS[item.level] }}</span>
              <span v-if="mineActive" class="qcm-chip" :class="STATUS_CHIPS[item.status].tone">{{ STATUS_CHIPS[item.status].label }}</span>
            </p>
            <h2 class="text-xl leading-snug font-extrabold">
              <a :href="`/qcm?id=${item.id}`" class="no-underline after:absolute after:inset-0 group-hover:underline">{{ item.title }}</a>
            </h2>
            <p class="text-base font-medium text-ink-soft">{{ item.chapter }}</p>
            <p class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-sm font-bold text-ink-soft">
              <span>{{ questionCountLabel(item.question_count) }}</span>
              <span v-if="item.has_images">Avec images</span>
              <span v-if="item.rating_count > 0" :aria-label="`Note ${item.rating_avg.toFixed(1)} sur 5`">★ {{ item.rating_avg.toFixed(1) }}</span>
            </p>
            <div class="relative z-10 flex items-center gap-2">
              <a :href="`/qcm?id=${item.id}`" class="qcm-block qcm-block-primary qcm-block-sm flex-1 justify-center no-underline" :aria-label="`Voir ${item.title}`">Voir</a>
              <a v-if="mineActive" :href="`/editeur?id=${item.id}`" class="qcm-block qcm-block-quiet qcm-block-sm justify-center no-underline" :aria-label="`Modifier ${item.title}`">Modifier</a>
              <button type="button" class="qcm-icon-button flex-none" :aria-label="`Télécharger ${item.title}`" title="Télécharger" @click="downloadQcm(item)">
                <UiIcon name="download" />
              </button>
            </div>
          </div>
        </li>
      </ul>

      <nav v-if="totalPages > 1" aria-label="Pages de résultats" class="flex items-center justify-center gap-4">
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" :disabled="page <= 1" @click="goTo(page - 1)">← Précédente</button>
        <span class="text-base font-bold">Page {{ page }} sur {{ totalPages }}</span>
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" :disabled="page >= totalPages" @click="goTo(page + 1)">Suivante →</button>
      </nav>
    </template>
    <!-- Place pour la barre de recherche fixée en bas (téléphone). -->
    <div class="h-24 sm:hidden" aria-hidden="true" />
  </div>
</template>
