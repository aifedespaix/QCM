import { describe, expect, test } from 'bun:test'
import { validateQcm } from '@qcm/core'
import { useQcmPlayer } from '../src/composables/useQcmPlayer.ts'

const qcm = validateQcm({
  version: 1,
  meta: { title: 'Test', subject: 'maths', level: '6e', chapter: 'Chapitre 1' },
  questions: [
    {
      id: 'q1',
      prompt: 'Combien font 2 + 2 ?',
      choices: [{ text: '3' }, { text: '4', correct: true }, { text: '5' }],
      explanation: '2 + 2 = 4.',
    },
    {
      id: 'q2',
      prompt: 'Combien font 1 + 1 ?',
      choices: [{ text: '2', correct: true }, { text: '3' }],
      explanation: '1 + 1 = 2.',
    },
  ],
})

function key(value: string): KeyboardEvent {
  return { key: value, ctrlKey: false, altKey: false, metaKey: false, repeat: false, target: null } as unknown as KeyboardEvent
}

describe('useQcmPlayer', () => {
  test('parcours complet au clavier, avec une erreur puis un nouvel essai', () => {
    const played: string[] = []
    const player = useQcmPlayer(qcm, {
      playSelect: () => played.push('select'),
      playCorrect: () => played.push('correct'),
      playSoft: () => played.push('soft'),
      playComplete: () => played.push('complete'),
    })
    expect(player.phase.value).toBe('intro')
    expect(player.handleKey(key('Enter'))).toBe(true)
    expect(player.phase.value).toBe('answering')

    // Entrée sans sélection : rien ne se passe.
    player.handleKey(key('Enter'))
    expect(player.phase.value).toBe('answering')

    // Mauvaise réponse : phase « retry », la réponse essayée est grisée.
    player.handleKey(key('1'))
    expect(player.selectedIndex.value).toBe(0)
    player.handleKey(key(' '))
    expect(player.phase.value).toBe('retry')
    expect(player.triedIndexes.value).toEqual([0])
    expect(player.selectedIndex.value).toBeNull()

    // Une réponse déjà essayée ne peut plus être choisie.
    player.handleKey(key('a'))
    expect(player.selectedIndex.value).toBeNull()

    // Choisir une autre réponse relance directement la question.
    player.handleKey(key('B'))
    expect(player.phase.value).toBe('answering')
    player.handleKey(key('Enter'))
    expect(player.phase.value).toBe('correct')
    player.handleKey(key('Enter'))
    expect(player.index.value).toBe(1)
    expect(player.triedIndexes.value).toEqual([])

    // Touche hors plage : ignorée.
    expect(player.handleKey(key('4'))).toBe(true)
    expect(player.selectedIndex.value).toBeNull()

    player.handleKey(key('1'))
    player.handleKey(key('Enter'))
    expect(player.isLast.value).toBe(true)
    player.handleKey(key('Enter'))
    expect(player.phase.value).toBe('done')
    expect(player.results.value).toEqual([
      { id: 'q1', wrong: 1, revealed: false },
      { id: 'q2', wrong: 0, revealed: false },
    ])
    expect(played).toEqual(['select', 'soft', 'select', 'correct', 'select', 'correct', 'complete'])
  })

  test('« Voir la réponse » puis recommencer', () => {
    const player = useQcmPlayer(qcm)
    player.start()
    player.select(2)
    player.validate()
    player.retry()
    expect(player.phase.value).toBe('answering')
    player.reveal()
    expect(player.phase.value).toBe('revealed')
    expect(player.correctIndex.value).toBe(1)
    player.next()
    expect(player.index.value).toBe(1)
    expect(player.results.value).toEqual([{ id: 'q1', wrong: 1, revealed: true }])
    player.restart()
    expect(player.phase.value).toBe('intro')
    expect(player.index.value).toBe(0)
  })
})
