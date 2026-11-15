import { describe, expect, test } from 'bun:test'
import { zipSync, strToU8 } from 'fflate'
import {
  QCM_AI_PROMPT,
  QcmFormatError,
  aiCorrectionMessage,
  extractQcmYaml,
  correctIndexOf,
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

  test('refuse zéro ou plusieurs bonnes réponses', () => {
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('correct: true', 'correct: false')))).toBe('E_SCHEMA')
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('- text: 5', '- text: 5\n        correct: true')))).toBe('E_SCHEMA')
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
