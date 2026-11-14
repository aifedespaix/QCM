<script setup lang="ts">
import { useQcmSound } from '../composables/useQcmSound.ts'

const { muted, toggleMute } = useQcmSound()
</script>

<template>
  <button
    type="button"
    class="qcm-icon-button"
    :aria-pressed="muted"
    :aria-label="muted ? 'Activer le son' : 'Couper le son'"
    :title="muted ? 'Activer le son' : 'Couper le son'"
    @click="toggleMute"
  >
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
      <template v-if="muted">
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      </template>
      <template v-else>
        <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />
      </template>
    </svg>
  </button>
</template>
