<script setup lang="ts">
import { QcmPlayer } from '@qcm/ui'
import { DEMO_QCM } from '../lib/demoQcm.ts'
</script>

<template>
  <!-- Clavier désactivé : le lecteur est intégré dans une page que l'on fait défiler. -->
  <QcmPlayer :qcm="DEMO_QCM" :keyboard="false" />
</template>
