<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { LEVELS, LEVEL_LABELS, SUBJECTS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'
import { listQcms, qcmDownloadUrl, qcmThumbnailUrl, type QcmRecord, type QcmSort } from '../lib/pb.ts'
import { SUBJECT_TONES, questionCountLabel } from '../lib/subjects.ts'

const filters = reactive<{ search: string; subject: Subject | ''; level: Level | ''; sort: QcmSort }>({
  search: '',
  subject: '',
  level: '',
  sort: 'recent',
})
const items = ref<QcmRecord[]>([])
const page = ref(1)
const totalPages = ref(1)
const totalItems = ref(0)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const filtered = computed(() => !!(filters.search.trim() || filters.subject || filters.level))
let debounce: ReturnType<typeof setTimeout> | undefined

async function load(): Promise<void> {
  state.value = 'loading'
  try {
    const result = await listQcms({ ...filters, page: page.value })
    items.value = result.items
    totalPages.value = Math.max(1, result.totalPages)
    totalItems.value = result.totalItems
    state.value = 'ready'
  } catch {
    state.value = 'error'
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

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-6">
    <form class="qcm-panel grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-[2fr_1fr_1fr_1fr]" role="search" @submit.prevent="load">
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

    <ul v-if="state === 'loading'" class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Chargement de la bibliothèque">
      <li v-for="n in 6" :key="n" class="qcm-panel flex flex-col gap-3 p-4">
        <div class="qcm-skeleton aspect-video w-full" />
        <div class="qcm-skeleton h-6 w-3/4" />
        <div class="qcm-skeleton h-4 w-1/2" />
      </li>
    </ul>

    <div v-else-if="state === 'error'" role="alert" class="qcm-note qcm-note-retry flex flex-wrap items-center justify-between gap-3 text-lg">
      La bibliothèque ne répond pas pour le moment. Tu peux réessayer dans un instant.
      <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="load">Réessayer</button>
    </div>

    <div v-else-if="items.length === 0" class="qcm-panel flex flex-col items-center gap-4 p-10 text-center">
      <p class="text-xl font-extrabold">{{ filtered ? 'Aucun QCM ne correspond à cette recherche.' : 'La bibliothèque est encore vide.' }}</p>
      <button v-if="filtered" type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="resetFilters">Effacer les filtres</button>
      <a v-else href="/editeur" class="qcm-block qcm-block-primary qcm-block-sm no-underline">Créer le premier QCM</a>
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
            <a :href="qcmDownloadUrl(item)" class="qcm-block qcm-block-quiet qcm-block-sm relative z-10 no-underline" :aria-label="`Télécharger ${item.title}`">Télécharger</a>
          </div>
        </li>
      </ul>

      <nav v-if="totalPages > 1" aria-label="Pages de résultats" class="flex items-center justify-center gap-4">
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" :disabled="page <= 1" @click="goTo(page - 1)">← Précédente</button>
        <span class="text-base font-bold">Page {{ page }} sur {{ totalPages }}</span>
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" :disabled="page >= totalPages" @click="goTo(page + 1)">Suivante →</button>
      </nav>
    </template>
  </div>
</template>
