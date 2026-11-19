<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AGENT_TOKEN_DAYS,
  createAgentToken,
  listAgentTokens,
  revokeAgentToken,
  useAuth,
  type AgentTokenRecord,
} from '../lib/pb.ts'
import ConfirmDialog from './ConfirmDialog.vue'
import UiIcon from './UiIcon.vue'

/**
 * Page « Agent IA » : le membre connecté crée un jeton, le donne à un agent avec l'adresse du site,
 * et l'agent publie des QCM sous son nom. Le jeton ne s'affiche qu'une fois ; seul son hachage est gardé.
 */
const { user, loginWithGoogle } = useAuth()
const siteUrl = window.location.origin

const tokens = ref<AgentTokenRecord[]>([])
const listState = ref<'idle' | 'loading' | 'error'>('idle')
const name = ref('Mon agent')
const days = ref<(typeof AGENT_TOKEN_DAYS)[number]>(30)
const creating = ref(false)
const formError = ref('')
const loginError = ref('')
const fresh = ref<{ token: string } | null>(null)
const copied = ref<'token' | 'brief' | ''>('')
const toRevoke = ref<AgentTokenRecord | null>(null)
const revoking = ref(false)
const revokeError = ref('')

/** Texte à coller à l'agent : adresse du site, jeton et marche à suivre. */
const brief = computed(() =>
  fresh.value
    ? [
        'Tu peux publier des QCM sur ma bibliothèque QCM.',
        '',
        `Adresse du site : ${siteUrl}`,
        `Jeton d'agent : ${fresh.value.token}`,
        '',
        'Marche à suivre : dépôt https://github.com/aifedespaix/QCM, fichier docs/agent-publication.md.',
        'Résumé : écris un dossier avec data.yaml et media/*.webp, puis lance',
        `QCM_SITE_URL=${siteUrl} QCM_AGENT_TOKEN=<jeton> bun run --filter @qcm/web publish-qcm <dossier>`,
        'Ne partage jamais le jeton et ne l\'écris dans aucun fichier du dépôt.',
      ].join('\n')
    : '',
)

async function load(): Promise<void> {
  listState.value = 'loading'
  try {
    tokens.value = await listAgentTokens()
    listState.value = 'idle'
  } catch {
    listState.value = 'error'
  }
}

watch(
  () => user.value?.id,
  (id) => {
    fresh.value = null
    if (id) void load()
    else tokens.value = []
  },
  { immediate: true },
)

async function create(): Promise<void> {
  const label = name.value.trim()
  if (!label) {
    formError.value = 'Donne un nom au jeton, par exemple le nom de l\'agent.'
    return
  }
  creating.value = true
  formError.value = ''
  try {
    const created = await createAgentToken(label, days.value)
    fresh.value = { token: created.token }
    copied.value = ''
    await load()
  } catch (error) {
    formError.value = (error as { message?: string })?.message || 'Le jeton n\'a pas pu être créé.'
  } finally {
    creating.value = false
  }
}

async function copy(what: 'token' | 'brief'): Promise<void> {
  const value = what === 'token' ? fresh.value?.token : brief.value
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    copied.value = what
  } catch {
    formError.value = 'La copie n\'a pas abouti : sélectionne le texte et copie-le à la main.'
  }
}

async function revoke(): Promise<void> {
  if (!toRevoke.value) return
  revoking.value = true
  revokeError.value = ''
  try {
    await revokeAgentToken(toRevoke.value.id)
    toRevoke.value = null
    await load()
  } catch {
    revokeError.value = 'La révocation n\'a pas abouti. Réessaie.'
  } finally {
    revoking.value = false
  }
}

