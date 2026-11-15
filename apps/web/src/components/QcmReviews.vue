<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  addComment,
  deleteComment,
  getMyRating,
  getQcm,
  listComments,
  rateQcm,
  removeRating,
  updateComment,
  useAuth,
  type CommentRecord,
  type QcmRecord,
} from '../lib/pb.ts'
import ConfirmDialog from './ConfirmDialog.vue'
import UiIcon from './UiIcon.vue'

/** Avis sur un QCM : la note (moyenne et note du membre), puis les commentaires. */
const props = defineProps<{ record: QcmRecord }>()
const emit = defineEmits<{
  /** La moyenne a changé : la fiche reçoit le QCM à jour. */
  rated: [record: QcmRecord]
  /** Message de confirmation à afficher par la fiche. */
  notice: [text: string]
  /** Nombre total de commentaires (pour le résumé en haut de fiche). */
  count: [total: number]
}>()

const MAX_LENGTH = 500
const RATING_LABELS = ['', 'À revoir', 'Moyen', 'Bien', 'Très bien', 'Excellent']
const AVATAR_TONES = ['bg-badge-a', 'bg-badge-b', 'bg-badge-c', 'bg-badge-d']

const { user, loginWithGoogle } = useAuth()
/** Le serveur n'accepte les notes et les commentaires que sur un QCM publié. */
const open = computed(() => props.record.status === 'published')

// ---------------------------------------------------------------- Note

const myRating = ref(0)
const hoverRating = ref(0)
const ratingBusy = ref(false)
const ratingError = ref('')
const loginError = ref('')
const shownRating = computed(() => hoverRating.value || myRating.value)
const average = computed(() => props.record.rating_avg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const ratingCountLabel = computed(() => (props.record.rating_count === 1 ? '1 note' : `${props.record.rating_count} notes`))

async function applyRating(action: () => Promise<unknown>, next: number, done: string): Promise<void> {
  if (ratingBusy.value) return
  const previous = myRating.value
  ratingBusy.value = true
  ratingError.value = ''
  myRating.value = next
  try {
    await action()
    emit('rated', await getQcm(props.record.id))
    emit('notice', done)
  } catch {
    myRating.value = previous
    ratingError.value = 'Ta note n\'a pas été enregistrée. Tu peux réessayer.'
  } finally {
    ratingBusy.value = false
  }
}

function rate(value: number): void {
  if (value === myRating.value) return
  void applyRating(() => rateQcm(props.record.id, value), value, myRating.value ? 'Ta note est modifiée.' : 'Ta note est enregistrée.')
}

function clearRating(): void {
  void applyRating(() => removeRating(props.record.id), 0, 'Ta note est retirée.')
}

function login(): void {
  loginError.value = ''
  // Appel direct dans le clic : la fenêtre Google n'est pas bloquée.
  loginWithGoogle().catch(() => {
    loginError.value = 'La connexion n\'a pas abouti.'
  })
}

// ---------------------------------------------------------------- Commentaires

const comments = ref<CommentRecord[]>([])
const total = ref(0)
const page = ref(1)
const listState = ref<'loading' | 'ready' | 'error'>('loading')
const loadingMore = ref(false)

const commentText = ref('')
const sending = ref(false)
const commentError = ref('')

const editingId = ref('')
const editText = ref('')
const saving = ref(false)
const editError = ref('')
const editField = ref<HTMLTextAreaElement[]>([])

const pendingDelete = ref<CommentRecord | null>(null)
const deleting = ref(false)
const deleteError = ref('')

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 60],
  ['day', 24],
  ['month', 30],
  ['year', 12],
]

function toDate(value: string): Date {
  return new Date(value.replace(' ', 'T'))
}

