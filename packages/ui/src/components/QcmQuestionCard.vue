<script setup lang="ts">
defineProps<{
  /** Index de la question, à partir de 0. */
  index: number
  total: number
  prompt: string
  /** URL affichable de l'image (déjà résolue), ou `undefined` s'il n'y a pas d'image. */
  imageUrl?: string
}>()
</script>

<template>
  <section class="qcm-card mx-auto flex w-full max-w-3xl flex-col gap-5 p-5 sm:p-7" aria-labelledby="qcm-question-prompt">
    <header class="flex flex-col gap-2">
      <p class="text-base font-bold text-ink-soft">Question {{ index + 1 }} sur {{ total }}</p>
      <div class="flex gap-1.5" aria-hidden="true">
        <span
          v-for="step in total"
          :key="step"
          class="h-2.5 flex-1 rounded-full border-2 border-line"
          :class="step <= index ? 'bg-correct' : step === index + 1 ? 'bg-primary' : 'bg-sunken'"
        />
      </div>
    </header>

    <h2 id="qcm-question-prompt" class="text-2xl leading-snug font-extrabold text-ink">{{ prompt }}</h2>

    <img
      v-if="imageUrl"
      :src="imageUrl"
      alt="Image de la question"
      class="max-h-80 w-full rounded-2xl border-2 border-line bg-bg object-contain"
      draggable="false"
    />

    <slot />
  </section>
</template>
