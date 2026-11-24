import { describe, expect, test } from 'bun:test'
import { isRecent, shortDate } from '../src/lib/subjects.ts'

const NOW = Date.parse('2026-03-20T12:00:00')

describe('date des cartes de la bibliothèque', () => {
  test('relative la première semaine, puis jour et mois', () => {
    expect(shortDate('2026-03-20 08:00:00.000Z', NOW)).toBe("aujourd'hui")
    expect(shortDate('2026-03-19 08:00:00.000Z', NOW)).toBe('hier')
    expect(shortDate('2026-03-16 08:00:00.000Z', NOW)).toBe('il y a 4 j')
    expect(shortDate('2026-03-02 08:00:00.000Z', NOW)).toBe('2 mars')
  })
  test("l'année apparaît seulement si elle diffère", () => {
    expect(shortDate('2025-11-12 08:00:00.000Z', NOW)).toBe('12 nov. 2025')
  })
  test('date illisible : rien', () => {
    expect(shortDate('', NOW)).toBe('')
  })
  test('« Nouveau » pendant 7 jours', () => {
    expect(isRecent('2026-03-15 08:00:00.000Z', NOW)).toBe(true)
    expect(isRecent('2026-03-10 08:00:00.000Z', NOW)).toBe(false)
  })
})
