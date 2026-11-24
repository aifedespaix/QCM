<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { SUBJECT_LABELS, suggestNext, type QcmArchive } from '@qcm/core'
import { QcmPlayer, QcmSubjectBand, SUBJECT_HUES, useQcmHistory, type QcmSuggestion } from '@qcm/ui'
import { deleteQcm, downloadQcm, fetchQcmArchive, getQcm, listQcms, qcmThumbnailUrl, setQcmStatus, useAuth, type QcmRecord } from '../lib/pb.ts'
import { questionCountLabel } from '../lib/subjects.ts'
import { libraryHref } from '../lib/libraryQuery.ts'
import { qcmPath } from '../lib/qcmUrl.ts'
import ConfirmDialog from './ConfirmDialog.vue'
import QcmReviews from './QcmReviews.vue'
import UiIcon, { type IconName } from './UiIcon.vue'

/**
 * Fiche d'un QCM. Un QCM publié arrive rendu par le serveur (`initial`) ; un QCM en attente ou masqué,
 * visible seulement par son auteur et la modération, est chargé ici avec le compte du navigateur.
 */
const props = defineProps<{ id: string; initial?: QcmRecord | null }>()

const STATUS: Record<QcmRecord['status'], { label: string; tone: string; icon: IconName }> = {
  pending: { label: 'En attente de validation', tone: 'bg-retry text-retry-ink', icon: 'clock' },
  published: { label: 'Publié', tone: 'bg-correct text-correct-ink', icon: 'check' },
  hidden: { label: 'Masqué', tone: 'bg-sunken', icon: 'eye-off' },
}

const { user } = useAuth()
const { history, recordOpen, recordResult } = useQcmHistory()
/** Clé du QCM dans le suivi local (posée au lancement du lecteur). */
const historyKey = ref('')
const SUGGESTION_COUNT = 4
/** QCM de la bibliothèque jamais faits, même matière : complètent les propositions de fin. */
const unplayed = shallowRef<QcmSuggestion[]>([])
const REASONS = { review: 'À revoir', progress: 'En progrès', started: 'À terminer', unplayed: 'Pas encore fait' } as const

/** Fin de QCM : d'abord ce qui n'est pas maîtrisé sur cet appareil, puis du neuf dans la même matière. */
const suggestions = computed<QcmSuggestion[]>(() => {
  const known = suggestNext(history.value, historyKey.value, { limit: SUGGESTION_COUNT, canOpen: (entry) => !!entry.recordId }).map(
    ({ entry, status }): QcmSuggestion => ({
      key: entry.recordId!,
      title: entry.title,
      subject: entry.subject,
      level: entry.level,
      chapter: entry.chapter,
      reason: status === 'acquired' ? '' : REASONS[status],
    }),
  )
  const seen = new Set([record.value?.id, ...history.value.entries.map((entry) => entry.recordId), ...known.map((item) => item.key)])
  return [...known, ...unplayed.value.filter((item) => !seen.has(item.key))].slice(0, SUGGESTION_COUNT)
})

async function loadUnplayed(): Promise<void> {
  const current = record.value
  if (!current) return
  try {
    const { items } = await listQcms({ subject: current.subject })
    unplayed.value = items.map((item) => ({
      key: item.id,
      title: item.title,
      subject: item.subject,
      level: item.level,
      chapter: item.chapter,
      reason: REASONS.unplayed,
    }))
  } catch {
    unplayed.value = []
  }
}

function playSuggestion(id: string): void {
  const title = suggestions.value.find((item) => item.key === id)?.title
  window.location.href = qcmPath({ id, title }, { play: true })
}
const state = ref<'loading' | 'ready' | 'missing'>(props.initial ? 'ready' : 'loading')
const record = shallowRef<QcmRecord | null>(props.initial ?? null)
const archive = shallowRef<QcmArchive | null>(null)
const playing = ref(false)
const starting = ref(false)
const playError = ref('')
const commentCount = ref<number | null>(null)
const mediaUrls = new Map<string, string>()

const manageBusy = ref(false)
const manageError = ref('')
const confirmingDelete = ref(false)
const deleting = ref(false)
const deleteError = ref('')

const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const isAdmin = computed(() => user.value?.admin === true)
const isOwner = computed(() => !!user.value && record.value?.owner === user.value.id)
const ownerName = computed(() => record.value?.expand?.owner?.name || 'un membre')
const average = computed(() => (record.value?.rating_avg ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))