function login(): void {
  loginError.value = ''
  loginWithGoogle().catch(() => {
    loginError.value = 'La connexion n\'a pas abouti.'
  })
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const formatDate = (value: string): string => (value ? dateFormat.format(new Date(value.replace(' ', 'T'))) : 'jamais')
const isExpired = (token: AgentTokenRecord): boolean => new Date(token.expires.replace(' ', 'T')).getTime() < Date.now()
</script>

<template>
  <section v-if="!user" class="qcm-panel mx-auto mt-6 flex max-w-xl flex-col items-center gap-4 p-10 text-center">
    <h1 class="text-3xl font-extrabold">Agent IA</h1>
    <p class="text-lg text-ink-soft">Connecte-toi pour créer un jeton. Un agent pourra alors publier des QCM à ton nom, sans connaître ton compte.</p>
    <button type="button" class="qcm-block qcm-block-primary" @click="login">Se connecter avec Google</button>
    <p v-if="loginError" role="alert" class="font-semibold text-retry-ink">{{ loginError }}</p>
  </section>

  <div v-else class="flex flex-col gap-6">
    <header>
      <h1 class="text-3xl font-extrabold sm:text-4xl">Agent IA</h1>
      <p class="mt-1 text-lg text-ink-soft">
        Crée un jeton et donne-le à un agent avec l'adresse du site. Il publie des QCM à ton nom ; ils passent par la même relecture que les tiens.
      </p>
    </header>

    <!-- Jeton tout juste créé : visible une seule fois -->
    <section v-if="fresh" class="qcm-panel flex flex-col gap-4 p-5 sm:p-7" aria-labelledby="fresh-title">
      <h2 id="fresh-title" class="text-xl font-extrabold">Ton jeton est prêt</h2>
      <p class="qcm-note qcm-note-retry">Copie-le maintenant. Il ne s'affichera plus : le site n'en garde qu'une empreinte.</p>
      <code class="block rounded-xl bg-sunken p-3 font-mono text-sm break-all select-all">{{ fresh.token }}</code>
      <div class="flex flex-wrap gap-3">
        <button type="button" class="qcm-block qcm-block-primary qcm-block-sm" @click="copy('brief')">
          <UiIcon name="check" :size="20" />
          {{ copied === 'brief' ? 'Instructions copiées' : 'Copier les instructions pour l\'agent' }}
        </button>
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="copy('token')">
          {{ copied === 'token' ? 'Jeton copié' : 'Copier le jeton seul' }}
        </button>
        <button type="button" class="qcm-text-button" @click="fresh = null">J'ai copié, masquer</button>
      </div>
      <details>
        <summary class="cursor-pointer font-bold">Voir les instructions</summary>
        <pre class="mt-2 overflow-x-auto rounded-xl bg-sunken p-3 text-sm whitespace-pre-wrap">{{ brief }}</pre>
      </details>
    </section>

    <!-- Création -->
    <form class="qcm-panel flex flex-col gap-4 p-5 sm:p-7" @submit.prevent="create">
      <h2 class="text-xl font-extrabold">Nouveau jeton</h2>
      <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label class="flex flex-col gap-1 font-bold">
          Nom
          <input v-model="name" class="qcm-field font-normal" maxlength="60" placeholder="Exemple : Claude, physique-chimie" />
        </label>
        <label class="flex flex-col gap-1 font-bold">
          Durée de validité
          <select v-model="days" class="qcm-field font-normal">
            <option v-for="n in AGENT_TOKEN_DAYS" :key="n" :value="n">{{ n }} jours</option>
          </select>
        </label>
      </div>
      <p v-if="formError" role="alert" class="qcm-note qcm-note-retry">{{ formError }}</p>
      <div>
        <button type="submit" class="qcm-block qcm-block-primary qcm-block-sm" :disabled="creating">{{ creating ? 'Création…' : 'Créer le jeton' }}</button>
      </div>
      <p class="text-sm text-ink-soft">Le jeton permet seulement de publier et de mettre à jour tes QCM. Tu peux le révoquer à tout moment.</p>
    </form>

    <!-- Jetons existants -->
    <section class="qcm-panel flex flex-col gap-3 p-5 sm:p-7" aria-labelledby="list-title">
      <h2 id="list-title" class="text-xl font-extrabold">Tes jetons</h2>
      <ul v-if="listState === 'loading'" role="status" aria-label="Chargement"><li class="qcm-skeleton h-14" /></ul>
      <p v-else-if="listState === 'error'" role="alert" class="qcm-note qcm-note-retry">La liste ne se charge pas. <button type="button" class="qcm-text-button underline" @click="load">Réessayer</button></p>
      <p v-else-if="tokens.length === 0" class="text-ink-soft">Aucun jeton pour le moment.</p>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="item in tokens" :key="item.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-line p-3">
          <div class="min-w-0">
            <p class="truncate font-bold">{{ item.name }} <span class="font-mono text-sm font-normal text-ink-soft">{{ item.prefix }}…</span></p>
            <p class="text-sm text-ink-soft">
              {{ isExpired(item) ? 'Expiré le' : 'Valable jusqu\'au' }} {{ formatDate(item.expires) }} · dernier usage : {{ formatDate(item.last_used) }}
            </p>
          </div>
          <button type="button" class="qcm-text-button" @click="((revokeError = ''), (toRevoke = item))">Révoquer</button>
        </li>
      </ul>
    </section>

    <ConfirmDialog
      :open="toRevoke !== null"
      title="Révoquer ce jeton ?"
      confirm-label="Révoquer"
      :busy="revoking"
      :error="revokeError"
      @confirm="revoke"
      @cancel="toRevoke = null"
    >
      L'agent qui l'utilise ne pourra plus publier. Les QCM déjà envoyés restent en place.
    </ConfirmDialog>
  </div>
</template>
