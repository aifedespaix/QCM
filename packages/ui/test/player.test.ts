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

  test('question à plusieurs bonnes réponses : cocher, décocher, valider', () => {
    const multi = validateQcm({
      version: 1,
      meta: { title: 'Multi', subject: 'maths', level: '6e', chapter: 'Chapitre 1' },
      questions: [
        {
          id: 'q1',
          prompt: 'Quels nombres sont pairs ?',
          choices: [{ text: '2', correct: true }, { text: '3' }, { text: '4', correct: true }, { text: '5' }],
          explanation: '2 et 4 sont pairs.',
        },
      ],
    })
    const player = useQcmPlayer(multi)
    player.start()
    expect(player.multiple.value).toBe(true)
    expect(player.correctIndexes.value).toEqual([0, 2])

    // Cocher puis décocher.
    player.select(2)
    player.select(0)
    expect(player.selectedIndexes.value).toEqual([0, 2])
    player.select(0)
    expect(player.selectedIndexes.value).toEqual([2])

    // Réponse incomplète : refusée, rien n'est grisé (on ne révèle pas la bonne réponse partielle).
    player.validate()
    expect(player.phase.value).toBe('retry')
    expect(player.triedIndexes.value).toEqual([])
    expect(player.selectedIndexes.value).toEqual([])

    // Une mauvaise réponse en plus : elle est grisée.
    player.select(0)
    player.select(2)
    player.select(1)
    player.validate()
    expect(player.phase.value).toBe('retry')
    expect(player.triedIndexes.value).toEqual([1])
    player.select(1) // grisée : ignorée
    expect(player.selectedIndexes.value).toEqual([])

    player.select(2)
    player.select(0)
    player.validate()
    expect(player.phase.value).toBe('correct')
    player.next()
    expect(player.results.value).toEqual([{ id: 'q1', wrong: 2, revealed: false }])
  })
})
