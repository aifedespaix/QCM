<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { QcmSoundToggle, QcmThemeToggle } from '@qcm/ui'
import { countQcmsByStatus, useAuth } from '../lib/pb.ts'

const { user, loginWithGoogle, logout } = useAuth()
const error = ref('')
const pendingCount = ref(0)
const onAdminPage = window.location.pathname.startsWith('/admin')
const onAgentPage = window.location.pathname.startsWith('/agent')

const initial = computed(() => (user.value?.name?.trim()[0] ?? '?').toLocaleUpperCase('fr'))

function login(): void {
  error.value = ''
  // Appel direct dans le clic : la fenêtre Google n'est pas bloquée.
  loginWithGoogle().catch(() => {
    error.value = 'La connexion n\'a pas abouti.'
  })
}

watch(
  () => user.value?.admin === true,
  (admin) => {
    pendingCount.value = 0
    if (admin) {
      countQcmsByStatus('pending')
        .then((count) => (pendingCount.value = count))
        .catch(() => {})
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="relative flex flex-nowrap items-center gap-2">
    <a v-if="user?.admin" href="/admin" class="site-nav-link whitespace-nowrap" :aria-current="onAdminPage ? 'page' : undefined">
      Modération
      <span v-if="pendingCount > 0" class="qcm-chip bg-retry text-retry-ink" :aria-label="`${pendingCount} QCM à valider`">{{ pendingCount }}</span>
    </a>
    <a v-if="user" href="/agent" class="site-nav-link hidden whitespace-nowrap xl:inline-flex" :aria-current="onAgentPage ? 'page' : undefined">Agent IA</a>
    <template v-if="user">
      <span class="flex items-center gap-2 pr-1" :title="user.name || 'Mon compte'">
        <span class="flex size-10 items-center justify-center rounded-full border-2 border-line bg-selected text-base font-extrabold" aria-hidden="true">{{ initial }}</span>
        <span class="hidden max-w-36 truncate text-base font-bold 2xl:inline">{{ user.name || 'Mon compte' }}</span>
      </span>
      <button type="button" class="qcm-text-button whitespace-nowrap" @click="logout">Se déconnecter</button>
    </template>
    <button v-else type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="login">Se connecter</button>
    <QcmSoundToggle />
    <QcmThemeToggle />
    <p v-if="error" role="alert" class="absolute top-full right-0 mt-1 text-sm font-semibold text-retry-ink">{{ error }}</p>
  </div>
</template>
