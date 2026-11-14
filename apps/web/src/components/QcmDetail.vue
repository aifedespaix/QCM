<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { LEVEL_LABELS, SUBJECT_LABELS, type QcmArchive } from '@qcm/core'
import { QcmPlayer } from '@qcm/ui'
import {
  addComment,
  deleteComment,
  deleteQcm,
  fetchQcmArchive,
  getMyRating,
  getQcm,
  listComments,
  qcmDownloadUrl,
  rateQcm,
  setQcmStatus,
  useAuth,
  type CommentRecord,
  type QcmRecord,
} from '../lib/pb.ts'

const { user } = useAuth()
const state = ref<'loading' | 'ready' | 'missing'>('loading')
const record = shallowRef<QcmRecord | null>(null)
const archive = shallowRef<QcmArchive | null>(null)
const playing = ref(false)
const playError = ref('')
const myRating = ref(0)
const comments = ref<CommentRecord[]>([])
const commentText = ref('')
const notice = ref('')
const mediaUrls = new Map<string, string>()

const isAdmin = computed(() => user.value?.admin === true)
const isOwner = computed(() => !!user.value && record.value?.owner === user.value.id)

function resolveMedia(path: string): string | undefined {
  const cached = mediaUrls.get(path)
  if (cached) return cached
  const bytes = archive.value?.media.get(path)
  if (!bytes) return undefined
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const url = URL.createObjectURL(new Blob([buffer], { type: 'image/webp' }))
  mediaUrls.set(path, url)
  return url
}

async function refresh(id: string): Promise<void> {
  record.value = await getQcm(id)
  comments.value = (await listComments(id)).items
  myRating.value = (await getMyRating(id))?.value ?? 0
}

async function play(): Promise<void> {
  if (!record.value) return
  playError.value = ''
  try {
    archive.value ??= await fetchQcmArchive(record.value)
    playing.value = true
  } catch {
    playError.value = 'Ce QCM ne peut pas être lu en ligne pour le moment. Tu peux le télécharger.'
  }
}

async function rate(value: number): Promise<void> {
  if (!record.value) return
  await rateQcm(record.value.id, value)
  await refresh(record.value.id)
  notice.value = 'Ta note est enregistrée.'
}

async function sendComment(): Promise<void> {
  if (!record.value || !commentText.value.trim()) return
  const created = await addComment(record.value.id, commentText.value)
  comments.value = [created, ...comments.value]
  commentText.value = ''
}

async function removeComment(id: string): Promise<void> {
  await deleteComment(id)
  comments.value = comments.value.filter((comment) => comment.id !== id)
}

async function moderate(status: 'published' | 'hidden'): Promise<void> {
  if (!record.value) return
  record.value = await setQcmStatus(record.value.id, status)
  notice.value = status === 'published' ? 'QCM validé : il est visible dans la bibliothèque.' : 'QCM masqué de la bibliothèque.'
}

async function removeQcm(): Promise<void> {
  if (!record.value || !window.confirm('Supprimer définitivement ce QCM de la bibliothèque ?')) return
  await deleteQcm(record.value.id)
  window.location.href = '/bibliotheque'
}

onMounted(async () => {
  const id = new URLSearchParams(window.location.search).get('id')
  if (!id) {
    state.value = 'missing'
    return
  }
  try {
    await refresh(id)
    document.title = `${record.value?.title ?? 'QCM'} · QCM`
    state.value = 'ready'
  } catch {
    state.value = 'missing'
  }
})

onBeforeUnmount(() => {
  for (const url of mediaUrls.values()) URL.revokeObjectURL(url)
})
</script>

