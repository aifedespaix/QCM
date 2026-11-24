import type { Ref } from 'vue'

/**
 * Fermeture d'un `<dialog>` par un clic sur le fond. Le navigateur envoie le clic à l'ancêtre
 * commun de l'appui et du relâchement : un appui dans la fenêtre relâché sur le fond (sélection
 * de texte, glissement) arrive donc sur le `<dialog>` lui-même. On ne ferme que si l'appui
 * avait déjà eu lieu sur le fond.
 */
export function useBackdropClose(dialog: Ref<HTMLDialogElement | null>, close: () => void, enabled: () => boolean = () => true) {
  let pressedOnBackdrop = false
  return {
    onPointerDown(event: PointerEvent): void {
      pressedOnBackdrop = event.target === dialog.value
    },
    onClick(event: MouseEvent): void {
      const onBackdrop = pressedOnBackdrop && event.target === dialog.value
      pressedOnBackdrop = false
      if (onBackdrop && enabled()) close()
    },
  }
}
