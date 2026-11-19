<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  FIT_STATE,
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_STEP,
  applyGesture,
  clampState,
  distance,
  fitSize,
  midpoint,
  toggleZoom,
  zoomAt,
  zoomLabel,
  type Point,
  type Size,
  type ZoomState,
} from '../composables/imageZoom.ts'

/**
 * Visionneuse d'image en plein écran (fenêtre modale native : le focus reste dedans, Échap ferme,
 * le focus revient sur l'image à la fermeture).
 *
 * Tactile : pincer pour zoomer, glisser pour déplacer, double-appui pour zoomer/ajuster.
 * Souris : molette pour zoomer, glisser pour déplacer, double-clic.
 * Clavier : + / − / 0, flèches pour déplacer.
 * Appuyer à côté de l'image, ou sur la croix, ferme.
 */
defineProps<{
  src: string
  alt: string
}>()

const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const stage = ref<HTMLElement | null>(null)

const state = ref<ZoomState>({ ...FIT_STATE })
const view = ref<Size>({ width: 0, height: 0 })
const natural = ref<Size>({ width: 0, height: 0 })
const gesturing = ref(false)
const hintVisible = ref(true)
const failed = ref(false)

/** Taille de l'image une fois ajustée à la zone visible. */
const content = computed(() => fitSize(natural.value, view.value))
const transform = computed(
  () => `translate3d(${state.value.x}px, ${state.value.y}px, 0) scale(${state.value.scale})`,
)
const zoomed = computed(() => state.value.scale > MIN_SCALE + 0.01)
const label = computed(() => zoomLabel(state.value.scale))

function setState(next: ZoomState): void {
  state.value = next
}

/** Point de l'écran → repère centré sur la zone visible. */
function toLocal(clientX: number, clientY: number): Point {
  const rect = stage.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 }
}

/** Le point (repère centré) tombe-t-il sur l'image elle-même, et non sur le fond ? */
function isOnImage(point: Point): boolean {
  const { scale, x, y } = state.value
  const localX = (point.x - x) / scale
  const localY = (point.y - y) / scale
  return Math.abs(localX) <= content.value.width / 2 && Math.abs(localY) <= content.value.height / 2
}

function close(): void {
  dialog.value?.close()
}

// ---- Boutons et clavier ---------------------------------------------------------------------

function zoomBy(factor: number): void {
  hintVisible.value = false
  setState(zoomAt(state.value, state.value.scale * factor, { x: 0, y: 0 }, view.value, content.value))
}

function reset(): void {
  hintVisible.value = false
  setState({ ...FIT_STATE })
}

function onKeydown(event: KeyboardEvent): void {
  // Le lecteur écoute le clavier sur `window` (1-4, A-D, Entrée) : rien ne doit lui parvenir ici.
  event.stopPropagation()
  if (event.ctrlKey || event.altKey || event.metaKey) return
  const step = 90
  switch (event.key) {
    case '+':
    case '=':
      zoomBy(ZOOM_STEP)
      break
    case '-':
    case '_':
      zoomBy(1 / ZOOM_STEP)
      break
    case '0':
      reset()
      break
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (!zoomed.value) return
      const dx = event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0
      const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0
      setState(clampState({ ...state.value, x: state.value.x + dx, y: state.value.y + dy }, view.value, content.value))
      break
    }
    default:
      return
  }
  event.preventDefault()
}

// ---- Souris : molette -----------------------------------------------------------------------

function onWheel(event: WheelEvent): void {
  hintVisible.value = false
  const lines = event.deltaMode === 1 ? 16 : 1
  // Le pincement d'un pavé tactile arrive en molette + Ctrl, avec de petits deltas.
  const speed = event.ctrlKey ? 0.012 : 0.0018
  const factor = Math.exp(-event.deltaY * lines * speed)
  setState(zoomAt(state.value, state.value.scale * factor, toLocal(event.clientX, event.clientY), view.value, content.value))
}

// ---- Doigts et souris : glisser, pincer, double-appui ---------------------------------------

const TAP_SLOP = 8
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_DISTANCE = 32

const pointers = new Map<number, Point>()
let start: { state: ZoomState; from: Point; spread: number } | null = null
let downAt: Point | null = null
let moved = false
let lastTap: { at: number; point: Point } | null = null

function firstTwo(): [Point, Point] | null {
  const [a, b] = [...pointers.values()]
  return a && b ? [a, b] : null
}

/** Repart d'un geste neuf depuis les doigts posés et l'état actuel. */
function beginGesture(): void {
  const two = firstTwo()
  if (two) {
    start = { state: state.value, from: midpoint(two[0], two[1]), spread: Math.max(1, distance(two[0], two[1])) }
    return
  }
  const [only] = [...pointers.values()]
  start = only ? { state: state.value, from: only, spread: 1 } : null
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  stage.value?.setPointerCapture(event.pointerId)
  const point = toLocal(event.clientX, event.clientY)
  pointers.set(event.pointerId, point)
  if (pointers.size === 1) {
    downAt = point
    moved = false
  } else {
    moved = true
  }
  beginGesture()
}

