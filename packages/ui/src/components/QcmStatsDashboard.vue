<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  LEVEL_LABELS,
  SUBJECT_LABELS,
  computeStats,
  formatRelativeDay,
  type OutcomeCounts,
  type QcmHistory,
  type QcmHistoryEntry,
  type QcmStat,
  type QcmStatus,
} from '@qcm/core'
import { SUBJECT_TONES } from '../subjects.ts'

/**
 * Tableau de suivi pour les parents : ce qui est acquis, ce qui est à retravailler.
 * Lecture seule sur l'historique ; l'hôte décide comment relancer un QCM.
 */
const props = withDefaults(
  defineProps<{
    history: QcmHistory
    /** `false` pour un QCM qui ne peut plus être relancé depuis cet écran. */
    canOpen?: (entry: QcmHistoryEntry) => boolean
  }>(),
  { canOpen: () => true },
)

const emit = defineEmits<{
  open: [key: string]
  clear: []
}>()

type Period = '7' | '30' | 'all'
const PERIODS: readonly { id: Period; label: string }[] = [
  { id: '7', label: '7 jours' },
  { id: '30', label: '30 jours' },
  { id: 'all', label: 'Tout' },
]
const STATUS: Record<QcmStatus, { label: string; tone: string }> = {
  review: { label: 'À revoir', tone: 'bg-retry text-retry-ink' },
  progress: { label: 'En progrès', tone: 'bg-primary' },
  started: { label: 'Commencé', tone: 'bg-sunken' },
  acquired: { label: 'Acquis', tone: 'bg-correct text-correct-ink' },
}
const LEGEND = [
  { id: 'first', label: 'Du premier coup', tone: 'bg-correct' },
  { id: 'retry', label: 'Après un nouvel essai', tone: 'bg-retry' },
  { id: 'revealed', label: 'Réponse affichée', tone: 'bg-selected' },
] as const
const TIMELINE_STEP = 10

const period = ref<Period>('30')
const timelineSize = ref(TIMELINE_STEP)
const now = Date.now()

const stats = computed(() =>
  computeStats(props.history, period.value === 'all' ? {} : { since: now - Number(period.value) * 86_400_000 }),
)
const hasAnyAttempt = computed(() => props.history.attempts.length > 0)
const toWork = computed(() => stats.value.qcms.filter((item) => item.status !== 'acquired'))
const acquired = computed(() => stats.value.qcms.filter((item) => item.status === 'acquired'))
const busiestDay = computed(() => Math.max(1, ...stats.value.week.map((day) => day.questions)))

function percent(rate: number | null): string {
  return rate === null ? '–' : `${Math.round(rate * 100)} %`
}

function share(counts: OutcomeCounts, id: (typeof LEGEND)[number]['id']): string {
  return `${counts.seen > 0 ? (counts[id] / counts.seen) * 100 : 0}%`
}

function summary(counts: OutcomeCounts): string {
  return `${counts.first} sur ${counts.seen} du premier coup`
}

function passages(count: number): string {
  return count === 1 ? '1 passage' : `${count} passages`
}

function trend(item: QcmStat): string {
  return item.trend.slice(-4).map(percent).join(' → ')
}

function dayLetter(day: number): string {
  return new Date(day).toLocaleDateString('fr-FR', { weekday: 'narrow' }).toLocaleUpperCase('fr')
}

