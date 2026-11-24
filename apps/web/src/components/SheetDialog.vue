<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import UiIcon from './UiIcon.vue'

/**
 * Fenêtre par-dessus la page : panneau qui monte du bas sur téléphone (à portée de pouce),
 * fenêtre centrée sur grand écran. `<dialog>` natif : focus piégé, Échap et retour du focus
 * au bouton d'ouverture fournis par le navigateur. En-tête fixe, contenu qui défile, pied fixe
 * (`#footer`, par exemple le champ de commentaire).
 */
const props = withDefaults(defineProps<{ open: boolean; title: string; size?: 'sm' | 'md' }>(), { size: 'md' })
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()

watch(
  () => [props.open, dialog.value] as const,
  ([open, element]) => {
    if (!element) return
    if (open && !element.open) element.showModal()
    else if (!open && element.open) element.close()
  },
  { immediate: true },
)

/** Un clic sur le fond (hors du cadre) ferme la fenêtre. */
function onBackdrop(event: MouseEvent): void {
  if (event.target === dialog.value) emit('close')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="site-sheet"
    :class="size === 'sm' ? 'site-sheet-sm' : ''"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('close')"
    @close="open && emit('close')"
    @click="onBackdrop"
  >
    <div class="flex max-h-[inherit] flex-col">
      <header class="flex flex-none items-center gap-3 border-b-[1.5px] border-line-soft py-2 pr-2 pl-5">
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
