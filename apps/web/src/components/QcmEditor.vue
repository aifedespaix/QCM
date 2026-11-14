<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import {
  LEVELS,
  LEVEL_LABELS,
  LIMITS,
  QcmFormatError,
  SUBJECTS,
  SUBJECT_LABELS,
  readQcmArchive,
  type QcmData,
} from '@qcm/core'
import { QcmPlayer } from '@qcm/ui'
import {
  addChoice,
  addQuestion,
  buildQcm,
  createDraft,
  draftMediaResolver,
  draftToData,
  loadArchiveIntoDraft,
  moveQuestion,
  removeChoice,
  removeQuestion,
  removeQuestionImage,
  setQuestionImage,
  type DraftQuestion,
} from '../lib/editorDraft.ts'
import { publishQcm, saveQcmLocally, useAuth } from '../lib/pb.ts'

const LETTERS = ['A', 'B', 'C', 'D'] as const

const { user } = useAuth()
const draft = createDraft()
const resolveMedia = draftMediaResolver(draft)
const preview = shallowRef<QcmData | null>(null)
const problems = ref<string[]>([])
const notice = ref('')
const publishedId = ref('')
const busy = ref(false)

function report(error: unknown): void {
  notice.value = ''
  if (error instanceof QcmFormatError) {
    problems.value = error.details.length > 0 ? error.details : [error.message]
  } else {
    problems.value = ['Une erreur est survenue. Tu peux réessayer.']
  }
}

function attempt<T>(action: () => T): T | undefined {
  problems.value = []
  try {
    return action()
  } catch (error) {
    report(error)
    return undefined
  }
}

function showPreview(): void {
  const data = attempt(() => draftToData(draft))
  if (data) preview.value = data
}

function exportFile(): void {
  const built = attempt(() => buildQcm(draft))
  if (!built) return
  saveQcmLocally(built.bytes, built.data.meta.title)
  notice.value = 'Le fichier .qcm est enregistré dans tes téléchargements.'
}

async function publish(): Promise<void> {
  const built = attempt(() => buildQcm(draft))
  if (!built) return
  busy.value = true
  try {
    const record = await publishQcm(built)
    publishedId.value = record.id
    notice.value =
      record.status === 'published'
        ? 'Ton QCM est publié dans la bibliothèque.'
        : 'Ton QCM est envoyé. Il apparaîtra dans la bibliothèque après validation.'
  } catch (error) {
    report(error)
  } finally {
    busy.value = false
  }
}

async function attachImage(question: DraftQuestion, file: File | undefined): Promise<void> {
  if (!file) return
  problems.value = []
  try {
    await setQuestionImage(draft, question, file, file.name)
  } catch (error) {
    report(error)
  }
}

function onImageInput(question: DraftQuestion, event: Event): void {
  const input = event.target as HTMLInputElement
  void attachImage(question, input.files?.[0])
  input.value = ''
}

function onImageDrop(question: DraftQuestion, event: DragEvent): void {
  void attachImage(question, event.dataTransfer?.files[0])
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  problems.value = []
  try {
    loadArchiveIntoDraft(draft, readQcmArchive(new Uint8Array(await file.arrayBuffer())))
    notice.value = 'Le fichier est chargé dans l\'éditeur.'
  } catch (error) {
    report(error)
  }
}
</script>

