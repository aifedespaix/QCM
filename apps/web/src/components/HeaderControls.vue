<script setup lang="ts">
import { ref } from 'vue'
import { QcmSoundToggle, QcmThemeToggle } from '@qcm/ui'
import { useAuth } from '../lib/pb.ts'

const { user, loginWithGoogle, logout } = useAuth()
const error = ref('')

function login(): void {
  error.value = ''
  // Appel direct dans le clic : la fenêtre Google n'est pas bloquée.
  loginWithGoogle().catch(() => {
    error.value = 'La connexion n\'a pas abouti.'
  })
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <template v-if="user">
      <span class="max-w-40 truncate text-base font-bold">{{ user.name || 'Mon compte' }}</span>
      <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" @click="logout">Se déconnecter</button>
    </template>
    <button v-else type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" @click="login">
      Se connecter avec Google
    </button>
    <QcmSoundToggle />
    <QcmThemeToggle />
    <p v-if="error" role="alert" class="w-full text-sm font-semibold text-retry-ink">{{ error }}</p>
  </div>
</template>
