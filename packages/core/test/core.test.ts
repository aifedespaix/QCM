import { describe, expect, test } from 'bun:test'
import { zipSync, strToU8 } from 'fflate'
import {
  QCM_AI_PROMPT,
  QcmFormatError,
  addAttempt,
  aiCorrectionMessage,
  computeStats,
  emptyHistory,
  entryFromQcm,
  linkEntry,
  matchLibrary,
  replaceEntry,
  formatRelativeDay,
  parseHistory,
  qcmFingerprint,
  removeEntry,
  statusOfRate,
  suggestNext,
  upsertEntry,
  extractQcmYaml,
  correctIndexOf,
  correctIndexesOf,
  isMultipleAnswer,
  fitWithin,
  isWebp,
  mediaPathFor,
  parseQcmYaml,
  qcmFileName,
  readQcmArchive,
  stringifyQcmYaml,
  summarizeQcm,
  writeQcmArchive,
} from '../src/index.ts'

// Normalisé en LF : sous Windows, git peut extraire le fichier en CRLF.
const EXAMPLE = (await Bun.file(new URL('../../../examples/fractions/data.yaml', import.meta.url)).text()).replace(/\r\n/g, '\n')

/** Plus petit en-tête WebP accepté par `isWebp`. */
const FAKE_WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0])

const MINIMAL = `
version: 1
meta: { title: Test, subject: maths, level: 6e, chapter: Chapitre 1 }
questions:
  - id: q1
    prompt: Combien font 2 + 2 ?
    image: media/q1_schema.webp
    choices:
      - text: 4
        correct: true
      - text: 5
    explanation: 2 + 2 = 4.
`

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof QcmFormatError) return error.code
    throw error
  }
  return 'NO_ERROR'
}

describe('schema', () => {
  test('accepte le QCM d\'exemple', () => {
    const qcm = parseQcmYaml(EXAMPLE)
    expect(qcm.questions).toHaveLength(5)
    expect(qcm.meta.language).toBe('fr')
    expect(summarizeQcm(qcm)).toEqual({ questionCount: 5, hasImages: false, imagePaths: [] })
    expect(correctIndexOf(qcm.questions[0]!)).toBe(0)
  })

  test('convertit les nombres en texte et applique les valeurs par défaut', () => {
    const qcm = parseQcmYaml(MINIMAL)
    expect(qcm.questions[0]!.choices).toEqual([
      { text: '4', correct: true },
      { text: '5', correct: false },
    ])
  })

  test('refuse zéro bonne réponse, ou toutes les réponses correctes', () => {
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('correct: true', 'correct: false')))).toBe('E_SCHEMA')
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('- text: 5', '- text: 5\n        correct: true')))).toBe('E_SCHEMA')
  })

  test('accepte plusieurs bonnes réponses tant qu\'une mauvaise reste', () => {
    const multi = MINIMAL.replace(
      '- text: 5',
      '- text: 5\n        correct: true\n      - text: 6',
    )
    const question = parseQcmYaml(multi).questions[0]!
    expect(correctIndexesOf(question)).toEqual([0, 1])
    expect(isMultipleAnswer(question)).toBe(true)
    expect(isMultipleAnswer(parseQcmYaml(MINIMAL).questions[0]!)).toBe(false)
  })

  test('refuse les clés inconnues, les identifiants en double et une mauvaise version', () => {
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('explanation:', 'score: 3\n    explanation:')))).toBe('E_SCHEMA')
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('version: 1', 'version: 2')))).toBe('E_SCHEMA')
    const twice = MINIMAL + MINIMAL.slice(MINIMAL.indexOf('  - id: q1'))
    expect(codeOf(() => parseQcmYaml(twice))).toBe('E_SCHEMA')
  })

  test('refuse un chemin d\'image hors de media/', () => {
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('media/q1_schema.webp', '../secret.webp')))).toBe('E_SCHEMA')
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('media/q1_schema.webp', 'media/Q1.png')))).toBe('E_SCHEMA')
  })

  test('signale un YAML illisible', () => {
    expect(codeOf(() => parseQcmYaml('version: [1'))).toBe('E_YAML')
  })

  test('donne des détails lisibles', () => {
    try {
      parseQcmYaml(MINIMAL.replace('correct: true', 'correct: false'))
      throw new Error('aurait dû échouer')
    } catch (error) {
      expect(error).toBeInstanceOf(QcmFormatError)
      expect((error as QcmFormatError).details[0]).toStartWith('questions[0].choices : ')
    }
  })
})

