<script setup lang="ts">
/**
 * Logo QCM : quatre réponses, dont une cochée.
 * Dessiné en ligne pour suivre le thème clair ou sombre.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 48 })
</script>

<template>
  <svg class="qcm-logo" viewBox="0 0 48 48" :width="size" :height="size" fill="none" aria-hidden="true">
    <g stroke="var(--qcm-line)" stroke-width="2.5">
      <rect x="2.25" y="2.25" width="19" height="19" rx="5.5" fill="var(--qcm-badge-a)" />
      <rect x="26.75" y="2.25" width="19" height="19" rx="5.5" fill="var(--qcm-badge-b)" />
      <rect x="26.75" y="26.75" width="19" height="19" rx="5.5" fill="var(--qcm-badge-d)" />
      <rect x="2.25" y="26.75" width="19" height="19" rx="5.5" fill="var(--qcm-correct)" />
    </g>
    <path d="M7.2 36.4l3.3 3.3 6.1-7.3" stroke="var(--qcm-correct-ink)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
