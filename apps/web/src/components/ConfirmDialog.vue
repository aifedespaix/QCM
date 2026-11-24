<script setup lang="ts">
import { ref, watch } from 'vue'
import UiIcon, { type IconName } from './UiIcon.vue'
import { useBackdropClose } from '../lib/backdrop.ts'

/** Fenêtre de confirmation pour une action qui ne s'annule pas (suppression). */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    confirmLabel: string
    icon?: IconName
    busy?: boolean
    error?: string
  }>(),
  { icon: 'trash', busy: false, error: '' },
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)

watch(
  () => [props.open, dialog.value] as const,
  ([open, element]) => {
    if (!element) return
    if (open && !element.open) element.showModal()
    else if (!open && element.open) element.close()
  },
  { immediate: true },
)

/** Un clic sur le fond (appui et relâchement hors du cadre) ferme la fenêtre. */
const backdrop = useBackdropClose(dialog, () => emit('cancel'), () => !props.busy)
</script>

<template>
  <dialog
    ref="dialog"
    class="qcm-card m-auto w-[min(30rem,calc(100vw-2rem))] p-0 text-ink backdrop:bg-ink/45"
    aria-labelledby="confirm-title"
    @cancel.prevent="busy || emit('cancel')"
    @pointerdown="backdrop.onPointerDown"
    @click="backdrop.onClick"
  >
    <div class="flex flex-col gap-4 p-5 sm:p-7">
      <div class="flex items-start gap-4">
        <span class="qcm-tile bg-retry text-retry-ink"><UiIcon :name="icon" :size="26" /></span>
        <div class="min-w-0 flex-1">
          <h2 id="confirm-title" class="text-xl leading-snug font-extrabold">{{ title }}</h2>
          <div class="mt-1.5 text-base text-ink-soft"><slot /></div>
        </div>
      </div>
      <p v-if="error" role="alert" class="qcm-note qcm-note-retry">{{ error }}</p>
      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" class="qcm-block qcm-block-quiet qcm-block-sm sm:px-6" autofocus :disabled="busy" @click="emit('cancel')">Annuler</button>
        <button type="button" class="qcm-block qcm-block-primary qcm-block-sm bg-retry text-retry-ink sm:px-6" :disabled="busy" @click="emit('confirm')">
          <UiIcon :name="icon" :size="20" />
          {{ busy ? 'Suppression…' : confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>