describe('archive', () => {
  test('aller-retour YAML stable', () => {
    const qcm = parseQcmYaml(EXAMPLE)
    const yaml = stringifyQcmYaml(qcm)
    expect(parseQcmYaml(yaml)).toEqual(qcm)
    expect(yaml).not.toContain('correct: false')
    expect(stringifyQcmYaml(parseQcmYaml(yaml))).toBe(yaml)
  })

  test('aller-retour ZIP avec image', () => {
    const data = parseQcmYaml(MINIMAL)
    const media = new Map([
      ['media/q1_schema.webp', FAKE_WEBP],
      ['media/inutile.webp', FAKE_WEBP],
    ])
    const bytes = writeQcmArchive({ data, media })
    const archive = readQcmArchive(bytes)
    expect(archive.data).toEqual(data)
    expect([...archive.media.keys()]).toEqual(['media/q1_schema.webp'])
    expect(isWebp(archive.media.get('media/q1_schema.webp')!)).toBe(true)
  })

  test('erreurs d\'archive', () => {
    const data = parseQcmYaml(MINIMAL)
    expect(codeOf(() => writeQcmArchive({ data }))).toBe('E_MEDIA_MISSING')
    expect(codeOf(() => writeQcmArchive({ data, media: new Map([['media/q1_schema.webp', strToU8('png')]]) }))).toBe('E_MEDIA_INVALID')
    expect(codeOf(() => readQcmArchive(strToU8('pas un zip')))).toBe('E_NOT_ZIP')
    expect(codeOf(() => readQcmArchive(zipSync({ 'autre.txt': strToU8('x') })))).toBe('E_NO_DATA')
    expect(codeOf(() => readQcmArchive(zipSync({ 'data.yaml': strToU8(MINIMAL) })))).toBe('E_MEDIA_MISSING')
    expect(codeOf(() => readQcmArchive(zipSync({ 'data.yaml': new Uint8Array(1024 * 1024 + 1) })))).toBe('E_TOO_BIG')
  })

  test('ignore les fichiers non prévus', () => {
    const bytes = zipSync({
      'data.yaml': strToU8(EXAMPLE),
      'media/virus.exe': strToU8('x'),
      '../evil.webp': FAKE_WEBP,
    })
    expect(readQcmArchive(bytes).media.size).toBe(0)
  })

  test('nom de fichier', () => {
    expect(qcmFileName('Les fractions : comparer & simplifier !')).toBe('les-fractions-comparer-simplifier.qcm')
    expect(qcmFileName('???')).toBe('qcm.qcm')
  })
})

describe('webp', () => {
  test('fitWithin conserve les proportions et n\'agrandit jamais', () => {
    expect(fitWithin(2560, 1440, 1280)).toEqual({ width: 1280, height: 720 })
    expect(fitWithin(1000, 4000, 1280)).toEqual({ width: 320, height: 1280 })
    expect(fitWithin(640, 480, 1280)).toEqual({ width: 640, height: 480 })
  })

  test('mediaPathFor produit des chemins valides et uniques', () => {
    expect(mediaPathFor('q3', 'Schéma Cellule.PNG')).toBe('media/q3_schema-cellule.webp')
    expect(mediaPathFor('q3', 'Schéma Cellule.PNG', ['media/q3_schema-cellule.webp'])).toBe('media/q3_schema-cellule-2.webp')
    expect(mediaPathFor('q1', '???.jpg')).toBe('media/q1_image.webp')
  })
})

describe('prompt IA', () => {
  test('le prompt de @qcm/core est identique à celui de la documentation', async () => {
    const doc = await Bun.file(new URL('../../../docs/skill-ingestion-cours.md', import.meta.url)).text()
    const block = /```text\n([\s\S]*?)\n```/.exec(doc.replace(/\r\n/g, '\n'))?.[1]
    expect(block).toBeDefined()
    expect(QCM_AI_PROMPT).toBe(block as string)
  })

  test('extractQcmYaml retire le bloc de code et les phrases autour', () => {
    const pasted = `Voici ton questionnaire :\n\n\`\`\`yaml\n${EXAMPLE.trim()}\n\`\`\`\n\nBonne révision.`
    expect(parseQcmYaml(extractQcmYaml(pasted)).questions).toHaveLength(5)
    expect(parseQcmYaml(extractQcmYaml(`Bien sûr.\n${EXAMPLE}`)).meta.title).toBe('Les fractions : comparer et simplifier')
    expect(extractQcmYaml(EXAMPLE)).toBe(EXAMPLE.trim())
  })

  test('aiCorrectionMessage liste les points à corriger', () => {
    expect(aiCorrectionMessage(['questions[0].choices : trop court'])).toContain('- questions[0].choices : trop court')
  })
})