/** « il y a 3 jours », « hier », « à l'instant ». */
function timeAgo(value: string): string {
  let amount = (toDate(value).getTime() - Date.now()) / 1000
  if (Math.abs(amount) < 60) return 'à l\'instant'
  let unit: Intl.RelativeTimeFormatUnit = 'second'
  for (const [next, size] of UNITS) {
    if (Math.abs(amount) < size) break
    amount /= size
    unit = next
  }
  return relative.format(Math.round(amount), unit)
}

function fullDate(value: string): string {
  return toDate(value).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
}

function wasEdited(comment: CommentRecord): boolean {
  return !!comment.updated && toDate(comment.updated).getTime() - toDate(comment.created).getTime() > 5000
}

function authorName(comment: CommentRecord): string {
  return comment.expand?.user?.name || 'Membre'
}

function initialOf(name: string | undefined): string {
  return (name?.trim()[0] ?? '?').toLocaleUpperCase('fr')
}

/** Couleur stable par membre : la même personne garde la même pastille. */
function toneOf(userId: string): string {
  let sum = 0
  for (const char of userId) sum += char.charCodeAt(0)
  return AVATAR_TONES[sum % AVATAR_TONES.length]!
}

function setTotal(value: number): void {
  total.value = Math.max(0, value)
  emit('count', total.value)
}

async function loadComments(): Promise<void> {
  listState.value = 'loading'
  try {
    const result = await listComments(props.record.id)
    comments.value = result.items
    page.value = 1
    setTotal(result.totalItems)
    listState.value = 'ready'
  } catch {
    listState.value = 'error'
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value) return
  loadingMore.value = true
  try {
    const result = await listComments(props.record.id, page.value + 1)
    const known = new Set(comments.value.map((comment) => comment.id))
    comments.value = [...comments.value, ...result.items.filter((comment) => !known.has(comment.id))]
    page.value += 1
    setTotal(result.totalItems)
  } catch {
    commentError.value = 'La suite des commentaires ne se charge pas. Tu peux réessayer.'
  } finally {
    loadingMore.value = false
  }
}

async function sendComment(): Promise<void> {
  if (!commentText.value.trim() || sending.value) return
  sending.value = true
  commentError.value = ''
  try {
    const created = await addComment(props.record.id, commentText.value)
    comments.value = [created, ...comments.value]
    setTotal(total.value + 1)
    commentText.value = ''
    emit('notice', 'Ton commentaire est publié.')
  } catch {
    commentError.value = 'Ton commentaire n\'a pas été envoyé. Tu peux réessayer.'
  } finally {
    sending.value = false
  }
}

async function startEdit(comment: CommentRecord): Promise<void> {
  editingId.value = comment.id
  editText.value = comment.text
  editError.value = ''
  await nextTick()
  editField.value[0]?.focus()
}

async function saveEdit(): Promise<void> {
  const id = editingId.value
  if (!id || !editText.value.trim() || saving.value) return
  saving.value = true
  editError.value = ''
  try {
    const updated = await updateComment(id, editText.value)
    comments.value = comments.value.map((comment) => (comment.id === id ? updated : comment))
    editingId.value = ''
    emit('notice', 'Ton commentaire est modifié.')
  } catch {
    editError.value = 'La modification n\'a pas été enregistrée. Tu peux réessayer.'
  } finally {
    saving.value = false
  }
}

async function confirmDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteComment(target.id)
    comments.value = comments.value.filter((comment) => comment.id !== target.id)
    setTotal(total.value - 1)
    pendingDelete.value = null
    emit('notice', 'Ton commentaire est supprimé.')
  } catch {
    deleteError.value = 'La suppression n\'a pas abouti. Tu peux réessayer.'
  } finally {
    deleting.value = false
  }
}

async function loadMyRating(): Promise<void> {
  try {
    myRating.value = (await getMyRating(props.record.id))?.value ?? 0
  } catch {
    myRating.value = 0
  }
}

onMounted(() => {
  void loadComments()
  void loadMyRating()
})

