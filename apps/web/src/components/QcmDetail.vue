<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { LEVEL_LABELS, SUBJECT_LABELS, type QcmArchive } from '@qcm/core'
import { QcmPlayer, useQcmHistory } from '@qcm/ui'
import { deleteQcm, downloadQcm, fetchQcmArchive, getQcm, qcmThumbnailUrl, setQcmStatus, useAuth, type QcmRecord } from '../lib/pb.ts'
import { SUBJECT_TONES, questionCountLabel } from '../lib/subjects.ts'
import ConfirmDialog from './ConfirmDialog.vue'
import QcmReviews from './QcmReviews.vue'
import UiIcon, { type IconName } from './UiIcon.vue'

const STATUS: Record<QcmRecord['status'], { label: string; tone: string; icon: IconName }> = {
  pending: { label: 'En attente de validation', tone: 'bg-retry text-retry-ink', icon: 'clock' },
  published: { label: 'Publié', tone: 'bg-correct text-correct-ink', icon: 'check' },
  hidden: { label: 'Masqué', tone: 'bg-sunken', icon: 'eye-off' },
}

const { user } = useAuth()
const { recordOpen, recordResult } = useQcmHistory()
/** Clé du QCM dans le suivi local (posée au lancement du lecteur). */
let historyKey = ''
const state = ref<'loading' | 'ready' | 'missing'>('loading')
const record = shallowRef<QcmRecord | null>(null)
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
  return new Date(value.replace(' ', 'T')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
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
    historyKey = recordOpen(archive.value.data, { recordId: record.value.id })
    playing.value = true
  } catch {
    playError.value = 'Ce QCM ne peut pas être lu en ligne pour le moment. Tu peux le télécharger.'
  } finally {
    starting.value = false
  }
}

