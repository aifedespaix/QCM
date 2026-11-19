import { describe, expect, test } from 'bun:test'
import {
  DOUBLE_TAP_SCALE,
  FIT_STATE,
  MAX_SCALE,
  MIN_SCALE,
  applyGesture,
  clampScale,
  clampState,
  fitSize,
  toggleZoom,
  zoomAt,
  zoomLabel,
} from '../src/composables/imageZoom.ts'

const view = { width: 400, height: 800 }
// Image paysage 1200x600 ajustée à une zone 400x800 : 400x200.
const content = fitSize({ width: 1200, height: 600 }, view)

describe('fitSize', () => {
  test('ajuste sans déformer', () => {
    expect(content).toEqual({ width: 400, height: 200 })
  })
  test('agrandit une petite image', () => {
    expect(fitSize({ width: 100, height: 100 }, { width: 400, height: 800 })).toEqual({ width: 400, height: 400 })
  })
  test('tailles invalides : zéro', () => {
    expect(fitSize({ width: 0, height: 10 }, view)).toEqual({ width: 0, height: 0 })
  })
})

describe('clampScale', () => {
  test('borne le zoom', () => {
    expect(clampScale(0.2)).toBe(MIN_SCALE)
    expect(clampScale(99)).toBe(MAX_SCALE)
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE)
  })
})

describe('clampState', () => {
  test('image ajustée : toujours centrée', () => {
    expect(clampState({ scale: 1, x: 120, y: -50 }, view, content)).toEqual({ scale: 1, x: 0, y: 0 })
  })
  test('zoomée : pas de bord vide sur l\'axe qui dépasse, centrée sur l\'autre', () => {
    // Largeur 400*2 = 800 > 400 : on peut aller jusqu'à ±200. Hauteur 200*2 = 400 < 800 : centrée.
    const result = clampState({ scale: 2, x: 999, y: 999 }, view, content)
    expect(result).toEqual({ scale: 2, x: 200, y: 0 })
  })
})

describe('zoomAt', () => {
  test('le point visé reste sous le doigt', () => {
    const anchor = { x: 100, y: 0 }
    const next = zoomAt(FIT_STATE, 2, anchor, view, content)
    // Point de l'image sous l'ancre avant : 100 ; après : (100 - x) / 2 doit rester 100.
    expect((anchor.x - next.x) / next.scale).toBeCloseTo(100)
    expect(next.scale).toBe(2)
  })
  test('ne dépasse jamais les bornes', () => {
    expect(zoomAt(FIT_STATE, 50, { x: 0, y: 0 }, view, content).scale).toBe(MAX_SCALE)
    expect(zoomAt({ scale: 2, x: 0, y: 0 }, 0.1, { x: 0, y: 0 }, view, content)).toEqual(FIT_STATE)
  })
})

describe('applyGesture', () => {
  test('glisser déplace, borné par l\'image', () => {
    const zoomed = { scale: 3, x: 0, y: 0 }
    const moved = applyGesture(zoomed, { x: 0, y: 0 }, { x: 50, y: 0 }, 1, view, content)
    expect(moved.x).toBe(50)
    const far = applyGesture(zoomed, { x: 0, y: 0 }, { x: 5000, y: 0 }, 1, view, content)
    expect(far.x).toBe(400)
  })
  test('pincer double l\'échelle', () => {
    expect(applyGesture(FIT_STATE, { x: 0, y: 0 }, { x: 0, y: 0 }, 2, view, content).scale).toBe(2)
  })
})

describe('toggleZoom', () => {
  test('ajusté → zoomé → ajusté', () => {
    const zoomed = toggleZoom(FIT_STATE, { x: 50, y: 10 }, view, content)
    expect(zoomed.scale).toBe(DOUBLE_TAP_SCALE)
    expect(toggleZoom(zoomed, { x: 0, y: 0 }, view, content)).toEqual(FIT_STATE)
  })
})

describe('zoomLabel', () => {
  test('pourcentage arrondi à 10 %', () => {
    expect(zoomLabel(1)).toBe('100 %')
    expect(zoomLabel(2.5)).toBe('250 %')
    expect(zoomLabel(1.52)).toBe('150 %')
  })
})
