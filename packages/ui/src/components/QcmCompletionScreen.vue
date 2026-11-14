<script setup lang="ts">
defineProps<{
  title: string
  questionCount: number
  /** Affiche le bouton « Fermer » (lecteur desktop, aperçu web). */
  closable?: boolean
}>()

const emit = defineEmits<{
  restart: []
  close: []
}>()
</script>

<template>
  <section class="qcm-card mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 text-center sm:p-8" aria-labelledby="qcm-done-title">
    <h1 id="qcm-done-title" class="text-3xl font-extrabold text-ink">C'est terminé.</h1>
    <p class="text-lg text-ink">
      Tu as vu {{ questionCount === 1 ? 'la question' : `les ${questionCount} questions` }} de
      <strong class="font-bold">« {{ title }} »</strong>.
    </p>
    <div class="grid grid-cols-1 gap-4" :class="closable ? 'sm:grid-cols-2' : ''">
      <button
        type="button"
        class="qcm-block"
        :class="closable ? 'qcm-block-quiet' : 'qcm-block-primary'"
        @click="emit('restart')"
      >
        Recommencer
      </button>
      <button v-if="closable" type="button" class="qcm-block qcm-block-primary" @click="emit('close')">Fermer</button>
    </div>
  </section>
</template>
