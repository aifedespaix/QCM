/**
 * Calculs du zoom d'image (visionneuse en plein écran), sans aucune dépendance au DOM.
 *
 * Repère : l'origine est le CENTRE de la zone visible. L'image, ajustée à la zone (« contain »),
 * est dessinée à l'échelle `scale` puis décalée de `(x, y)` pixels : `translate(x, y) scale(s)`.
 */
export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface ZoomState {
  /** 1 = image ajustée à l'écran. */
  scale: number
  x: number
  y: number
}

export const MIN_SCALE = 1
export const MAX_SCALE = 6
/** Échelle atteinte par un double-appui, quand l'image est ajustée. */
export const DOUBLE_TAP_SCALE = 2.5
/** Pas d'un appui sur « + » ou « − » (facteur multiplicatif). */
export const ZOOM_STEP = 1.5

export const FIT_STATE: ZoomState = { scale: MIN_SCALE, x: 0, y: 0 }

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** Taille réelle de l'image une fois ajustée à la zone (agrandie si elle est petite, jamais déformée). */
export function fitSize(natural: Size, view: Size): Size {
  if (natural.width <= 0 || natural.height <= 0 || view.width <= 0 || view.height <= 0) {
    return { width: 0, height: 0 }
  }
  const ratio = Math.min(view.width / natural.width, view.height / natural.height)
  return { width: natural.width * ratio, height: natural.height * ratio }
}

/** Garde l'image dans la zone : pas de bord vide tant qu'elle est plus grande, centrée sinon. */
export function clampState(state: ZoomState, view: Size, content: Size): ZoomState {
  const scale = clampScale(state.scale)
  const limitX = Math.max(0, (content.width * scale - view.width) / 2)
  const limitY = Math.max(0, (content.height * scale - view.height) / 2)
  return {
    scale,
    // `+ 0` évite un « -0 » quand l'image est centrée.
    x: Math.min(limitX, Math.max(-limitX, state.x)) + 0,
    y: Math.min(limitY, Math.max(-limitY, state.y)) + 0,
  }
}

/**
 * Geste à un ou deux doigts : le point de l'image qui était sous `from` (au début du geste) doit
 * rester sous `to`, avec l'échelle multipliée par `ratio`. Un glissement simple est `ratio = 1`.
 */
export function applyGesture(
  start: ZoomState,
  from: Point,
  to: Point,
  ratio: number,
  view: Size,
  content: Size,
): ZoomState {
  const scale = clampScale(start.scale * ratio)
  const factor = scale / start.scale
  return clampState(
    {
      scale,
      x: to.x - (from.x - start.x) * factor,
      y: to.y - (from.y - start.y) * factor,
    },
    view,
    content,
  )
}

/** Change l'échelle en gardant fixe le point `anchor` (molette, boutons, double-appui). */
export function zoomAt(state: ZoomState, nextScale: number, anchor: Point, view: Size, content: Size): ZoomState {
  return applyGesture(state, anchor, anchor, clampScale(nextScale) / state.scale, view, content)
}

/** Double-appui : ajusté → zoomé sur le point touché ; zoomé → ajusté. */
export function toggleZoom(state: ZoomState, anchor: Point, view: Size, content: Size): ZoomState {
  if (state.scale > MIN_SCALE + 0.05) return FIT_STATE
  return zoomAt(state, DOUBLE_TAP_SCALE, anchor, view, content)
}

/** Distance entre deux doigts. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Libellé du niveau de zoom, arrondi à 10 % près (« 150 % »). */
export function zoomLabel(scale: number): string {
  return `${Math.round(scale * 10) * 10} %`
}
