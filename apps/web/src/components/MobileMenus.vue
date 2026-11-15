<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useQcmSound, useQcmTheme } from '@qcm/ui'
import { countQcmsByStatus, useAuth } from '../lib/pb.ts'

/**
 * Les deux derniers onglets de la barre du bas (téléphone, tablette) : « Réglages » et « Compte ».
 * Chacun ouvre un petit panneau au-dessus de la barre, au lieu de changer de page.
 */
const { user, loginWithGoogle, logout } = useAuth()
const { muted, toggleMute } = useQcmSound()
const { theme, toggleTheme } = useQcmTheme()

const openPanel = ref<'settings' | 'account' | null>(null)
const error = ref('')
const pendingCount = ref(0)
const onAdminPage = window.location.pathname.startsWith('/admin')
const onStatsPage = window.location.pathname.startsWith('/statistiques')

const initial = computed(() => (user.value?.name?.trim()[0] ?? '?').toLocaleUpperCase('fr'))

function toggle(panel: 'settings' | 'account'): void {
  openPanel.value = openPanel.value === panel ? null : panel
}

function login(): void {
  error.value = ''
  // Appel direct dans le clic : la fenêtre Google n'est pas bloquée.
  loginWithGoogle()
    .then(() => (openPanel.value = null))
    .catch(() => {
      error.value = 'La connexion n\'a pas abouti.'
    })
}

function signOut(): void {
  logout()
  openPanel.value = null
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') openPanel.value = null
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

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <button type="button" class="site-tab" :aria-expanded="openPanel === 'settings'" aria-controls="tab-panel" @click="toggle('settings')">
    <span class="site-tab-icon" :class="openPanel === 'settings' ? 'site-tab-icon-on' : ''">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2.2" />
        <circle cx="9" cy="17" r="2.2" />
      </svg>
    </span>
    Réglages
  </button>

  <button type="button" class="site-tab" :aria-expanded="openPanel === 'account'" aria-controls="tab-panel" @click="toggle('account')">
    <span class="site-tab-icon relative" :class="openPanel === 'account' || onAdminPage ? 'site-tab-icon-on' : ''">
      <span v-if="user" class="text-base leading-none font-extrabold" aria-hidden="true">{{ initial }}</span>
      <svg v-else viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.6" />
        <path d="M5 20c.8-3.6 3.5-5.4 7-5.4s6.2 1.8 7 5.4" />
      </svg>
      <span v-if="pendingCount > 0" class="absolute -top-1.5 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-line bg-retry px-1 text-[0.65rem] font-extrabold text-retry-ink" :aria-label="`${pendingCount} QCM à valider`">{{ pendingCount }}</span>
    </span>
    {{ user ? 'Compte' : 'Connexion' }}
  </button>

  <template v-if="openPanel">
    <!-- Un appui à côté referme le panneau. -->
    <div class="fixed inset-0 z-40" aria-hidden="true" @click="openPanel = null" />
    <div id="tab-panel" class="site-tab-panel qcm-card qcm-enter" role="dialog" :aria-label="openPanel === 'settings' ? 'Réglages' : 'Compte'">
      <template v-if="openPanel === 'settings'">
        <p class="text-lg font-extrabold">Réglages</p>
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm w-full justify-between" :aria-pressed="!muted" @click="toggleMute">
          Sons
          <span class="qcm-chip" :class="muted ? '' : 'bg-correct text-correct-ink'">{{ muted ? 'Coupés' : 'Activés' }}</span>
        </button>
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm w-full justify-between" :aria-pressed="theme === 'dark'" @click="toggleTheme">
          Thème
          <span class="qcm-chip">{{ theme === 'dark' ? 'Sombre' : 'Clair' }}</span>
        </button>
        <a href="/statistiques" class="qcm-block qcm-block-quiet qcm-block-sm w-full justify-between no-underline" :aria-current="onStatsPage ? 'page' : undefined">
          Suivi des révisions
          <span aria-hidden="true">→</span>
        </a>
      </template>

      <template v-else-if="user">
        <p class="flex items-center gap-3">
          <span class="flex size-11 flex-none items-center justify-center rounded-full border-2 border-line bg-selected text-lg font-extrabold" aria-hidden="true">{{ initial }}</span>
          <span class="min-w-0 truncate text-lg font-extrabold">{{ user.name || 'Mon compte' }}</span>
        </p>
        <a v-if="user.admin" href="/admin" class="qcm-block qcm-block-quiet qcm-block-sm w-full justify-between no-underline" :aria-current="onAdminPage ? 'page' : undefined">
          Modération
          <span v-if="pendingCount > 0" class="qcm-chip bg-retry text-retry-ink">{{ pendingCount }} à valider</span>
        </a>
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm w-full" @click="signOut">Se déconnecter</button>
      </template>

      <template v-else>
        <p class="text-lg font-extrabold">Connexion</p>
        <p class="text-base text-ink-soft">Un compte sert à proposer un QCM, noter et commenter. Réviser ne demande aucun compte.</p>
        <button type="button" class="qcm-block qcm-block-primary qcm-block-sm w-full" @click="login">Se connecter avec Google</button>
        <p v-if="error" role="alert" class="text-sm font-semibold text-retry-ink">{{ error }}</p>
      </template>
    </div>
  </template>
</template>
