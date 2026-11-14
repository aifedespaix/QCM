<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { LEVELS, LEVEL_LABELS, SUBJECTS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'
import { listQcms, qcmDownloadUrl, qcmThumbnailUrl, useAuth, type QcmRecord, type QcmSort } from '../lib/pb.ts'

const { user } = useAuth()

const filters = reactive<{ search: string; subject: Subject | ''; level: Level | ''; sort: QcmSort; pending: boolean }>({
  pending: false,
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
let debounce: ReturnType<typeof setTimeout> | undefined

async function load(): Promise<void> {
  state.value = 'loading'
  try {
    const result = await listQcms({ ...filters, status: filters.pending && user.value?.admin ? 'pending' : 'published', page: page.value })
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
    <form class="qcm-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4" role="search" @submit.prevent="load">
      <div>
        <label class="qcm-label" for="lib-search">Rechercher</label>
        <input id="lib-search" v-model="filters.search" class="qcm-field" type="search" placeholder="Titre ou chapitre" />
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
      <label v-if="user?.admin" class="flex items-center gap-3 text-lg font-bold sm:col-span-2 lg:col-span-4">
        <input v-model="filters.pending" type="checkbox" class="h-6 w-6" />
        Afficher seulement les QCM à valider
      </label>
    </form>

    <p v-if="state === 'loading'" role="status" class="text-lg font-bold text-ink-soft">Chargement de la bibliothèque…</p>
    <p v-else-if="state === 'error'" role="alert" class="rounded-2xl border-2 border-line bg-retry px-5 py-4 text-lg font-medium text-retry-ink">
      La bibliothèque ne répond pas pour le moment. Tu peux réessayer dans un instant.
    </p>
    <p v-else-if="items.length === 0" class="qcm-card p-6 text-lg">Aucun QCM ne correspond à cette recherche.</p>

    <template v-else>
      <p class="text-base font-bold text-ink-soft">{{ totalItems === 1 ? '1 QCM' : `${totalItems} QCM` }}</p>
      <ul class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="item in items" :key="item.id" class="qcm-card flex flex-col gap-3 overflow-hidden p-5">
          <img
            v-if="qcmThumbnailUrl(item)"
            :src="qcmThumbnailUrl(item)"
            alt=""
            loading="lazy"
            class="aspect-video w-full rounded-xl border-2 border-line bg-bg object-cover"
          />
          <h2 class="text-xl leading-snug font-extrabold">
            <a :href="`/qcm?id=${item.id}`" class="no-underline hover:underline">{{ item.title }}</a>
          </h2>
          <p class="text-base font-semibold text-ink-soft">
            {{ SUBJECT_LABELS[item.subject] }} · {{ LEVEL_LABELS[item.level] }} · {{ item.chapter }}
          </p>
          <p class="text-base text-ink-soft">
            {{ item.question_count === 1 ? '1 question' : `${item.question_count} questions` }}
            · {{ item.has_images ? 'Avec images' : 'Sans image' }}
            <template v-if="item.rating_count > 0"> · Note {{ item.rating_avg.toFixed(1) }} sur 5</template>
          </p>
          <div class="mt-auto grid grid-cols-2 gap-3 pt-2">
            <a :href="`/qcm?id=${item.id}`" class="qcm-block qcm-block-quiet min-h-12 px-3 py-2 text-base no-underline">Voir</a>
            <a :href="qcmDownloadUrl(item)" class="qcm-block qcm-block-primary min-h-12 px-3 py-2 text-base no-underline">Télécharger</a>
          </div>
        </li>
      </ul>

      <nav v-if="totalPages > 1" aria-label="Pages de résultats" class="flex items-center justify-center gap-4">
        <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" :disabled="page <= 1" @click="goTo(page - 1)">Page précédente</button>
        <span class="text-base font-bold">Page {{ page }} sur {{ totalPages }}</span>
        <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" :disabled="page >= totalPages" @click="goTo(page + 1)">Page suivante</button>
      </nav>
    </template>
  </div>
</template>
