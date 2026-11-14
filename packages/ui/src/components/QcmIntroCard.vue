<script setup lang="ts">
import { computed } from 'vue'
import { LEVEL_LABELS, SUBJECT_LABELS, type QcmMeta } from '@qcm/core'

const props = defineProps<{
  meta: QcmMeta
  questionCount: number
  hasImages: boolean
}>()

const emit = defineEmits<{ start: [] }>()

const facts = computed(() => [
  { label: 'Matière', value: SUBJECT_LABELS[props.meta.subject] },
  { label: 'Niveau', value: LEVEL_LABELS[props.meta.level] },
  { label: 'Chapitre', value: props.meta.chapter },
  { label: 'Questions', value: props.questionCount === 1 ? '1 question' : `${props.questionCount} questions` },
  { label: 'Images', value: props.hasImages ? 'Avec images' : 'Sans image' },
])
</script>

<template>
  <section class="qcm-card mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8" aria-labelledby="qcm-intro-title">
    <h1 id="qcm-intro-title" class="text-3xl leading-tight font-extrabold text-ink">{{ meta.title }}</h1>
    <p v-if="meta.description" class="text-ink-soft">{{ meta.description }}</p>

    <dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div
        v-for="fact in facts"
        :key="fact.label"
        class="rounded-2xl border-2 border-line bg-bg px-4 py-3"
      >
        <dt class="text-sm font-semibold text-ink-soft">{{ fact.label }}</dt>
        <dd class="text-lg font-bold text-ink">{{ fact.value }}</dd>
      </div>
    </dl>

    <button type="button" class="qcm-block qcm-block-primary w-full text-xl" @click="emit('start')">
      Commencer
      <span class="qcm-key" aria-hidden="true">Entrée</span>
    </button>
  </section>
</template>