async function copyLink(): Promise<void> {
  const url = new URL(window.location.href)
  url.searchParams.delete('jouer')
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
  const id = new URLSearchParams(window.location.search).get('id')
  if (!id) {
    state.value = 'missing'
    return
  }
  try {
    record.value = await getQcm(id)
    document.title = `${record.value.title} · QCM`
    state.value = 'ready'
    // `/qcm?id=…&jouer=1` (lien « Relancer » du suivi) démarre le lecteur tout de suite.
    if (new URLSearchParams(window.location.search).has('jouer')) void play()
  } catch {
    state.value = 'missing'
  }
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
    <QcmPlayer v-if="playing && archive" :qcm="archive.data" :resolve-media="resolveMedia" closable immersive @close="playing = false" @result="recordResult(historyKey, $event)" />

    <div v-show="!playing" class="mx-auto flex max-w-6xl flex-col gap-4">
      <a href="/bibliotheque" class="qcm-text-button -ml-2 self-start">
        <UiIcon name="back" :size="20" />
        Bibliothèque
      </a>

      <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-6">
        <!-- Présentation -->
        <div class="flex min-w-0 flex-col gap-4 lg:col-start-1">
          <p v-if="record.status !== 'published'" role="status" class="qcm-note qcm-note-retry flex items-start gap-3">
            <UiIcon :name="STATUS[record.status].icon" class="mt-0.5" />
            <span v-if="record.status === 'pending'">En attente de validation : ce QCM n'est pas encore visible dans la bibliothèque.</span>
            <span v-else>Ce QCM est masqué de la bibliothèque.</span>
          </p>

          <section class="qcm-panel overflow-hidden" aria-labelledby="qcm-title">
            <div class="h-3" :class="SUBJECT_TONES[record.subject]" aria-hidden="true" />
            <div class="flex flex-col gap-4 p-5 sm:p-8">
              <p class="flex flex-wrap gap-1.5">
                <span class="qcm-chip px-3 py-1 text-base" :class="SUBJECT_TONES[record.subject]">{{ SUBJECT_LABELS[record.subject] }}</span>
                <span class="qcm-chip px-3 py-1 text-base">{{ LEVEL_LABELS[record.level] }}</span>
              </p>
              <div>
                <h1 id="qcm-title" class="text-3xl leading-tight font-extrabold sm:text-4xl">{{ record.title }}</h1>
                <p class="mt-2 text-xl font-semibold text-ink-soft">{{ record.chapter }}</p>
              </div>
              <p v-if="record.description" class="max-w-prose text-lg whitespace-pre-line">{{ record.description }}</p>

              <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t-[1.5px] border-line-soft pt-4">
                <p class="flex min-w-0 items-center gap-3">
                  <span class="site-avatar bg-selected" aria-hidden="true">{{ (ownerName.trim()[0] ?? '?').toLocaleUpperCase('fr') }}</span>
                  <span class="min-w-0 leading-snug">
                    <span class="block truncate font-bold">Proposé par {{ ownerName }}</span>
                    <span class="block text-sm text-ink-soft">le {{ formatDate(record.created) }}</span>
                  </span>
                </p>
                <a href="#avis" class="qcm-text-button -mr-2 gap-x-3" :aria-label="record.rating_count > 0 ? `Note ${average} sur 5, voir les avis` : 'Voir les avis'">
                  <span v-if="record.rating_count > 0" class="inline-flex items-center gap-1.5">
                    <UiIcon name="star" :size="20" class="site-star site-star-on" />
                    {{ average }}
                    <span class="font-semibold text-ink-soft">({{ record.rating_count }})</span>
                  </span>
                  <span v-else class="inline-flex items-center gap-1.5">
                    <UiIcon name="star" :size="20" class="site-star" />
                    Pas encore de note
                  </span>
                  <span v-if="commentCount !== null" class="inline-flex items-center gap-1.5">
                    <UiIcon name="comment" :size="20" />
                    {{ commentCount }}
                  </span>
                </a>
              </div>
            </div>
          </section>
        </div>

        <!-- Actions : sous la présentation sur téléphone, colonne collante sur grand écran -->
        <aside class="qcm-panel overflow-hidden lg:sticky lg:top-[calc(var(--site-header)+1.25rem)] lg:col-start-2 lg:row-span-3 lg:row-start-1" aria-label="Lancer ce QCM">
          <img v-if="qcmThumbnailUrl(record)" :src="qcmThumbnailUrl(record)" alt="" class="aspect-video w-full border-b-[1.5px] border-line-soft bg-bg object-cover" />
          <div class="flex flex-col gap-3 p-5">
            <button type="button" class="qcm-block qcm-block-primary text-xl" :disabled="starting" @click="play">
              <UiIcon name="play" :size="24" filled />
              {{ starting ? 'Préparation…' : 'Essayer en ligne' }}
            </button>
            <button type="button" class="qcm-block qcm-block-quiet" @click="downloadQcm(record)">
              <UiIcon name="download" />
              Télécharger
            </button>
            <p class="text-sm text-ink-soft">Le fichier .qcm s'ouvre dans le lecteur QCM, même sans connexion.</p>
            <p v-if="playError" role="alert" class="qcm-note qcm-note-retry">{{ playError }}</p>

            <dl class="flex flex-col gap-2.5 border-t-[1.5px] border-line-soft pt-4 text-base">
              <div class="flex items-center gap-3">
                <UiIcon name="list" class="text-ink-soft" />
                <dt class="sr-only">Longueur</dt>
                <dd class="font-bold">{{ questionCountLabel(record.question_count) }}</dd>
              </div>
              <div class="flex items-center gap-3">
                <UiIcon name="image" class="text-ink-soft" />
                <dt class="sr-only">Images</dt>
                <dd class="font-bold">{{ record.has_images ? 'Avec images' : 'Sans image' }}</dd>
              </div>
              <div class="flex items-center gap-3">
                <UiIcon name="calendar" class="text-ink-soft" />
                <dt class="sr-only">Dernière mise à jour</dt>
                <dd class="font-bold">Mis à jour le {{ formatDate(record.updated || record.created) }}</dd>
              </div>
            </dl>

            <div v-if="!isOwner || record.status === 'published'" class="-mx-2 flex flex-col border-t-[1.5px] border-line-soft pt-2">
              <a v-if="!isOwner" :href="`/editeur?id=${record.id}`" class="qcm-text-button" title="L'original ne change pas : ta version est publiée à ton nom.">
                <UiIcon name="copy" :size="20" />
                Modifier une copie
              </a>
              <button v-if="record.status === 'published'" type="button" class="qcm-text-button" @click="copyLink">
                <UiIcon name="link" :size="20" />
                Copier le lien
              </button>
            </div>
          </div>
        </aside>

        <!-- Gestion : visible uniquement par la personne qui a créé le QCM et par la modération -->
        <section v-if="isOwner || isAdmin" class="flex flex-col gap-4 rounded-3xl border-2 border-dashed border-ink-soft bg-surface p-5 sm:p-6 lg:col-start-1" aria-labelledby="manage-title">
          <header class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span class="qcm-tile bg-selected"><UiIcon :name="isOwner ? 'pencil' : 'shield'" :size="26" /></span>
            <div class="min-w-0 flex-1 basis-44">
              <h2 id="manage-title" class="text-xl leading-tight font-extrabold">{{ isOwner ? 'Gérer mon QCM' : 'Modération' }}</h2>
              <p class="text-sm text-ink-soft">{{ isOwner ? 'Les autres membres ne voient pas ce cadre.' : 'Cadre réservé à la modération.' }}</p>
            </div>
            <span class="qcm-chip px-3 py-1" :class="STATUS[record.status].tone">
              <UiIcon :name="STATUS[record.status].icon" :size="16" :stroke="2.6" />
              {{ STATUS[record.status].label }}
            </span>
          </header>

          <div class="flex flex-wrap items-center gap-3">
            <a v-if="isOwner" :href="`/editeur?id=${record.id}`" class="qcm-block qcm-block-primary qcm-block-sm flex-1 px-5 no-underline sm:flex-none">
              <UiIcon name="pencil" :size="20" />
              Modifier
            </a>
            <template v-if="isAdmin">
              <button
                v-if="record.status !== 'published'"
                type="button"
                class="qcm-block qcm-block-primary qcm-block-sm flex-1 bg-correct px-5 text-correct-ink sm:flex-none"
                :disabled="manageBusy"
                @click="moderate('published')"
              >
                <UiIcon name="check" :size="20" :stroke="3" />
                Valider et publier
              </button>
              <button v-if="record.status !== 'hidden'" type="button" class="qcm-block qcm-block-quiet qcm-block-sm flex-1 px-5 sm:flex-none" :disabled="manageBusy" @click="moderate('hidden')">
                <UiIcon name="eye-off" :size="20" />
                Masquer
              </button>
            </template>
            <button
              type="button"
              class="qcm-block qcm-block-quiet qcm-block-sm flex-1 bg-retry px-5 text-retry-ink sm:ml-auto sm:flex-none"
              :disabled="manageBusy"
              @click="((deleteError = ''), (confirmingDelete = true))"
            >
              <UiIcon name="trash" :size="20" />
              Supprimer
            </button>
          </div>

          <p v-if="manageError" role="alert" class="qcm-note qcm-note-retry">{{ manageError }}</p>
          <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
            <span v-if="isOwner && !isAdmin">Après une modification, ton QCM est relu avant de redevenir public.</span>
            <a v-if="isAdmin" href="/admin" class="font-bold text-ink underline">Ouvrir la file de modération</a>
          </p>
        </section>

        <QcmReviews class="lg:col-start-1" :record="record" @rated="record = $event" @notice="showToast" @count="commentCount = $event" />
      </div>
    </div>

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