function formatDate(value: string): string {
  // Fuseau fixé : le serveur et le navigateur écrivent la même date.
  return new Date(value.replace(' ', 'T')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
}

/** Mis à jour un autre jour que la publication : la date de mise à jour mérite d'être affichée. */
const updatedLater = computed(() => !!record.value?.updated && formatDate(record.value.updated) !== formatDate(record.value.created))
const commentTotal = computed(() => commentCount.value ?? record.value?.comment_count ?? 0)

/**
 * Panneau d'avis ouvert : « Noter » ou « Commentaires ». L'adresse suit (`#noter`, `#commentaires`) :
 * les liens des cartes de la bibliothèque ouvrent directement le bon panneau.
 */
type ReviewsView = 'rating' | 'comments'
const reviewsView = ref<ReviewsView | null>(null)
const HASHES: Record<ReviewsView, string> = { rating: '#noter', comments: '#commentaires' }

function openReviews(view: ReviewsView): void {
  reviewsView.value = view
  window.history.replaceState(window.history.state, '', HASHES[view])
}

function closeReviews(): void {
  reviewsView.value = null
  if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
}

function viewFromHash(): ReviewsView | null {
  const hash = window.location.hash
  if (hash === HASHES.rating) return 'rating'
  // `#avis` : ancienne ancre de la section, gardée pour les liens déjà partagés.
  if (hash === HASHES.comments || hash === '#avis') return 'comments'
  return null
}

/** Message bref de confirmation, effacé tout seul. */
function showToast(text: string): void {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 4000)
}

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

async function play(): Promise<void> {
  if (!record.value || starting.value) return
  playError.value = ''
  starting.value = true
  try {
    archive.value ??= await fetchQcmArchive(record.value)
    historyKey.value = recordOpen(archive.value.data, { recordId: record.value.id })
    playing.value = true
    void loadUnplayed()
  } catch {
    playError.value = 'Ce QCM ne peut pas être lu en ligne pour le moment. Tu peux le télécharger.'
  } finally {
    starting.value = false
  }
}

function goLibrary(): void {
  window.location.href = '/bibliotheque'
}

async function copyLink(): Promise<void> {
  if (!record.value) return
  const url = new URL(qcmPath(record.value), window.location.origin)
  try {
    await navigator.clipboard.writeText(url.toString())
    showToast('Le lien est copié.')
  } catch {
    window.prompt('Copie ce lien pour partager le QCM :', url.toString())
  }
}

async function moderate(status: 'published' | 'hidden'): Promise<void> {
  if (!record.value || manageBusy.value) return
  manageBusy.value = true
  manageError.value = ''
  try {
    record.value = await setQcmStatus(record.value.id, status)
    showToast(status === 'published' ? 'QCM validé : il est visible dans la bibliothèque.' : 'QCM masqué de la bibliothèque.')
  } catch {
    manageError.value = 'La décision n\'a pas été enregistrée. Tu peux réessayer.'
  } finally {
    manageBusy.value = false
  }
}

async function removeQcm(): Promise<void> {
  if (!record.value || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteQcm(record.value.id)
    window.location.href = isOwner.value ? '/bibliotheque?mes=1' : '/bibliotheque'
  } catch {
    deleteError.value = 'La suppression n\'a pas abouti. Tu peux réessayer.'
    deleting.value = false
  }
}

onMounted(async () => {
  if (!record.value) {
    if (!props.id) {
      state.value = 'missing'
      return
    }
    try {
      record.value = await getQcm(props.id)
      document.title = `${record.value.title} · QCM`
      state.value = 'ready'
    } catch {
      state.value = 'missing'
      return
    }
  }
  // `…?jouer=1` (lien « Relancer » du suivi, propositions de fin) démarre le lecteur tout de suite.
  if (new URLSearchParams(window.location.search).has('jouer')) void play()
  else reviewsView.value = viewFromHash()
})

onBeforeUnmount(() => {
  clearTimeout(toastTimer)
  for (const url of mediaUrls.values()) URL.revokeObjectURL(url)
})
</script>

