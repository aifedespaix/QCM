<script setup lang="ts">
import { onBeforeUnmount, ref, useId, watch } from 'vue'
import UiIcon from './UiIcon.vue'
import { useBackdropClose } from '../lib/backdrop.ts'

/**
 * Fenêtre par-dessus la page : panneau qui monte du bas sur téléphone (à portée de pouce),
 * fenêtre centrée sur grand écran. En-tête fixe, contenu qui défile, pied fixe (`#footer`).
 *
 * Règles d'usage :
 * - `<dialog>` natif : focus piégé dedans, page derrière inerte, Échap ferme, et le focus revient
 *   au bouton qui l'a ouverte ;
 * - fermeture par le fond seulement si l'appui ET le relâchement y ont lieu (sélectionner du
 *   texte ou glisser depuis l'intérieur ne ferme rien) ;
 * - téléphone : tirer la poignée ou l'en-tête vers le bas ferme le panneau ;
 * - le bouton Retour du téléphone ferme aussi le panneau (géré par la page qui l'ouvre).
 */
const props = withDefaults(defineProps<{ open: boolean; title: string; size?: 'sm' | 'md' }>(), { size: 'md' })
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()
const backdrop = useBackdropClose(dialog, () => emit('close'))

watch(
  () => [props.open, dialog.value] as const,
  ([open, element]) => {
    if (!element) return
    if (open && !element.open) {
      element.style.transform = ''
      element.showModal()
    } else if (!open && element.open) element.close()
  },
  { immediate: true },
)

// ---------------------------------------------------------------- Tirer vers le bas (téléphone)

/** Au-delà de cette distance (ou d'un geste rapide), le panneau se ferme au relâchement. */
const CLOSE_DISTANCE = 90
const CLOSE_SPEED = 0.6 // px/ms
let drag: { id: number; startY: number; startTime: number; dy: number } | null = null

function onDragStart(event: PointerEvent): void {
  const element = dialog.value
  if (!element || event.pointerType === 'mouse' || !window.matchMedia('(max-width: 39.99rem)').matches) return
  if ((event.target as HTMLElement).closest('button')) return
  drag = { id: event.pointerId, startY: event.clientY, startTime: event.timeStamp, dy: 0 }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  element.style.transition = 'none'
}

function onDragMove(event: PointerEvent): void {
  const element = dialog.value
  if (!drag || !element || event.pointerId !== drag.id) return
  // Vers le haut, une résistance : le panneau ne se décolle pas du bas.
  const raw = event.clientY - drag.startY
  drag.dy = raw > 0 ? raw : raw / 6
  element.style.transform = `translateY(${drag.dy}px)`
}

function onDragEnd(event: PointerEvent): void {
  const element = dialog.value
  if (!drag || !element || event.pointerId !== drag.id) return
  const speed = drag.dy / Math.max(1, event.timeStamp - drag.startTime)
  const shouldClose = event.type === 'pointerup' && (drag.dy > CLOSE_DISTANCE || (drag.dy > 24 && speed > CLOSE_SPEED))
  drag = null
  element.style.transition = 'transform 180ms ease-out'
  if (shouldClose) {
    element.style.transform = 'translateY(100%)'
    setTimeout(() => emit('close'), 160)
  } else element.style.transform = ''
}

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="site-sheet"
    :class="size === 'sm' ? 'site-sheet-sm' : ''"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('close')"
    @close="open && emit('close')"
    @pointerdown="backdrop.onPointerDown"
    @click="backdrop.onClick"
  >
    <div class="flex max-h-[inherit] flex-col">
      <header
        class="site-sheet-header flex flex-none items-center gap-3 border-b-[1.5px] border-line-soft py-2 pr-2 pl-5"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
      >
        <span class="site-sheet-grip" aria-hidden="true" />
        <h2 :id="titleId" class="min-w-0 flex-1 truncate text-lg font-extrabold">
          <slot name="title">{{ title }}</slot>
        </h2>
        <button type="button" class="site-icon-action" aria-label="Fermer" @click="emit('close')">
          <UiIcon name="close" :size="22" />
        </button>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="flex-none border-t-[1.5px] border-line-soft bg-surface px-4 py-3">
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>