<template>
  <p v-if="state === 'loading'" role="status" class="text-lg font-bold text-ink-soft">Chargement du QCM…</p>

  <section v-else-if="state === 'missing' || !record" class="qcm-card flex flex-col gap-4 p-7">
    <h1 class="text-3xl font-extrabold">Ce QCM est introuvable.</h1>
    <a href="/bibliotheque" class="qcm-block qcm-block-primary no-underline sm:w-fit">Retour à la bibliothèque</a>
  </section>

  <div v-else-if="playing && archive" class="flex flex-col gap-5">
    <button type="button" class="qcm-block qcm-block-quiet min-h-12 self-start px-4 py-2 text-base" @click="playing = false">Quitter le QCM</button>
    <QcmPlayer :qcm="archive.data" :resolve-media="resolveMedia" closable @close="playing = false" />
  </div>

  <div v-else class="flex flex-col gap-8">
    <section class="qcm-card flex flex-col gap-5 p-7">
      <h1 class="text-3xl leading-tight font-extrabold sm:text-4xl">{{ record.title }}</h1>
      <p class="text-lg font-semibold text-ink-soft">
        {{ SUBJECT_LABELS[record.subject] }} · {{ LEVEL_LABELS[record.level] }} · {{ record.chapter }}
      </p>
      <p v-if="record.description" class="text-lg">{{ record.description }}</p>
      <p class="text-base text-ink-soft">
        {{ record.question_count === 1 ? '1 question' : `${record.question_count} questions` }}
        · {{ record.has_images ? 'Avec images' : 'Sans image' }}
        <template v-if="record.expand?.owner?.name"> · Proposé par {{ record.expand.owner.name }}</template>
        <template v-if="record.rating_count > 0"> · Note {{ record.rating_avg.toFixed(1) }} sur 5 ({{ record.rating_count }})</template>
      </p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <a :href="qcmDownloadUrl(record)" class="qcm-block qcm-block-primary text-xl no-underline">Télécharger le fichier .qcm</a>
        <button type="button" class="qcm-block qcm-block-quiet text-xl" @click="play">Essayer en ligne</button>
      </div>
      <p v-if="playError" role="alert" class="rounded-2xl border-2 border-line bg-retry px-5 py-4 font-medium text-retry-ink">{{ playError }}</p>
      <p v-if="record.status === 'pending'" role="status" class="rounded-2xl border-2 border-line bg-retry px-5 py-4 text-lg font-bold text-retry-ink">
        En attente de validation : ce QCM n'est pas encore visible dans la bibliothèque.
      </p>
      <p v-else-if="record.status === 'hidden'" role="status" class="rounded-2xl border-2 border-line bg-retry px-5 py-4 text-lg font-bold text-retry-ink">
        Ce QCM est masqué de la bibliothèque.
      </p>
      <div v-if="isAdmin" class="flex flex-wrap gap-3">
        <button v-if="record.status !== 'published'" type="button" class="qcm-block qcm-block-primary min-h-12 px-4 py-2 text-base" @click="moderate('published')">
          Valider ce QCM
        </button>
        <button v-if="record.status !== 'hidden'" type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" @click="moderate('hidden')">
          Masquer ce QCM
        </button>
      </div>
      <button v-if="isOwner || isAdmin" type="button" class="qcm-block qcm-block-quiet min-h-12 self-start px-4 py-2 text-base" @click="removeQcm">
        {{ isOwner ? 'Supprimer mon QCM' : 'Supprimer ce QCM' }}
      </button>
    </section>

    <section class="qcm-card flex flex-col gap-4 p-7" aria-labelledby="rating-title">
      <h2 id="rating-title" class="text-2xl font-extrabold">Noter ce QCM</h2>
      <p v-if="!user" class="text-lg text-ink-soft">Connecte-toi pour donner une note.</p>
      <div v-else class="flex flex-wrap gap-3" role="group" aria-label="Note de 1 à 5">
        <button
          v-for="value in 5"
          :key="value"
          type="button"
          class="qcm-block qcm-block-quiet min-w-16"
          :class="myRating === value ? 'bg-selected' : ''"
          :aria-pressed="myRating === value"
          @click="rate(value)"
        >
          {{ value }}
        </button>
      </div>
      <p v-if="notice" role="status" class="text-base font-semibold text-correct-ink">{{ notice }}</p>
    </section>

    <section class="qcm-card flex flex-col gap-4 p-7" aria-labelledby="comments-title">
      <h2 id="comments-title" class="text-2xl font-extrabold">Commentaires</h2>
      <form v-if="user" class="flex flex-col gap-3" @submit.prevent="sendComment">
        <label class="qcm-label" for="comment-text">Ton commentaire (500 caractères au plus)</label>
        <textarea id="comment-text" v-model="commentText" class="qcm-field" rows="3" maxlength="500" required />
        <button type="submit" class="qcm-block qcm-block-primary sm:w-fit">Envoyer</button>
      </form>
      <p v-else class="text-lg text-ink-soft">Connecte-toi pour écrire un commentaire.</p>
      <p v-if="comments.length === 0" class="text-lg text-ink-soft">Aucun commentaire pour le moment.</p>
      <ul v-else class="flex flex-col gap-3">
        <li v-for="comment in comments" :key="comment.id" class="rounded-2xl border-2 border-line bg-bg px-5 py-4">
          <p class="text-sm font-bold text-ink-soft">
            {{ comment.expand?.user?.name || 'Membre' }} · {{ new Date(comment.created).toLocaleDateString('fr-FR') }}
          </p>
          <p class="mt-1 text-lg whitespace-pre-line">{{ comment.text }}</p>
          <button
            v-if="user && comment.user === user.id"
            type="button"
            class="mt-2 text-sm font-bold underline"
            @click="removeComment(comment.id)"
          >
            Supprimer mon commentaire
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