<template>
  <div v-if="state === 'loading'" role="status" aria-label="Chargement du QCM" class="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-6">
    <div class="qcm-panel flex flex-col gap-4 p-7">
      <div class="qcm-skeleton h-6 w-1/3" />
      <div class="qcm-skeleton h-10 w-3/4" />
      <div class="qcm-skeleton h-5 w-1/2" />
      <div class="qcm-skeleton h-20 w-full" />
    </div>
    <div class="qcm-panel flex flex-col gap-3 p-5">
      <div class="qcm-skeleton h-16 w-full" />
      <div class="qcm-skeleton h-16 w-full" />
    </div>
  </div>

  <section v-else-if="state === 'missing' || !record" class="qcm-panel mx-auto flex max-w-2xl flex-col items-center gap-4 p-10 text-center">
    <span class="qcm-tile bg-retry text-retry-ink"><UiIcon name="info" :size="26" /></span>
    <h1 class="text-3xl font-extrabold">Ce QCM est introuvable.</h1>
    <p class="text-lg text-ink-soft">Il a peut-être été retiré, ou le lien est incomplet.</p>
    <a href="/bibliotheque" class="qcm-block qcm-block-primary no-underline">
      <UiIcon name="back" />
      Retour à la bibliothèque
    </a>
  </section>

  <template v-else>
    <!-- Plein écran : le site s'efface, il ne reste que la question. La fiche garde son état derrière. -->
    <QcmPlayer v-if="playing && archive" :qcm="archive.data" :resolve-media="resolveMedia" closable immersive :suggestions="suggestions" @close="playing = false" @suggest="playSuggestion" @library="goLibrary" @result="recordResult(historyKey, $event)" />

    <div v-show="!playing" class="mx-auto flex max-w-4xl flex-col gap-4">
      <nav aria-label="Fil d'Ariane" class="-ml-2 flex min-w-0 items-center gap-0.5 text-sm font-bold text-ink-soft">
        <a href="/bibliotheque" class="qcm-text-button min-h-10 px-2">
          <UiIcon name="back" :size="18" />
          Bibliothèque
        </a>
        <span aria-hidden="true">/</span>
        <a :href="libraryHref({ subject: record.subject })" class="qcm-text-button min-h-10 truncate px-2">{{ SUBJECT_LABELS[record.subject] }}</a>
      </nav>

      <!-- Gestion : une barre compacte, visible uniquement par l'auteur et la modération -->
      <section
        v-if="isOwner || isAdmin"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-dashed border-ink-soft bg-surface p-3 sm:pl-4"
        aria-labelledby="manage-title"
      >
        <h2 id="manage-title" class="sr-only">{{ isOwner ? 'Gérer mon QCM' : 'Modération' }}</h2>
        <span class="qcm-chip" :class="STATUS[record.status].tone">
          <UiIcon :name="STATUS[record.status].icon" :size="16" :stroke="2.6" />
          {{ STATUS[record.status].label }}
        </span>
        <p class="min-w-0 flex-1 basis-48 text-sm text-ink-soft">
          <template v-if="record.status === 'pending'">Pas encore visible dans la bibliothèque.</template>
          <template v-else-if="record.status === 'hidden'">Masqué de la bibliothèque.</template>
          <template v-else-if="isOwner && !isAdmin">Après une modification, il est relu avant de redevenir public.</template>
          <a v-else-if="isAdmin" href="/admin" class="font-bold text-ink underline">File de modération</a>
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <a v-if="isOwner" :href="`/editeur?id=${record.id}`" class="qcm-block qcm-block-primary qcm-block-sm qcm-block-xs no-underline">
            <UiIcon name="pencil" :size="18" />
            Modifier
          </a>
          <template v-if="isAdmin">
            <button v-if="record.status !== 'published'" type="button" class="qcm-block qcm-block-sm qcm-block-xs bg-correct text-correct-ink" :disabled="manageBusy" @click="moderate('published')">
              <UiIcon name="check" :size="18" :stroke="3" />
              Publier
            </button>
            <button v-if="record.status !== 'hidden'" type="button" class="qcm-block qcm-block-quiet qcm-block-sm qcm-block-xs" :disabled="manageBusy" @click="moderate('hidden')">
              <UiIcon name="eye-off" :size="18" />
              Masquer
            </button>
          </template>
          <button type="button" class="qcm-icon-button qcm-icon-button-sm bg-retry text-retry-ink" :disabled="manageBusy" aria-label="Supprimer ce QCM" title="Supprimer" @click="((deleteError = ''), (confirmingDelete = true))">
            <UiIcon name="trash" :size="18" />
          </button>
        </div>
        <p v-if="manageError" role="alert" class="qcm-note qcm-note-retry basis-full">{{ manageError }}</p>
      </section>

      <!-- Présentation et actions : tout l'essentiel tient dans le premier écran -->
      <article class="qcm-panel overflow-hidden" :class="SUBJECT_HUES[record.subject]" aria-labelledby="qcm-title">
        <QcmSubjectBand :subject="record.subject" :level="record.level" class="sm:px-4" />
        <div class="flex gap-6 p-5 sm:p-7">
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <h1 id="qcm-title" class="text-2xl leading-tight font-extrabold sm:text-4xl">{{ record.title }}</h1>
              <p class="mt-1 text-base font-semibold text-ink-soft sm:text-lg">{{ record.chapter }}</p>
            </div>

            <ul class="-ml-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm font-bold" aria-label="En bref">
              <li class="qcm-stat">
                <UiIcon name="list" :size="16" :stroke="2" class="text-ink-soft" />
                {{ questionCountLabel(record.question_count) }}
              </li>
              <li v-if="record.has_images" class="qcm-stat">
                <UiIcon name="image" :size="16" :stroke="2" class="text-ink-soft" />
                Avec images
              </li>
            </ul>

            <!-- Avis : la note et les commentaires s'ouvrent dans un panneau, sans quitter la fiche -->
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="qcm-pill-button"
                aria-haspopup="dialog"
                :aria-label="record.rating_count > 0 ? `Note ${average} sur 5, ${record.rating_count} ${record.rating_count > 1 ? 'notes' : 'note'} : noter ce QCM` : 'Pas encore de note : noter ce QCM'"
                @click="openReviews('rating')"
              >
                <UiIcon name="star" :size="18" :stroke="2" class="site-star" :class="record.rating_count > 0 ? 'site-star-on' : ''" />
                <template v-if="record.rating_count > 0">
                  {{ average }}
                  <span class="font-semibold text-ink-soft">({{ record.rating_count }})</span>
                </template>
                <span class="qcm-pill-button-action">Noter</span>
              </button>
              <button
                type="button"
                class="qcm-pill-button"
                aria-haspopup="dialog"
                :aria-label="`${commentTotal} commentaire${commentTotal > 1 ? 's' : ''} : les lire ou en écrire un`"
                @click="openReviews('comments')"
              >
                <UiIcon name="comment" :size="18" :stroke="2" />
                {{ commentTotal }}
                <span class="hidden font-semibold text-ink-soft min-[26rem]:inline">{{ commentTotal > 1 ? 'commentaires' : 'commentaire' }}</span>
              </button>
            </div>

            <p v-if="record.description" class="max-w-prose text-base leading-relaxed whitespace-pre-line sm:text-lg">{{ record.description }}</p>

            <div class="mt-1 flex flex-wrap items-center gap-2.5">
              <button type="button" class="qcm-block qcm-block-primary min-h-14 flex-1 px-6 text-lg sm:flex-none" :disabled="starting" @click="play">
                <UiIcon name="play" :size="22" filled />
                {{ starting ? 'Préparation…' : 'Essayer en ligne' }}
              </button>
              <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm min-h-14 px-5" title="Le fichier .qcm s'ouvre dans le lecteur QCM, même sans connexion." @click="downloadQcm(record)">
                <UiIcon name="download" :size="20" />
                <span>Télécharger</span>
              </button>
              <div class="flex items-center">
                <button v-if="record.status === 'published'" type="button" class="site-icon-action" aria-label="Copier le lien du QCM" title="Copier le lien" @click="copyLink">
                  <UiIcon name="link" :size="20" />
                </button>
                <a v-if="!isOwner" :href="`/editeur?id=${record.id}`" class="site-icon-action" aria-label="Modifier une copie de ce QCM" title="Modifier une copie (l'original ne change pas, ta version est publiée à ton nom)">
                  <UiIcon name="copy" :size="20" />
                </a>
              </div>
            </div>
            <p v-if="playError" role="alert" class="qcm-note qcm-note-retry">{{ playError }}</p>

            <p class="flex min-w-0 items-center gap-2 border-t-[1.5px] border-line-soft pt-3 text-sm text-ink-soft">
              <span class="site-avatar size-7 border-[1.5px] bg-selected text-xs" aria-hidden="true">{{ (ownerName.trim()[0] ?? '?').toLocaleUpperCase('fr') }}</span>
              <span class="min-w-0">
                Proposé par <strong class="font-bold text-ink">{{ ownerName }}</strong> le {{ formatDate(record.created) }}<template v-if="updatedLater"> · mis à jour le {{ formatDate(record.updated) }}</template>
              </span>
            </p>
          </div>

          <img
            v-if="qcmThumbnailUrl(record)"
            :src="qcmThumbnailUrl(record)"
            alt=""
            width="480"
            height="270"
            class="hidden aspect-[4/3] w-56 flex-none self-start rounded-2xl border-[1.5px] border-line-soft bg-bg object-cover md:block"
          />
        </div>
      </article>

    </div>

    <QcmReviews :record="record" :view="reviewsView" @close="closeReviews" @rated="record = $event" @notice="showToast" @count="commentCount = $event" />


    <ConfirmDialog
      :open="confirmingDelete"
      :title="isOwner ? 'Supprimer ton QCM ?' : 'Supprimer ce QCM ?'"
      confirm-label="Supprimer définitivement"
      :busy="deleting"
      :error="deleteError"
      @confirm="removeQcm"
      @cancel="confirmingDelete = false"
    >
      <p>
        <strong class="text-ink">« {{ record.title }} »</strong> sera retiré de la bibliothèque, avec ses notes et ses commentaires. Cette action ne peut pas être annulée.
      </p>
    </ConfirmDialog>

    <div role="status" aria-live="polite">
      <Transition name="site-toast">
        <p v-if="toast" class="site-toast">
          <UiIcon name="check" :size="20" :stroke="3" />
          {{ toast }}
        </p>
      </Transition>
    </div>
  </template>
</template>
