<script setup lang="ts">
import { QcmPlayer } from '@qcm/ui'
import { DEMO_QCM } from '../lib/demoQcm.ts'
</script>

<template>
  <!-- Encart de hauteur fixe : le lecteur le remplit, la page autour ne bouge pas. -->
  <!-- Clavier désactivé : le lecteur est intégré dans une page que l'on fait défiler. -->
  <div class="qcm-card mx-auto h-[36rem] max-h-[80dvh] max-w-3xl overflow-hidden">
    <QcmPlayer :qcm="DEMO_QCM" :keyboard="false" />
  </div>
</template>
