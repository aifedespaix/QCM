<script setup lang="ts">
import { qcmPath } from '../lib/qcmUrl.ts'
import { computed, onMounted, ref } from 'vue'
import { LEVEL_LABELS, SUBJECT_LABELS, computeStats, formatRelativeDay } from '@qcm/core'
import { useQcmHistory } from '@qcm/ui'
import { loadStoredDraft } from '../lib/draftStore.ts'

/**
 * Raccourcis « reprendre » de l'accueil de l'app installée : brouillon en cours, dernier QCM,
 * QCM à revoir. Tout vient de cet appareil ; rien n'est affiché s'il n'y a rien à reprendre.
 */
const { history } = useQcmHistory()

const draft = ref<{ title: string; questions: number; savedAt: number } | null>(null)

onMounted(async () => {
  try {
    const stored = await loadStoredDraft('new')
    const questions = stored?.data.questions.filter((question) => question.prompt.trim()).length ?? 0
    if (stored && (questions > 0 || stored.data.title.trim())) {
      draft.value = { title: stored.data.title.trim() || 'QCM sans titre', questions, savedAt: stored.savedAt }
    }
  } catch {
    // IndexedDB indisponible (navigation privée) : pas de raccourci, c'est tout.
  }
})

const stats = computed(() => computeStats(history.value))
const last = computed(() => stats.value.qcms.find((item) => item.entry.recordId) ?? null)
const toReview = computed(() =>
  stats.value.qcms
    .filter((item) => item.status !== 'acquired' && item.entry.recordId && item !== last.value)
    .slice(0, 3),
)
const empty = computed(() => !draft.value && !last.value)

function fiche(entry: { recordId?: string; title: string }, play = false): string {
  return qcmPath({ id: entry.recordId ?? '', title: entry.title }, { play })
}
</script>

<template>
  <section v-if="!empty" class="flex flex-col gap-4" aria-labelledby="reprendre-titre">
    <h2 id="reprendre-titre" class="text-xl font-extrabold">Reprendre</h2>
    <ul class="flex flex-col gap-3">
      <li v-if="draft">
        <a href="/editeur" class="qcm-card flex items-center gap-3 bg-selected p-4 no-underline">
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-sm font-bold text-ink-soft">Brouillon en cours</span>
            <span class="truncate text-lg font-extrabold">{{ draft.title }}</span>
            <span class="text-sm font-semibold text-ink-soft">
              {{ draft.questions === 1 ? '1 question' : `${draft.questions} questions` }} · {{ formatRelativeDay(draft.savedAt) }}
            </span>
          </span>
          <span class="qcm-chip flex-none bg-surface">Continuer</span>
        </a>
      </li>
      <li v-if="last">
        <a :href="fiche(last.entry, true)" class="qcm-card flex items-center gap-3 p-4 no-underline">
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-sm font-bold text-ink-soft">Dernier QCM · {{ formatRelativeDay(last.reference.at) }}</span>
            <span class="truncate text-lg font-extrabold">{{ last.entry.title }}</span>
            <span class="text-sm font-semibold text-ink-soft">
              {{ SUBJECT_LABELS[last.entry.subject] }} · {{ LEVEL_LABELS[last.entry.level] }}
            </span>
          </span>
          <span class="qcm-chip flex-none bg-primary">Relancer</span>
        </a>
      </li>
    </ul>

    <div v-if="toReview.length > 0" class="flex flex-col">
      <h3 class="mb-1 text-base font-extrabold">À revoir</h3>
      <ul class="flex flex-col">
        <li v-for="item in toReview" :key="item.entry.key" class="border-t-[1.5px] border-line-soft first:border-t-0">
          <a :href="fiche(item.entry)" class="flex min-h-12 items-center justify-between gap-3 py-2 no-underline">
            <span class="min-w-0 truncate font-bold">{{ item.entry.title }}</span>
            <span class="text-sm font-semibold whitespace-nowrap text-ink-soft">{{ item.counts.first }}/{{ item.counts.seen }} du 1<sup>er</sup> coup</span>
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>