describe('suivi des révisions', () => {
  const qcm = parseQcmYaml(EXAMPLE)
  const DAY = 86_400_000
  const now = new Date(2026, 10, 15, 12).getTime()

  test('empreinte stable, sensible au contenu', () => {
    const key = qcmFingerprint(qcm)
    expect(key).toMatch(/^[a-z0-9]{22}$/)
    expect(qcmFingerprint(parseQcmYaml(EXAMPLE))).toBe(key)
    expect(qcmFingerprint({ ...qcm, meta: { ...qcm.meta, title: 'Autre titre' } })).not.toBe(key)
  })

  test('enregistre les passages et calcule le suivi', () => {
    const entry = entryFromQcm(qcm, { recordId: 'abc' }, now - 2 * DAY)
    let history = upsertEntry(emptyHistory(), entry)
    const ids = qcm.questions.map((question) => question.id)
    // Premier passage : 1 réussie du premier coup, 2 après essai, 2 réponses affichées.
    history = addAttempt(history, entry.key, {
      total: 5,
      completed: true,
      questions: ids.map((id, index) => ({ id, wrong: index === 0 ? 0 : 1, revealed: index > 2 })),
    }, now - 2 * DAY)
    // Second passage : 4 sur 5.
    history = addAttempt(history, entry.key, {
      total: 5,
      completed: true,
      questions: ids.map((id, index) => ({ id, wrong: index === 4 ? 2 : 0, revealed: false })),
    }, now)
    // Passage inconnu ou vide : ignoré.
    expect(addAttempt(history, 'inconnu', { total: 1, completed: true, questions: [{ id: 'q1', wrong: 0, revealed: false }] })).toBe(history)
    expect(addAttempt(history, entry.key, { total: 5, completed: false, questions: [] })).toBe(history)

    const stats = computeStats(history, { now })
    expect(stats.sessions).toBe(2)
    expect(stats.counts).toEqual({ first: 5, retry: 3, revealed: 2, seen: 10 })
    expect(stats.activeDays).toBe(2)
    expect(stats.week).toHaveLength(7)
    const [stat] = stats.qcms
    expect(stat!.status).toBe('acquired')
    expect(stat!.trend).toEqual([0.2, 0.8])
    expect(stat!.weak).toEqual([{ id: ids[4]!, prompt: qcm.questions[4]!.prompt, outcome: 'retry', misses: 2 }])
    expect(stats.subjects[0]).toMatchObject({ subject: 'maths', qcmCount: 1, rate: 0.5 })

    // Période limitée à aujourd'hui : seul le second passage compte.
    expect(computeStats(history, { now, since: now - DAY / 2 }).counts.seen).toBe(5)

    const reread = parseHistory(JSON.stringify(history))
    expect(reread.attempts).toHaveLength(2)
    expect(upsertEntry(reread, entryFromQcm(qcm)).entries[0]!.recordId).toBe('abc')
    expect(removeEntry(reread, entry.key)).toEqual(emptyHistory())
    expect(parseHistory('pas du json')).toEqual(emptyHistory())
  })

  test('statuts et dates relatives', () => {
    expect(statusOfRate(0.8)).toBe('acquired')
    expect(statusOfRate(0.5)).toBe('progress')
    expect(statusOfRate(0.49)).toBe('review')
    expect(formatRelativeDay(now, now)).toBe('aujourd\'hui')
    expect(formatRelativeDay(now - DAY, now)).toBe('hier')
    expect(formatRelativeDay(now - 3 * DAY, now)).toBe('il y a 3 jours')
  })
})

