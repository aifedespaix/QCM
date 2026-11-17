<script setup lang="ts">
import type { QcmHistoryEntry } from '@qcm/core'
import { QcmStatsDashboard, useQcmHistory } from '@qcm/ui'

const { history, clearAttempts } = useQcmHistory()

/** Sur le site, un QCM se relance depuis sa fiche de la bibliothèque. */
function canOpen(entry: QcmHistoryEntry): boolean {
  return !!entry.recordId
}

/** Fiche du QCM dans la bibliothèque (seulement s'il en vient). */
function ficheUrl(entry: QcmHistoryEntry): string | null {
  return entry.recordId ? `/qcm?id=${entry.recordId}` : null
}

function open(key: string): void {
  const entry = history.value.entries.find((item) => item.key === key)
  if (entry?.recordId) window.location.href = `/qcm?id=${entry.recordId}&jouer=1`
}

function clear(): void {
  if (window.confirm('Effacer tout le suivi enregistré sur cet appareil ?')) clearAttempts()
}
</script>

<template>
  <QcmStatsDashboard :history="history" :can-open="canOpen" :link-for="ficheUrl" @open="open" @clear="clear">
    <template #empty>
      <a href="/bibliotheque" class="qcm-block qcm-block-primary qcm-block-sm no-underline">Choisir un QCM dans la bibliothèque</a>
    </template>
  </QcmStatsDashboard>
</template>
