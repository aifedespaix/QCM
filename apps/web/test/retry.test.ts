import { describe, expect, test } from 'bun:test'
import { GET_TIMEOUT_MS, withGetTimeout, withRetry } from '../src/lib/retry.ts'

describe('withRetry', () => {
  test('rejoue une erreur réseau puis réussit', async () => {
    let calls = 0
    const result = await withRetry(async () => {
      if (++calls < 3) throw Object.assign(new Error('réseau'), { status: 0 })
      return 'ok'
    }, 4, 1)
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  test('ne rejoue pas une erreur 404', async () => {
    let calls = 0
    await expect(
      withRetry(async () => {
        calls++
        throw Object.assign(new Error('absent'), { status: 404 })
      }, 4, 1),
    ).rejects.toThrow('absent')
    expect(calls).toBe(1)
  })

  test('abandonne après le nombre de tentatives', async () => {
    let calls = 0
    await expect(
      withRetry(async () => {
        calls++
        throw Object.assign(new Error('panne'), { status: 503 })
      }, 3, 1),
    ).rejects.toThrow('panne')
    expect(calls).toBe(3)
  })
})

describe('withGetTimeout', () => {
  test('pose un délai sur une lecture', () => {
    expect(withGetTimeout({ method: 'GET' }).signal).toBeInstanceOf(AbortSignal)
    expect(withGetTimeout({}).signal).toBeInstanceOf(AbortSignal)
  })

  test("ne touche ni à l'écriture ni à un signal existant", () => {
    expect(withGetTimeout({ method: 'POST' }).signal).toBeUndefined()
    const own = new AbortController().signal
    expect(withGetTimeout({ method: 'GET', signal: own }).signal).toBe(own)
  })

  test('une requête suspendue est coupée au bout du délai', async () => {
    const options = withGetTimeout({ method: 'GET' }, 30)
    const hung = new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new Error('coupé'))))
    await expect(hung).rejects.toThrow('coupé')
    expect(GET_TIMEOUT_MS).toBeGreaterThan(1000)
  })
})