describe('lien avec la bibliothèque en ligne', () => {
  const qcm = parseQcmYaml(EXAMPLE)
  const key = qcmFingerprint(qcm)

  test('même empreinte : relié sans identifiant mémorisé (fichier ouvert depuis le disque)', () => {
    const matches = matchLibrary([{ key }], [{ id: 'r1', fingerprint: key }])
    expect(matches.get(key)).toEqual({ recordId: 'r1', state: 'current' })
  })

  test('identifiant connu mais contenu différent : mise à jour disponible', () => {
    const matches = matchLibrary([{ key, recordId: 'r1' }], [{ id: 'r1', fingerprint: 'autre' }])
    expect(matches.get(key)).toEqual({ recordId: 'r1', state: 'outdated' })
  })

  test('QCM en ligne sans empreinte : relié, version non comparable', () => {
    expect(matchLibrary([{ key, recordId: 'r1' }], [{ id: 'r1' }]).get(key)?.state).toBe('linked')
  })

  test('« retiré » seulement si la réponse est complète ; jamais de lien inventé', () => {
    expect(matchLibrary([{ key, recordId: 'r1' }], []).get(key)?.state).toBe('removed')
    expect(matchLibrary([{ key, recordId: 'r1' }], [], false).has(key)).toBe(false)
    expect(matchLibrary([{ key }], [{ id: 'r2', fingerprint: 'autre' }]).has(key)).toBe(false)
  })

  test('doublons en ligne : on garde celui déjà mémorisé', () => {
    const found = [{ id: 'a', fingerprint: key }, { id: 'b', fingerprint: key }]
    expect(matchLibrary([{ key, recordId: 'b' }], found).get(key)?.recordId).toBe('b')
  })

  test('linkEntry n\'écrit que pour un QCM connu', () => {
    const history = upsertEntry(emptyHistory(), entryFromQcm(qcm, {}, 1))
    expect(linkEntry(history, key, 'r1').entries[0]?.recordId).toBe('r1')
    expect(linkEntry(history, 'inconnu', 'r1')).toBe(history)
  })

  test('nouvelle version : le suivi des questions inchangées est repris, pas celui des questions réécrites', () => {
    const entry = entryFromQcm(qcm, { recordId: 'r1' }, 1)
    const [first, second] = qcm.questions
    let history = upsertEntry(emptyHistory(), entry)
    history = addAttempt(history, entry.key, {
      total: 2,
      completed: true,
      questions: [
        { id: first!.id, wrong: 0, revealed: false },
        { id: second!.id, wrong: 1, revealed: false },
      ],
    }, 2)
    const edited = { ...qcm, questions: qcm.questions.map((question, index) => (index === 1 ? { ...question, prompt: 'Énoncé réécrit' } : question)) }
    const next = entryFromQcm(edited, { recordId: 'r1' }, 3)
    const result = replaceEntry(history, entry.key, next)
    expect(result.entries.map((item) => item.key)).toEqual([next.key])
    expect(result.entries[0]?.recordId).toBe('r1')
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0]?.key).toBe(next.key)
    expect(result.attempts[0]?.questions.map((question) => question.id)).toEqual([first!.id])
  })
})

describe('suggestNext', () => {
  const entry = (key: string, subject: 'maths' | 'francais', openedAt: number) => ({
    key,
    title: key,
    subject,
    level: '6e' as const,
    chapter: 'c',
    questionCount: 2,
    prompts: { q1: 'a', q2: 'b' },
    openedAt,
  })
  const result = (wrong: number) => ({
    total: 2,
    completed: true,
    questions: [
      { id: 'q1', wrong: 0, revealed: false },
      { id: 'q2', wrong, revealed: false },
    ],
  })

  test('propose la même matière d\'abord, jamais un QCM acquis ni le QCM courant', () => {
    let history = emptyHistory()
    for (const item of [entry('cur', 'maths', 1), entry('ok', 'maths', 2), entry('weak', 'francais', 3), entry('new', 'maths', 4), entry('mid', 'maths', 5)]) {
      history = upsertEntry(history, item)
    }
    history = addAttempt(history, 'cur', result(0))
    history = addAttempt(history, 'ok', result(0))
    history = addAttempt(history, 'weak', { ...result(1), questions: [{ id: 'q1', wrong: 1, revealed: false }, { id: 'q2', wrong: 1, revealed: true }] })
    history = addAttempt(history, 'mid', result(1))
    const keys = suggestNext(history, 'cur').map((item) => item.entry.key)
    expect(keys).toEqual(['mid', 'new', 'weak'])
    expect(suggestNext(history, 'cur', { limit: 1 })).toHaveLength(1)
    expect(suggestNext(history, 'cur', { canOpen: (item) => item.key !== 'mid' }).map((item) => item.entry.key)).toEqual(['new', 'weak'])
  })

  test('liste vide quand tout est maîtrisé', () => {
    let history = upsertEntry(upsertEntry(emptyHistory(), entry('a', 'maths', 1)), entry('b', 'maths', 2))
    history = addAttempt(history, 'a', result(0))
    history = addAttempt(history, 'b', result(0))
    expect(suggestNext(history, 'a')).toEqual([])
  })
})
