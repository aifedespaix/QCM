<script setup lang="ts">
import { computed } from 'vue'

/**
 * Zone de l'énoncé : le texte de la question et, s'il y en a une, son image.
 *
 * Elle occupe une part fixe de l'écran (voir `QcmPlayer`) : l'énoncé est centré dedans,
 * et l'image prend toute la place qui reste sans jamais pousser les réponses.
 */
const props = defineProps<{
  prompt: string
  /** URL affichable de l'image (déjà résolue), ou `undefined` s'il n'y a pas d'image. */
  imageUrl?: string
  /** Nombre de bonnes réponses à cocher quand il y en a plusieurs ; `0` ou `1` : réponse unique. */
  answerCount?: number
}>()

/** Un énoncé long est écrit un peu plus petit pour tenir sans défilement. */
const promptSize = computed(() => {
  // Avec une image, l'énoncé compte comme plus long : la place est partagée.
  const length = props.prompt.length + (props.imageUrl ? 60 : 0)
  if (length > 200) return 'text-base sm:text-xl'
  if (length > 110) return 'text-lg sm:text-2xl'
  return 'text-[1.3rem] sm:text-3xl'
})
</script>

<template>
  <section class="qcm-enter flex flex-col justify-center gap-3" aria-labelledby="qcm-question-prompt">
    <p v-if="answerCount && answerCount > 1" class="qcm-chip self-start bg-selected">
      Plusieurs réponses : coche les {{ answerCount }} bonnes réponses
    </p>
    <h2 id="qcm-question-prompt" class="leading-snug font-extrabold text-balance text-ink" :class="promptSize">{{ prompt }}</h2>

    <!-- L'image remplit l'espace restant : hauteur souple, jamais moins de 5rem. -->
    <div v-if="imageUrl" class="qcm-question-image relative flex-[1_1_0]">
      <img
        :src="imageUrl"
        alt="Image de la question"
        class="absolute inset-0 size-full rounded-2xl object-contain"
        draggable="false"
      />
    </div>
  </section>
</template>
