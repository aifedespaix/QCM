<script setup lang="ts">
import { LEVEL_LABELS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'
import { SUBJECT_HUES, SUBJECT_MARKS } from '../subjects.ts'

/**
 * Bandeau de matière en tête d'une carte : fond teinté léger, pictogramme sur pastille
 * de la couleur de la matière, nom en petites capitales et niveau à droite.
 * La couleur aide à repérer d'un coup d'œil ; le nom écrit reste la vraie information.
 */
const props = defineProps<{ subject: Subject; level?: Level }>()
/** Noms raccourcis pour tenir dans le bandeau d'une carte étroite (le nom complet reste en infobulle). */
const SHORT_LABELS: Partial<Record<Subject, string>> = { 'histoire-geo': 'Histoire-géo' }
const mark = SUBJECT_MARKS[props.subject]
</script>

<template>
  <div class="qcm-subject-band" :class="SUBJECT_HUES[subject]">
    <span class="qcm-subject-mark" aria-hidden="true">
      <svg v-if="'path' in mark" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path :d="mark.path" />
      </svg>
      <span v-else class="text-[0.62rem] leading-none font-extrabold tracking-wide">{{ mark.text }}</span>
    </span>
    <span class="min-w-0 flex-1 truncate" :title="SUBJECT_LABELS[subject]">{{ SHORT_LABELS[subject] ?? SUBJECT_LABELS[subject] }}</span>
    <span v-if="level" class="qcm-subject-level">{{ LEVEL_LABELS[level] }}</span>
    <slot />
  </div>
</template>