function onPointerMove(event: PointerEvent): void {
  if (!pointers.has(event.pointerId) || !start) return
  const point = toLocal(event.clientX, event.clientY)
  pointers.set(event.pointerId, point)

  if (!moved && downAt && Math.hypot(point.x - downAt.x, point.y - downAt.y) > TAP_SLOP) moved = true
  if (!moved) return
  gesturing.value = true
  hintVisible.value = false

  const two = firstTwo()
  if (two) {
    const ratio = distance(two[0], two[1]) / start.spread
    setState(applyGesture(start.state, start.from, midpoint(two[0], two[1]), ratio, view.value, content.value))
  } else {
    setState(applyGesture(start.state, start.from, point, 1, view.value, content.value))
  }
}

function onPointerUp(event: PointerEvent): void {
  if (!pointers.has(event.pointerId)) return
  const point = pointers.get(event.pointerId) ?? { x: 0, y: 0 }
  pointers.delete(event.pointerId)
  if (stage.value?.hasPointerCapture(event.pointerId)) stage.value.releasePointerCapture(event.pointerId)

  if (pointers.size > 0) {
    // Un doigt levé pendant un pincement : le doigt restant continue en glissement.
    beginGesture()
    return
  }
  start = null
  gesturing.value = false
  if (moved || event.type === 'pointercancel') return

  const now = event.timeStamp
  if (!isOnImage(point)) {
    // Appui à côté de l'image : on ferme.
    close()
    return
  }
  hintVisible.value = false
  if (lastTap && now - lastTap.at < DOUBLE_TAP_MS && Math.hypot(point.x - lastTap.point.x, point.y - lastTap.point.y) < DOUBLE_TAP_DISTANCE) {
    lastTap = null
    setState(toggleZoom(state.value, point, view.value, content.value))
  } else {
    lastTap = { at: now, point }
  }
}

// ---- Cycle de vie ---------------------------------------------------------------------------

let observer: ResizeObserver | null = null
let hintTimer: ReturnType<typeof setTimeout> | undefined

function measure(): void {
  const element = stage.value
  if (!element) return
  view.value = { width: element.clientWidth, height: element.clientHeight }
  // Rotation de l'écran ou fenêtre redimensionnée : l'image reste bien cadrée.
  state.value = clampState(state.value, view.value, content.value)
}

function onLoad(event: Event): void {
  const image = event.target as HTMLImageElement
  natural.value = { width: image.naturalWidth, height: image.naturalHeight }
  measure()
}

onMounted(() => {
  dialog.value?.showModal()
  measure()
  if (typeof ResizeObserver !== 'undefined' && stage.value) {
    observer = new ResizeObserver(measure)
    observer.observe(stage.value)
  }
  hintTimer = setTimeout(() => (hintVisible.value = false), 4500)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(hintTimer)
})
</script>

<template>
  <dialog
    ref="dialog"
    class="qcm-viewer"
    :aria-label="alt"
    @close="emit('close')"
    @keydown="onKeydown"
  >
    <div class="qcm-viewer-bar">
      <p class="qcm-viewer-hint" :class="hintVisible ? '' : 'qcm-viewer-hint-off'" aria-hidden="true">
        <span class="qcm-hint-touch">Pince ou double-touche pour zoomer</span>
        <span class="qcm-hint-mouse">Molette ou double-clic pour zoomer, glisse pour déplacer</span>
      </p>

      <div class="qcm-viewer-tools" role="group" aria-label="Zoom">
        <button type="button" class="qcm-viewer-button" aria-label="Zoom arrière" title="Zoom arrière (−)" :disabled="state.scale <= MIN_SCALE + 0.01" @click="zoomBy(1 / ZOOM_STEP)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" class="qcm-viewer-button qcm-viewer-level" :aria-label="`Zoom ${label}, ajuster à l'écran`" title="Ajuster à l'écran (0)" :disabled="!zoomed" @click="reset">
          {{ label }}
        </button>
        <button type="button" class="qcm-viewer-button" aria-label="Zoom avant" title="Zoom avant (+)" :disabled="state.scale >= MAX_SCALE - 0.01" @click="zoomBy(ZOOM_STEP)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <button type="button" class="qcm-viewer-button qcm-viewer-close" aria-label="Fermer l'image" title="Fermer (Échap)" autofocus @click="close">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>

    <div
      ref="stage"
      class="qcm-viewer-stage"
      :class="[zoomed ? 'qcm-viewer-grab' : '', gesturing ? 'qcm-viewer-dragging' : '']"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
    >
      <div class="qcm-viewer-content" :class="gesturing ? '' : 'qcm-viewer-animate'" :style="{ transform }">
        <img :src="src" :alt="alt" draggable="false" class="qcm-viewer-image" @load="onLoad" @error="failed = true" />
      </div>
      <p v-if="failed" class="qcm-viewer-error" role="alert">Impossible d'afficher l'image.</p>
    </div>
  </dialog>
</template>