<template>
  <div v-if="preview" class="flex flex-col gap-5">
    <button type="button" class="qcm-block qcm-block-quiet min-h-12 self-start px-4 py-2 text-base" @click="preview = null">
      Revenir à l'éditeur
    </button>
    <QcmPlayer :qcm="preview" :resolve-media="resolveMedia" closable @close="preview = null" />
  </div>

  <form v-else class="flex flex-col gap-8" novalidate @submit.prevent="exportFile">
    <section class="qcm-card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2" aria-labelledby="editor-meta">
      <h2 id="editor-meta" class="text-2xl font-extrabold sm:col-span-2">Informations</h2>
      <div class="sm:col-span-2">
        <label class="qcm-label" for="meta-title">Titre</label>
        <input id="meta-title" v-model="draft.title" class="qcm-field" :maxlength="LIMITS.title" />
      </div>
      <div>
        <label class="qcm-label" for="meta-subject">Matière</label>
        <select id="meta-subject" v-model="draft.subject" class="qcm-field">
          <option v-for="subject in SUBJECTS" :key="subject" :value="subject">{{ SUBJECT_LABELS[subject] }}</option>
        </select>
      </div>
      <div>
        <label class="qcm-label" for="meta-level">Niveau</label>
        <select id="meta-level" v-model="draft.level" class="qcm-field">
          <option v-for="level in LEVELS" :key="level" :value="level">{{ LEVEL_LABELS[level] }}</option>
        </select>
      </div>
      <div>
        <label class="qcm-label" for="meta-chapter">Chapitre</label>
        <input id="meta-chapter" v-model="draft.chapter" class="qcm-field" :maxlength="LIMITS.chapter" />
      </div>
      <div>
        <label class="qcm-label" for="meta-author">Auteur (facultatif)</label>
        <input id="meta-author" v-model="draft.author" class="qcm-field" :maxlength="LIMITS.author" />
      </div>
      <div class="sm:col-span-2">
        <label class="qcm-label" for="meta-description">Description (facultatif)</label>
        <textarea id="meta-description" v-model="draft.description" class="qcm-field" rows="2" :maxlength="LIMITS.description" />
      </div>
      <div class="sm:col-span-2">
        <label class="qcm-label" for="import-file">Reprendre un fichier .qcm existant</label>
        <input id="import-file" class="qcm-field" type="file" accept=".qcm,application/zip" @change="importFile" />
      </div>
    </section>

    <section
      v-for="(question, index) in draft.questions"
      :key="question.key"
      class="qcm-card flex flex-col gap-4 p-6"
      :aria-label="`Question ${index + 1}`"
    >
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-2xl font-extrabold">Question {{ index + 1 }}</h2>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-3 py-2 text-base" :disabled="index === 0" @click="moveQuestion(draft, index, -1)">Monter</button>
          <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-3 py-2 text-base" :disabled="index === draft.questions.length - 1" @click="moveQuestion(draft, index, 1)">Descendre</button>
          <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-3 py-2 text-base" :disabled="draft.questions.length <= 1" @click="removeQuestion(draft, index)">Supprimer</button>
        </div>
      </header>

      <div>
        <label class="qcm-label" :for="`prompt-${question.key}`">Question</label>
        <textarea :id="`prompt-${question.key}`" v-model="question.prompt" class="qcm-field" rows="2" :maxlength="LIMITS.prompt" />
      </div>

      <div
        class="rounded-2xl border-2 border-dashed border-line bg-bg p-4"
        @dragover.prevent
        @drop.prevent="onImageDrop(question, $event)"
      >
        <template v-if="question.image">
          <img :src="question.image.url" alt="Aperçu de l'image" class="max-h-56 rounded-xl border-2 border-line object-contain" />
          <button type="button" class="mt-3 text-base font-bold underline" @click="removeQuestionImage(question)">Retirer l'image</button>
        </template>
        <template v-else>
          <label class="qcm-label" :for="`image-${question.key}`">Image (facultatif) : dépose un fichier ici ou choisis-le</label>
          <input :id="`image-${question.key}`" class="qcm-field" type="file" accept="image/*" @change="onImageInput(question, $event)" />
        </template>
      </div>

      <fieldset class="flex flex-col gap-3">
        <legend class="qcm-label">Réponses : coche la bonne</legend>
        <div v-for="(choice, choiceIndex) in question.choices" :key="choiceIndex" class="flex items-center gap-3">
          <input
            v-model="question.correctIndex"
            type="radio"
            class="size-6 flex-none"
            :name="`correct-${question.key}`"
            :value="choiceIndex"
            :aria-label="`La réponse ${LETTERS[choiceIndex]} est la bonne`"
          />
          <span class="qcm-key" aria-hidden="true">{{ LETTERS[choiceIndex] }}</span>
          <input v-model="choice.text" class="qcm-field" :maxlength="LIMITS.choiceText" :aria-label="`Texte de la réponse ${LETTERS[choiceIndex]}`" />
          <button
            type="button"
            class="text-base font-bold underline"
            :disabled="question.choices.length <= LIMITS.minChoices"
            @click="removeChoice(question, choiceIndex)"
          >
            Retirer
          </button>
        </div>
        <button
          v-if="question.choices.length < LIMITS.maxChoices"
          type="button"
          class="qcm-block qcm-block-quiet min-h-12 self-start px-4 py-2 text-base"
          @click="addChoice(question)"
        >
          Ajouter une réponse
        </button>
      </fieldset>

      <div>
        <label class="qcm-label" :for="`hint-${question.key}`">Indice affiché après une erreur (facultatif)</label>
        <input :id="`hint-${question.key}`" v-model="question.hint" class="qcm-field" :maxlength="LIMITS.hint" />
      </div>
      <div>
        <label class="qcm-label" :for="`explanation-${question.key}`">Explication de la bonne réponse</label>
        <textarea :id="`explanation-${question.key}`" v-model="question.explanation" class="qcm-field" rows="2" :maxlength="LIMITS.explanation" />
      </div>
    </section>

    <button
      type="button"
      class="qcm-block qcm-block-quiet"
      :disabled="draft.questions.length >= LIMITS.maxQuestions"
      @click="addQuestion(draft)"
    >
      Ajouter une question
    </button>

    <section class="qcm-card flex flex-col gap-4 p-6" aria-labelledby="editor-actions">
      <h2 id="editor-actions" class="text-2xl font-extrabold">Terminer</h2>
      <div v-if="problems.length > 0" role="alert" class="rounded-2xl border-2 border-line bg-retry px-5 py-4 text-retry-ink">
        <p class="text-lg font-extrabold">Il reste des points à corriger :</p>
        <ul class="mt-1 list-disc pl-6 font-medium">
          <li v-for="problem in problems" :key="problem">{{ problem }}</li>
        </ul>
      </div>
      <p v-if="notice" role="status" class="rounded-2xl border-2 border-line bg-correct px-5 py-4 text-lg font-bold text-correct-ink">
        {{ notice }}
        <a v-if="publishedId" :href="`/qcm?id=${publishedId}`" class="underline">Voir la fiche</a>
      </p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button type="button" class="qcm-block qcm-block-quiet" @click="showPreview">Essayer le QCM</button>
        <button type="submit" class="qcm-block qcm-block-primary">Enregistrer le fichier .qcm</button>
        <button type="button" class="qcm-block qcm-block-quiet" :disabled="!user || busy" @click="publish">
          {{ busy ? 'Publication…' : 'Publier dans la bibliothèque' }}
        </button>
      </div>
      <p v-if="!user" class="text-base text-ink-soft">La publication demande une connexion avec Google. L'enregistrement du fichier fonctionne sans compte.</p>
    </section>
  </form>
</template>
