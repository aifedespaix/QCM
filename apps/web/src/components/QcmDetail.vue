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
import { SUBJECT_TONES, questionCountLabel } from '../lib/subjects.ts'

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
  <div v-if="state === 'loading'" role="status" aria-label="Chargement du QCM" class="qcm-panel flex flex-col gap-4 p-7">
    <div class="qcm-skeleton h-9 w-2/3" />
    <div class="qcm-skeleton h-5 w-1/3" />
    <div class="qcm-skeleton h-16 w-full" />
  </div>

  <section v-else-if="state === 'missing' || !record" class="qcm-panel flex flex-col items-center gap-4 p-10 text-center">
    <h1 class="text-3xl font-extrabold">Ce QCM est introuvable.</h1>
    <p class="text-lg text-ink-soft">Il a peut-être été retiré, ou le lien est incomplet.</p>
    <a href="/bibliotheque" class="qcm-block qcm-block-primary no-underline">Retour à la bibliothèque</a>
  </section>

  <!-- Plein écran : le site s'efface, il ne reste que la question. -->
  <QcmPlayer v-else-if="playing && archive" :qcm="archive.data" :resolve-media="resolveMedia" closable immersive @close="playing = false" />

  <div v-else class="mx-auto flex max-w-4xl flex-col gap-6">
    <a href="/bibliotheque" class="qcm-text-button self-start">← Bibliothèque</a>

    <p v-if="record.status === 'pending'" role="status" class="qcm-note qcm-note-retry">
      En attente de validation : ce QCM n'est pas encore visible dans la bibliothèque.
    </p>
    <p v-else-if="record.status === 'hidden'" role="status" class="qcm-note qcm-note-retry">Ce QCM est masqué de la bibliothèque.</p>

    <section class="qcm-panel flex flex-col gap-5 p-6 sm:p-9">
      <p class="flex flex-wrap gap-1.5">
        <span class="qcm-chip" :class="SUBJECT_TONES[record.subject]">{{ SUBJECT_LABELS[record.subject] }}</span>
        <span class="qcm-chip">{{ LEVEL_LABELS[record.level] }}</span>
        <span class="qcm-chip">{{ questionCountLabel(record.question_count) }}</span>
        <span class="qcm-chip">{{ record.has_images ? 'Avec images' : 'Sans image' }}</span>
        <span v-if="record.rating_count > 0" class="qcm-chip" :aria-label="`Note ${record.rating_avg.toFixed(1)} sur 5`">★ {{ record.rating_avg.toFixed(1) }} ({{ record.rating_count }})</span>
      </p>
      <div>
        <h1 class="text-3xl leading-tight font-extrabold sm:text-4xl">{{ record.title }}</h1>
        <p class="mt-2 text-lg font-semibold text-ink-soft">
          {{ record.chapter }}<template v-if="record.expand?.owner?.name"> · Proposé par {{ record.expand.owner.name }}</template>
        </p>
      </div>
      <p v-if="record.description" class="text-lg">{{ record.description }}</p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button type="button" class="qcm-block qcm-block-primary text-xl" @click="play">Essayer en ligne</button>
        <a :href="qcmDownloadUrl(record)" class="qcm-block qcm-block-quiet text-xl no-underline">Télécharger le fichier .qcm</a>
      </div>
      <p v-if="playError" role="alert" class="qcm-note qcm-note-retry">{{ playError }}</p>

      <div v-if="isOwner || isAdmin" class="flex flex-wrap items-center gap-2 border-t-[1.5px] border-line-soft pt-4">
        <template v-if="isAdmin">
          <button v-if="record.status !== 'published'" type="button" class="qcm-block qcm-block-primary qcm-block-sm" @click="moderate('published')">Valider</button>
          <button v-if="record.status !== 'hidden'" type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="moderate('hidden')">Masquer</button>
          <a href="/admin" class="qcm-text-button underline">Ouvrir la modération</a>
        </template>
        <button type="button" class="qcm-text-button ml-auto underline" @click="removeQcm">{{ isOwner ? 'Supprimer mon QCM' : 'Supprimer ce QCM' }}</button>
      </div>
    </section>

    <section class="qcm-panel flex flex-col gap-4 p-6 sm:p-9" aria-labelledby="rating-title">
      <h2 id="rating-title" class="text-2xl font-extrabold">Noter ce QCM</h2>
      <p v-if="!user" class="text-lg text-ink-soft">Connecte-toi pour donner une note.</p>
      <div v-else class="flex flex-wrap gap-2" role="group" aria-label="Note de 1 à 5">
        <button
          v-for="value in 5"
          :key="value"
          type="button"
          class="qcm-block qcm-block-quiet qcm-block-sm min-w-14 text-2xl"
          :class="value <= myRating ? 'bg-retry text-retry-ink' : ''"
          :aria-pressed="myRating === value"
          :aria-label="`${value} sur 5`"
          @click="rate(value)"
        >
          {{ value <= myRating ? '★' : '☆' }}
        </button>
      </div>
      <p v-if="notice" role="status" class="text-base font-semibold text-correct-ink">{{ notice }}</p>
    </section>

    <section class="qcm-panel flex flex-col gap-4 p-6 sm:p-9" aria-labelledby="comments-title">
      <h2 id="comments-title" class="text-2xl font-extrabold">Commentaires</h2>
      <form v-if="user" class="flex flex-col gap-3" @submit.prevent="sendComment">
        <label class="qcm-label" for="comment-text">Ton commentaire <span class="qcm-label-aside">{{ commentText.length }} / 500</span></label>
        <textarea id="comment-text" v-model="commentText" class="qcm-field" rows="3" maxlength="500" required />
        <button type="submit" class="qcm-block qcm-block-primary qcm-block-sm sm:w-fit sm:px-8">Envoyer</button>
      </form>
      <p v-else class="text-lg text-ink-soft">Connecte-toi pour écrire un commentaire.</p>
      <p v-if="comments.length === 0" class="text-lg text-ink-soft">Aucun commentaire pour le moment.</p>
      <ul v-else class="flex flex-col gap-3">
        <li v-for="comment in comments" :key="comment.id" class="rounded-2xl border-[1.5px] border-line-soft bg-bg px-5 py-4">
          <p class="text-sm font-bold text-ink-soft">
            {{ comment.expand?.user?.name || 'Membre' }} · {{ new Date(comment.created).toLocaleDateString('fr-FR') }}
          </p>
          <p class="mt-1 text-lg whitespace-pre-line">{{ comment.text }}</p>
          <button v-if="user && comment.user === user.id" type="button" class="qcm-text-button mt-1 -ml-2 underline" @click="removeComment(comment.id)">
            Supprimer mon commentaire
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