// Connexion ou déconnexion sur la fiche : la note du membre et ses commentaires masqués changent.
watch(
  () => user.value?.id,
  () => {
    editingId.value = ''
    void loadMyRating()
    void loadComments()
  },
)
</script>

<template>
  <section id="avis" class="qcm-panel flex scroll-mt-24 flex-col gap-6 p-5 sm:p-8" aria-labelledby="reviews-title">
    <header class="flex items-center gap-4">
      <span class="qcm-tile bg-retry text-retry-ink"><UiIcon name="star" :size="26" filled /></span>
      <div>
        <h2 id="reviews-title" class="text-2xl leading-tight font-extrabold">Avis</h2>
        <p class="text-base text-ink-soft">Ta note et tes remarques aident les autres à choisir.</p>
      </div>
    </header>

    <p v-if="!open" class="qcm-note qcm-note-info flex items-start gap-3">
      <UiIcon name="info" class="mt-0.5" />
      Les notes et les commentaires s'ouvrent quand le QCM est publié dans la bibliothèque.
    </p>

    <!-- Note : la moyenne à gauche, la note du membre à droite -->
    <div class="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <div class="flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-sunken px-4 py-5 text-center">
        <template v-if="record.rating_count > 0">
          <p class="leading-none font-extrabold" :aria-label="`Note moyenne : ${average} sur 5`">
            <span class="text-5xl">{{ average }}</span>
            <span class="text-xl text-ink-soft"> / 5</span>
          </p>
          <span class="relative inline-flex" aria-hidden="true">
            <span class="inline-flex gap-0.5"><UiIcon v-for="n in 5" :key="n" name="star" :size="22" class="site-star" /></span>
            <span class="absolute inset-y-0 left-0 overflow-hidden" :style="{ width: `${(record.rating_avg / 5) * 100}%` }">
              <span class="inline-flex gap-0.5"><UiIcon v-for="n in 5" :key="n" name="star" :size="22" class="site-star site-star-on" /></span>
            </span>
          </span>
          <p class="text-sm font-bold text-ink-soft">{{ ratingCountLabel }}</p>
        </template>
        <template v-else>
          <span class="inline-flex gap-0.5" aria-hidden="true"><UiIcon v-for="n in 5" :key="n" name="star" :size="22" class="site-star" /></span>
          <p class="font-extrabold">Pas encore de note</p>
          <p class="text-sm text-ink-soft">La première peut être la tienne.</p>
        </template>
      </div>

      <div class="flex flex-col justify-center gap-2 rounded-2xl border-[1.5px] border-line-soft px-4 py-4 sm:px-5">
        <h3 class="text-lg font-extrabold">{{ myRating ? 'Ta note' : 'Donner une note' }}</h3>
        <template v-if="!user">
          <p class="text-base text-ink-soft">Connecte-toi pour noter ce QCM et écrire un commentaire.</p>
          <button type="button" class="qcm-block qcm-block-primary qcm-block-sm self-start px-6" @click="login">
            <UiIcon name="user" :size="20" />
            Se connecter
          </button>
          <p v-if="loginError" role="alert" class="text-sm font-semibold text-retry-ink">{{ loginError }}</p>
        </template>
        <template v-else>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div class="-ml-1.5 flex" role="group" aria-label="Ta note, de 1 à 5" @mouseleave="hoverRating = 0">
              <button
                v-for="value in 5"
                :key="value"
                type="button"
                class="site-star-button"
                :aria-pressed="myRating === value"
                :aria-label="`${value} sur 5 : ${RATING_LABELS[value]}`"
                :disabled="!open || ratingBusy"
                @mouseenter="hoverRating = value"
                @focus="hoverRating = value"
                @blur="hoverRating = 0"
                @click="rate(value)"
              >
                <UiIcon name="star" :size="34" :stroke="1.8" class="site-star" :class="value <= shownRating ? 'site-star-on' : ''" />
              </button>
            </div>
            <p class="min-h-6 text-base font-bold" aria-hidden="true">
              <template v-if="shownRating">{{ shownRating }} / 5 · {{ RATING_LABELS[shownRating] }}</template>
              <span v-else-if="open" class="font-medium text-ink-soft">Choisis de 1 à 5 étoiles.</span>
            </p>
          </div>
          <button v-if="myRating && open" type="button" class="qcm-text-button -ml-2 self-start text-sm underline" :disabled="ratingBusy" @click="clearRating">
            <UiIcon name="close" :size="16" />
            Retirer ma note
          </button>
          <p v-if="ratingError" role="alert" class="text-sm font-semibold text-retry-ink">{{ ratingError }}</p>
        </template>
      </div>
    </div>

    <!-- Commentaires -->
    <div class="flex flex-col gap-4 border-t-[1.5px] border-line-soft pt-6">
      <h3 class="flex items-center gap-2.5 text-xl font-extrabold">
        <UiIcon name="comment" :size="24" />
        Commentaires
        <span v-if="listState === 'ready'" class="qcm-chip" :aria-label="`${total} au total`">{{ total }}</span>
      </h3>

      <form v-if="user && open" class="flex items-start gap-3" @submit.prevent="sendComment">
        <span class="site-avatar mt-1 hidden sm:flex" :class="toneOf(user.id)" aria-hidden="true">{{ initialOf(user.name) }}</span>
        <div class="site-composer min-w-0 flex-1">
          <label class="sr-only" for="comment-text">Ton commentaire</label>
          <textarea
            id="comment-text"
            v-model="commentText"
            rows="3"
            :maxlength="MAX_LENGTH"
            placeholder="Qu'as-tu pensé de ce QCM ? Une question à corriger, un point à ajouter…"
            @keydown.ctrl.enter.prevent="sendComment"
            @keydown.meta.enter.prevent="sendComment"
          />
          <div class="flex items-center justify-between gap-3 border-t-[1.5px] border-line-soft py-2 pr-2 pl-3.5">
            <span class="text-sm font-semibold" :class="commentText.length >= MAX_LENGTH - 50 ? 'text-retry-ink' : 'text-ink-soft'">{{ commentText.length }} / {{ MAX_LENGTH }}</span>
            <button type="submit" class="qcm-block qcm-block-primary qcm-block-sm min-h-11 px-5" :disabled="!commentText.trim() || sending">
              <UiIcon name="send" :size="18" />
              {{ sending ? 'Envoi…' : 'Publier' }}
            </button>
          </div>
        </div>
      </form>
      <p v-if="commentError" role="alert" class="qcm-note qcm-note-retry">{{ commentError }}</p>

      <ul v-if="listState === 'loading'" class="flex flex-col gap-3" role="status" aria-label="Chargement des commentaires">
        <li v-for="n in 2" :key="n" class="qcm-skeleton h-20" />
      </ul>
      <div v-else-if="listState === 'error'" role="alert" class="qcm-note qcm-note-retry flex flex-wrap items-center justify-between gap-3">
        Les commentaires ne se chargent pas pour le moment.
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm" @click="loadComments">Réessayer</button>
      </div>
      <div v-else-if="comments.length === 0" class="flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-line-soft px-4 py-8 text-center text-ink-soft">
        <UiIcon name="comment" :size="30" />
        <p class="text-lg font-bold">Aucun commentaire pour le moment.</p>
        <p v-if="user && open" class="text-base">Le premier peut être le tien.</p>
      </div>
      <template v-else>
        <ul class="flex flex-col gap-3">
          <li
            v-for="comment in comments"
            :key="comment.id"
            class="flex gap-3 rounded-2xl border-[1.5px] bg-bg p-3.5 sm:p-4"
            :class="user && comment.user === user.id ? 'border-ink-soft' : 'border-line-soft'"
          >
            <span class="site-avatar" :class="toneOf(comment.user)" aria-hidden="true">{{ initialOf(authorName(comment)) }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-start gap-2">
                <p class="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span class="truncate font-extrabold">{{ authorName(comment) }}</span>
                  <span v-if="user && comment.user === user.id" class="qcm-chip bg-selected">Toi</span>
                  <span v-if="comment.user === record.owner" class="qcm-chip bg-primary">A créé ce QCM</span>
                  <span class="text-sm font-semibold text-ink-soft">
                    <time :datetime="toDate(comment.created).toISOString()" :title="fullDate(comment.created)">{{ timeAgo(comment.created) }}</time>
                    <template v-if="wasEdited(comment)"> · modifié</template>
                  </span>
                </p>
                <div v-if="user && comment.user === user.id && editingId !== comment.id" class="-mr-1.5 flex flex-none">
                  <button type="button" class="site-icon-action" aria-label="Modifier mon commentaire" title="Modifier" @click="startEdit(comment)">
                    <UiIcon name="pencil" :size="19" />
                  </button>
                  <button
                    type="button"
                    class="site-icon-action site-icon-action-warn"
                    aria-label="Supprimer mon commentaire"
                    title="Supprimer"
                    @click="((deleteError = ''), (pendingDelete = comment))"
                  >
                    <UiIcon name="trash" :size="19" />
                  </button>
                </div>
              </div>

              <form v-if="editingId === comment.id" class="mt-1 flex flex-col gap-2" @submit.prevent="saveEdit" @keydown.esc="editingId = ''">
                <label class="sr-only" :for="`edit-${comment.id}`">Modifier mon commentaire</label>
                <textarea
                  :id="`edit-${comment.id}`"
                  ref="editField"
                  v-model="editText"
                  class="qcm-field"
                  rows="3"
                  :maxlength="MAX_LENGTH"
                  @keydown.ctrl.enter.prevent="saveEdit"
                  @keydown.meta.enter.prevent="saveEdit"
                />
                <p v-if="editError" role="alert" class="text-sm font-semibold text-retry-ink">{{ editError }}</p>
                <div class="flex flex-wrap items-center gap-2">
                  <button type="submit" class="qcm-block qcm-block-primary qcm-block-sm min-h-11 px-5" :disabled="!editText.trim() || saving">
                    <UiIcon name="check" :size="18" :stroke="3" />
                    {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                  </button>
                  <button type="button" class="qcm-text-button" :disabled="saving" @click="editingId = ''">Annuler</button>
                  <span class="ml-auto text-sm font-semibold text-ink-soft">{{ editText.length }} / {{ MAX_LENGTH }}</span>
                </div>
              </form>
              <template v-else>
                <p class="text-lg leading-snug break-words whitespace-pre-line">{{ comment.text }}</p>
                <p v-if="comment.hidden" class="mt-2 flex items-center gap-2 text-sm font-bold text-retry-ink">
                  <UiIcon name="eye-off" :size="18" />
                  Masqué par la modération : tu es la seule personne à le voir.
                </p>
              </template>
            </div>
          </li>
        </ul>
        <button v-if="comments.length < total" type="button" class="qcm-block qcm-block-quiet qcm-block-sm self-center px-6" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Chargement…' : 'Afficher plus de commentaires' }}
        </button>
      </template>
    </div>

    <ConfirmDialog
      :open="!!pendingDelete"
      title="Supprimer ton commentaire ?"
      confirm-label="Supprimer"
      :busy="deleting"
      :error="deleteError"
      @confirm="confirmDelete"
      @cancel="pendingDelete = null"
    >
      <p class="line-clamp-3 rounded-xl bg-sunken px-3 py-2 text-ink">« {{ pendingDelete?.text }} »</p>
      <p class="mt-2">Il disparaît pour tout le monde. Cette action ne peut pas être annulée.</p>
    </ConfirmDialog>
  </section>
</template>