function dayLabel(day: number): string {
  return new Date(day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div role="radiogroup" aria-label="Période" class="inline-flex gap-1 rounded-2xl bg-sunken p-1">
        <button
          v-for="item in PERIODS"
          :key="item.id"
          type="button"
          role="radio"
          :aria-checked="period === item.id"
          class="min-h-10 cursor-pointer rounded-xl border-2 px-4 text-sm font-bold"
          :class="period === item.id ? 'border-line bg-surface shadow-block-sm' : 'border-transparent text-ink-soft hover:text-ink'"
          @click="period = item.id"
        >
          {{ item.label }}
        </button>
      </div>
      <p class="text-sm font-semibold text-ink-soft">Le suivi reste sur cet appareil. Rien n'est envoyé.</p>
    </div>

    <section v-if="!hasAnyAttempt" class="qcm-panel flex flex-col items-center gap-3 p-10 text-center">
      <h2 class="text-2xl font-extrabold">Aucun QCM terminé pour le moment.</h2>
      <p class="max-w-xl text-lg text-ink-soft">
        Dès qu'un QCM est fait sur cet appareil, tu vois ici ce qui est acquis et ce qui mérite d'être revu.
      </p>
      <slot name="empty" />
    </section>

    <section v-else-if="stats.sessions === 0" class="qcm-panel flex flex-col items-center gap-3 p-10 text-center">
      <h2 class="text-2xl font-extrabold">Aucun QCM fait sur cette période.</h2>
      <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="period = 'all'">Voir tout le suivi</button>
    </section>

    <template v-else>
      <!-- ───────────── Vue d'ensemble ───────────── -->
      <section class="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Vue d'ensemble">
        <div class="qcm-panel flex flex-col gap-1 p-5">
          <p class="text-sm font-bold text-ink-soft">QCM faits</p>
          <p class="text-4xl leading-none font-extrabold tabular-nums">{{ stats.sessions }}</p>
          <p class="text-sm font-semibold text-ink-soft">{{ stats.completedSessions }} terminés jusqu'au bout</p>
        </div>
        <div class="qcm-panel flex flex-col gap-1 p-5">
          <p class="text-sm font-bold text-ink-soft">Questions vues</p>
          <p class="text-4xl leading-none font-extrabold tabular-nums">{{ stats.counts.seen }}</p>
          <p class="text-sm font-semibold text-ink-soft">{{ stats.qcms.length === 1 ? '1 QCM différent' : `${stats.qcms.length} QCM différents` }}</p>
        </div>
        <div class="qcm-panel flex flex-col gap-1 p-5">
          <p class="text-sm font-bold text-ink-soft">Réussies du premier coup</p>
          <p class="text-4xl leading-none font-extrabold tabular-nums">{{ percent(stats.rate) }}</p>
          <p class="text-sm font-semibold text-ink-soft">{{ stats.counts.first }} questions sur {{ stats.counts.seen }}</p>
        </div>
        <div class="qcm-panel flex flex-col gap-2 p-5">
          <p class="text-sm font-bold text-ink-soft">Cette semaine</p>
          <ol class="flex h-12 items-end gap-1.5" :aria-label="`${stats.activeDays} jours avec révision sur les 7 derniers`">
            <li v-for="day in stats.week" :key="day.day" class="flex h-full flex-1 flex-col justify-end gap-1" :title="`${dayLabel(day.day)} : ${day.questions} questions`">
              <span
                class="w-full rounded-md border-2"
                :class="day.sessions > 0 ? 'border-line bg-correct' : 'border-transparent bg-sunken'"
                :style="{ height: day.sessions > 0 ? `${Math.max(25, (day.questions / busiestDay) * 100)}%` : '6px' }"
              />
            </li>
          </ol>
          <p class="flex gap-1.5 text-center text-xs font-bold text-ink-soft" aria-hidden="true">
            <span v-for="day in stats.week" :key="day.day" class="flex-1">{{ dayLetter(day.day) }}</span>
          </p>
        </div>
      </section>

      <section class="qcm-panel flex flex-col gap-3 p-5" aria-label="Répartition des réponses">
        <div class="flex h-5 overflow-hidden rounded-full border-2 border-line bg-sunken" aria-hidden="true">
          <span v-for="item in LEGEND" :key="item.id" class="h-full" :class="item.tone" :style="{ width: share(stats.counts, item.id) }" />
        </div>
        <ul class="flex flex-wrap gap-x-6 gap-y-1 text-sm font-bold">
          <li v-for="item in LEGEND" :key="item.id" class="flex items-center gap-2">
            <span class="size-3.5 rounded-full border-2 border-line" :class="item.tone" aria-hidden="true" />
            {{ item.label }} : {{ stats.counts[item.id] }}
          </li>
        </ul>
      </section>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <!-- ───────────── À retravailler ───────────── -->
        <section class="qcm-panel flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="stats-work">
          <header>
            <h2 id="stats-work" class="text-2xl font-extrabold">À retravailler</h2>
            <p class="text-ink-soft">Les QCM les plus fragiles d'abord, d'après le dernier passage.</p>
          </header>
          <p v-if="toWork.length === 0" class="qcm-note qcm-note-correct">Rien à signaler : tous les QCM de la période sont acquis.</p>
          <ul v-else class="flex flex-col gap-3">
            <li v-for="item in toWork" :key="item.entry.key" class="flex flex-col gap-3 rounded-2xl border-[1.5px] border-line-soft bg-bg p-4">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="text-lg leading-snug font-extrabold break-words">{{ item.entry.title }}</h3>
                  <p class="text-sm font-semibold text-ink-soft">
                    {{ SUBJECT_LABELS[item.entry.subject] }} · {{ LEVEL_LABELS[item.entry.level] }} · {{ item.entry.chapter }}
                  </p>
                </div>
                <span class="qcm-chip flex-none" :class="STATUS[item.status].tone">{{ STATUS[item.status].label }}</span>
              </div>
              <div>
                <div class="flex h-3.5 overflow-hidden rounded-full border-2 border-line bg-sunken" aria-hidden="true">
                  <span v-for="tone in LEGEND" :key="tone.id" class="h-full" :class="tone.tone" :style="{ width: share(item.counts, tone.id) }" />
                </div>
                <p class="mt-1.5 text-sm font-bold">
                  {{ summary(item.counts) }}
                  <span class="font-semibold text-ink-soft">
                    · {{ formatRelativeDay(item.reference.at) }} · {{ passages(item.attempts.length) }}
                    <template v-if="item.status === 'started'"> · pas terminé</template>
                  </span>
                </p>
                <p v-if="item.trend.length > 1" class="text-sm font-semibold text-ink-soft">Progression : {{ trend(item) }}</p>
              </div>
              <details v-if="item.weak.length > 0" class="rounded-xl bg-surface">
                <summary class="cursor-pointer rounded-xl px-3 py-2 text-sm font-bold hover:bg-sunken">
                  {{ item.weak.length === 1 ? '1 question à revoir' : `${item.weak.length} questions à revoir` }}
                </summary>
                <ul class="flex flex-col gap-2 px-3 pt-1 pb-3">
                  <li v-for="question in item.weak" :key="question.id" class="flex flex-col gap-1 border-t-[1.5px] border-line-soft pt-2">
                    <p class="font-semibold select-text">{{ question.prompt }}</p>
                    <p class="flex flex-wrap gap-1.5">
                      <span class="qcm-chip" :class="question.outcome === 'revealed' ? 'bg-selected' : 'bg-retry text-retry-ink'">
                        {{ question.outcome === 'revealed' ? 'Réponse affichée' : 'Trouvée après un nouvel essai' }}
                      </span>
                      <span v-if="question.misses > 1" class="qcm-chip">Difficile sur {{ question.misses }} passages</span>
                    </p>
                  </li>
                </ul>
              </details>
              <button v-if="canOpen(item.entry)" type="button" class="qcm-block qcm-block-quiet qcm-block-sm sm:self-start" @click="emit('open', item.entry.key)">
                Relancer ce QCM
              </button>
            </li>
          </ul>
        </section>

        <div class="flex flex-col gap-6">
          <!-- ───────────── Acquis ───────────── -->
          <section class="qcm-panel flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="stats-ok">
            <h2 id="stats-ok" class="text-2xl font-extrabold">Acquis</h2>
            <p v-if="acquired.length === 0" class="text-ink-soft">Un QCM passe ici quand 8 questions sur 10 sont réussies du premier coup.</p>
            <ul v-else class="flex flex-col">
              <li v-for="item in acquired" :key="item.entry.key" class="flex items-center gap-3 border-t-[1.5px] border-line-soft py-2.5 first:border-t-0">
                <span class="flex size-8 flex-none items-center justify-center rounded-full border-2 border-line bg-correct text-correct-ink" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-bold">{{ item.entry.title }}</p>
                  <p class="text-sm font-semibold text-ink-soft">{{ summary(item.counts) }} · {{ formatRelativeDay(item.reference.at) }}</p>
                </div>
                <button
                  v-if="canOpen(item.entry)"
                  type="button"
                  class="qcm-text-button flex-none underline"
                  :aria-label="`Relancer ${item.entry.title}`"
                  @click="emit('open', item.entry.key)"
                >
                  Relancer
                </button>
              </li>
            </ul>
          </section>

          <!-- ───────────── Par matière ───────────── -->
          <section class="qcm-panel flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="stats-subjects">
            <h2 id="stats-subjects" class="text-2xl font-extrabold">Par matière</h2>
            <ul class="flex flex-col gap-3">
              <li v-for="item in stats.subjects" :key="item.subject">
                <p class="flex items-baseline justify-between gap-3 text-sm font-bold">
                  <span class="flex items-center gap-2">
                    <span class="size-3.5 rounded-full border-2 border-line" :class="SUBJECT_TONES[item.subject]" aria-hidden="true" />
                    {{ SUBJECT_LABELS[item.subject] }}
                  </span>
                  <span class="tabular-nums">{{ percent(item.rate) }}</span>
                </p>
                <div class="mt-1 flex h-3 overflow-hidden rounded-full border-2 border-line bg-sunken" aria-hidden="true">
                  <span v-for="tone in LEGEND" :key="tone.id" class="h-full" :class="tone.tone" :style="{ width: share(item.counts, tone.id) }" />
                </div>
                <p class="mt-1 text-xs font-semibold text-ink-soft">
                  {{ item.counts.seen }} questions vues · {{ item.qcmCount === 1 ? '1 QCM' : `${item.qcmCount} QCM` }}
                </p>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <!-- ───────────── Historique ───────────── -->
      <section class="qcm-panel flex flex-col gap-3 p-5 sm:p-6" aria-labelledby="stats-history">
        <h2 id="stats-history" class="text-2xl font-extrabold">Historique</h2>
        <ol class="flex flex-col">
          <li
            v-for="row in stats.timeline.slice(0, timelineSize)"
            :key="row.attempt.id"
            class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t-[1.5px] border-line-soft py-2.5 first:border-t-0 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,12rem)_auto]"
          >
            <p class="text-sm font-semibold text-ink-soft max-sm:col-span-2">{{ formatRelativeDay(row.attempt.at) }}</p>
            <p class="truncate font-bold">{{ row.entry.title }}</p>
            <p class="text-sm font-bold tabular-nums sm:order-last sm:text-right">
              {{ row.counts.first }} / {{ row.counts.seen }}
              <span v-if="!row.attempt.completed" class="font-semibold text-ink-soft">· arrêté avant la fin</span>
            </p>
            <div class="flex gap-0.5 max-sm:col-span-2" :aria-label="summary(row.counts)" role="img">
              <span
                v-for="(question, index) in row.attempt.questions"
                :key="index"
                class="h-3 min-w-1 flex-1 rounded-sm"
                :class="question.revealed ? 'bg-selected' : question.wrong > 0 ? 'bg-retry' : 'bg-correct'"
                :title="row.entry.prompts[question.id]"
              />
            </div>
          </li>
        </ol>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <button
            v-if="stats.timeline.length > timelineSize"
            type="button"
            class="qcm-block qcm-block-quiet qcm-block-sm"
            @click="timelineSize += TIMELINE_STEP * 2"
          >
            Afficher la suite
          </button>
          <span v-else />
          <button type="button" class="qcm-text-button underline" @click="emit('clear')">Effacer le suivi</button>
        </div>
      </section>
    </template>
  </div>
</template>
