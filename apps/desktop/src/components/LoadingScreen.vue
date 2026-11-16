<script setup lang="ts">
import { QcmLogo } from '@qcm/ui'

withDefaults(defineProps<{ label?: string }>(), { label: 'Ouverture du QCM…' })
</script>

<template>
  <!-- Plein écran, sans bandeau : le logo respire pendant que le fichier se charge. -->
  <div class="flex h-dvh flex-col items-center justify-center gap-6 bg-bg text-ink" role="status">
    <QcmLogo :size="96" class="loading-logo" />
    <p class="text-lg font-bold text-ink-soft">{{ label }}</p>
  </div>
</template>

<style scoped>
.loading-logo {
  animation: loading-breathe 1.8s ease-in-out infinite;
}
@keyframes loading-breathe {
  50% {
    transform: scale(1.07);
  }
}
@media (prefers-reduced-motion: reduce) {
  .loading-logo {
    animation: none;
  }
}
</style>
