import type { Ref } from 'vue'

/**
 * Fermeture d'un `<dialog>` par un clic sur le fond. Le navigateur envoie le clic à l'ancêtre
 * commun de l'appui et du relâchement : un appui dans la fenêtre relâché sur le fond (sélection
 * de texte, glissement) arrive donc sur le `<dialog>` lui-même. On ne ferme que si l'appui
 * avait déjà eu lieu sur le fond.
 */
export function useBackdropClose(
  dialog: Ref<HTMLDialogElement | null>,
  close: () => void,
  enabled: () => boolean = () => true,
  /** Cadre visible, quand le `<dialog>` déborde de son contenu (panneau prolongé sous l'écran). */
  panel?: Ref<HTMLElement | null>,
) {
  let pressedOnBackdrop = false
  function isBackdrop(event: MouseEvent): boolean {
    if (event.target !== dialog.value) return false
    const box = panel?.value?.getBoundingClientRect()
    if (!box) return true
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
  }
  return {
    onPointerDown(event: PointerEvent): void {
      pressedOnBackdrop = isBackdrop(event)
    },
    onClick(event: MouseEvent): void {
      const onBackdrop = pressedOnBackdrop && isBackdrop(event)
      pressedOnBackdrop = false
      if (onBackdrop && enabled()) close()
    },
  }
}
