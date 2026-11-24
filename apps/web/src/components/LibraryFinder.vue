<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LEVELS, LEVEL_LABELS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'
import { SUBJECT_HUES } from '@qcm/ui'
import { listFacetRows } from '../lib/pb.ts'
import { buildFacets, needsChapterStep, type FacetRow, type SubjectFacet } from '../lib/libraryQuery.ts'
import SheetDialog from './SheetDialog.vue'
import UiIcon from './UiIcon.vue'

/**
 * Assistant de recherche en deux étapes : la matière (avec le nombre de QCM et de chapitres), puis le
 * chapitre — seulement si le choix a un sens. Il ne cherche rien lui-même : il règle les filtres de la
 * bibliothèque (`apply`) et se ferme.
 */
const props = defineProps<{ open: boolean; level: Level | ''; subject: Subject | ''; chapter: string }>()
const emit = defineEmits<{ close: []; apply: [choice: { subject: Subject | ''; chapter: string; level: Level | '' }] }>()

const rows = ref<FacetRow[] | null>(null)
const loadState = ref<'idle' | 'loading' | 'error'>('idle')
const level = ref<Level | ''>(props.level)
const picked = ref<SubjectFacet | null>(null)
const chapterSearch = ref('')

async function loadRows(): Promise<void> {
  if (rows.value || loadState.value === 'loading') return
  loadState.value = 'loading'
  try {
    rows.value = await listFacetRows()
    loadState.value = 'idle'
  } catch {
    loadState.value = 'error'
  }
}

// À chaque ouverture : retour à la première étape, avec le niveau déjà choisi dans la page.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    level.value = props.level
    picked.value = null
    chapterSearch.value = ''
    void loadRows()
  },
  { immediate: true },
)

const facets = computed(() => buildFacets(rows.value ?? [], level.value))
const total = computed(() => facets.value.reduce((sum, facet) => sum + facet.count, 0))

const SEARCH_FROM = 8
const chapters = computed(() => {
  const needle = chapterSearch.value.trim().toLocaleLowerCase('fr')
  return (picked.value?.chapters ?? []).filter((chapter) => !needle || chapter.name.toLocaleLowerCase('fr').includes(needle))
})

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

function apply(subject: Subject | '', chapter = ''): void {
  emit('apply', { subject, chapter, level: level.value })
}

function pickSubject(facet: SubjectFacet): void {
  if (needsChapterStep(facet)) {
    picked.value = facet
    chapterSearch.value = ''
  } else {
    // Un seul chapitre, ou un QCM par chapitre : inutile de demander, on montre directement les QCM.
    apply(facet.subject)
  }
}
</script>

<template>
  <SheetDialog :open="open" :title="picked ? SUBJECT_LABELS[picked.subject] : 'Trouver un QCM'" @close="emit('close')">
    <p class="mb-3 text-sm font-bold text-ink-soft" aria-live="polite">
      <template v-if="picked">Étape 2 sur 2 · Chapitre</template>
      <template v-else>Étape 1 sur 2 · Matière</template>
    </p>

    <!-- Étape 1 : matières, serrées pour en voir un maximum sans défiler. -->
    <template v-if="!picked">
      <div class="mb-3">
        <label class="qcm-label" for="finder-level">Niveau</label>
        <select id="finder-level" v-model="level" class="qcm-field">
          <option value="">Tous les niveaux</option>
          <option v-for="item in LEVELS" :key="item" :value="item">{{ LEVEL_LABELS[item] }}</option>
        </select>
      </div>

      <div v-if="loadState === 'loading' || (!rows && loadState === 'idle')" class="grid grid-cols-2 gap-2" role="status" aria-label="Chargement des matières">
        <div v-for="n in 12" :key="n" class="qcm-skeleton h-14" />
      </div>
      <div v-else-if="loadState === 'error'" role="alert" class="qcm-note qcm-note-retry flex flex-wrap items-center justify-between gap-3">
        Impossible de charger les matières.
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="loadRows()">Réessayer</button>
      </div>
      <ul v-else class="grid grid-cols-2 gap-2">
        <li v-for="facet in facets" :key="facet.subject" :class="SUBJECT_HUES[facet.subject]">
          <button
            type="button"
            class="flex min-h-14 w-full cursor-pointer items-center gap-2.5 rounded-xl border-2 border-line bg-surface px-2.5 py-1.5 text-left hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-line-soft disabled:opacity-45 disabled:hover:translate-y-0"
            :disabled="facet.count === 0"
            @click="pickSubject(facet)"
          >
            <span class="size-3.5 flex-none rounded-full border-2 border-line bg-[var(--subject-strong)]" aria-hidden="true" />
            <span class="min-w-0">
              <span class="block truncate text-sm leading-tight font-extrabold">{{ SUBJECT_LABELS[facet.subject] }}</span>
              <span class="block truncate text-xs font-semibold text-ink-soft">
                <template v-if="facet.count === 0">Aucun QCM</template>
                <template v-else>{{ plural(facet.count, 'QCM', 'QCM') }}<template v-if="facet.chapters.length > 1"> · {{ facet.chapters.length }} chapitres</template></template>
              </span>
            </span>
          </button>
        </li>
      </ul>
    </template>

    <!-- Étape 2 : chapitres de la matière (le plus fourni d'abord). -->
    <template v-else>
      <button type="button" class="qcm-block qcm-block-primary mb-3 w-full justify-between" @click="apply(picked.subject)">
        <span>Tous les chapitres</span>
        <span class="text-sm">{{ plural(picked.count, 'QCM', 'QCM') }}</span>
      </button>
      <div v-if="picked.chapters.length >= SEARCH_FROM" class="relative mb-3">
        <label class="sr-only" for="finder-chapter-search">Chercher un chapitre</label>
        <UiIcon name="search" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-soft" />
        <input id="finder-chapter-search" v-model="chapterSearch" class="qcm-field pl-11" type="search" placeholder="Chercher un chapitre…" />
      </div>
      <ul class="flex flex-col gap-2">
        <li v-for="chapter in chapters" :key="chapter.name">
          <button
            type="button"
            class="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-line bg-surface px-3 py-2 text-left font-bold hover:-translate-y-0.5"
            @click="apply(picked.subject, chapter.name)"
          >
            <span class="min-w-0 flex-1 truncate" :title="chapter.name">{{ chapter.name }}</span>
            <span class="flex-none text-sm font-semibold text-ink-soft">{{ plural(chapter.count, 'QCM', 'QCM') }}</span>
          </button>
        </li>
      </ul>
      <p v-if="chapters.length === 0" class="py-4 text-center font-bold text-ink-soft">Aucun chapitre ne correspond.</p>
    </template>

    <template #footer>
      <button v-if="picked" type="button" class="qcm-block qcm-block-quiet w-full justify-center" @click="picked = null">
        <UiIcon name="back" :size="18" /> Changer de matière
      </button>
      <button v-else type="button" class="qcm-block qcm-block-quiet w-full justify-center" :disabled="total === 0 && !level" @click="apply('')">
        {{ level ? `Tous les QCM de ${LEVEL_LABELS[level]}` : 'Tous les QCM, sans choisir de matière' }}
      </button>
    </template>
  </SheetDialog>
</template>
