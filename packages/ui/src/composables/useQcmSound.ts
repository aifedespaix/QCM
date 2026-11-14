import { readonly, ref } from 'vue'

/**
 * Moteur audio procédural QCM : aucun fichier son, tout est synthétisé avec la Web Audio API.
 * Sons courts, doux (ondes sinus/triangle, attaque lente, volume bas), jamais stridents.
 * L'état muet est partagé par toute l'application et conservé dans localStorage.
 */

const STORAGE_KEY = 'qcm:muted'
const MASTER_VOLUME = 0.35

interface Note {
  /** Fréquence en hertz. */
  frequency: number
  /** Décalage de départ en secondes par rapport au début du son. */
  at: number
  /** Durée tenue avant le relâchement, en secondes. */
  hold: number
  type?: OscillatorType
  /** Volume de crête de la note, entre 0 et 1. */
  peak?: number
  attack?: number
  decay?: number
  /** Niveau de maintien, en proportion de `peak`. */
  sustain?: number
  release?: number
}

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const muted = ref(readMuted())
let context: AudioContext | null = null
let master: GainNode | null = null

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!context) {
    context = new AudioContext({ latencyHint: 'interactive' })
    master = context.createGain()
    master.gain.value = MASTER_VOLUME
    // Filtre passe-bas : retire les aigus agressifs.
    const softener = context.createBiquadFilter()
    softener.type = 'lowpass'
    softener.frequency.value = 3200
    softener.Q.value = 0.5
    master.connect(softener).connect(context.destination)
  }
  if (context.state === 'suspended') void context.resume()
  return context
}

function playNote(audio: AudioContext, output: AudioNode, startAt: number, note: Note): void {
  const peak = note.peak ?? 0.5
  const attack = note.attack ?? 0.012
  const decay = note.decay ?? 0.08
  const sustain = (note.sustain ?? 0.6) * peak
  const release = note.release ?? 0.18
  const t0 = startAt + note.at
  const tHoldEnd = t0 + Math.max(note.hold, attack + decay)
  const tEnd = tHoldEnd + release

  const oscillator = audio.createOscillator()
  oscillator.type = note.type ?? 'sine'
  oscillator.frequency.setValueAtTime(note.frequency, t0)

  // Enveloppe ADSR.
  const envelope = audio.createGain()
  envelope.gain.setValueAtTime(0.0001, t0)
  envelope.gain.linearRampToValueAtTime(peak, t0 + attack)
  envelope.gain.linearRampToValueAtTime(sustain, t0 + attack + decay)
  envelope.gain.setValueAtTime(sustain, tHoldEnd)
  envelope.gain.exponentialRampToValueAtTime(0.0001, tEnd)

  oscillator.connect(envelope).connect(output)
  oscillator.start(t0)
  oscillator.stop(tEnd + 0.02)
  oscillator.onended = () => {
    oscillator.disconnect()
    envelope.disconnect()
  }
}

function play(notes: Note[]): void {
  if (muted.value) return
  const audio = ensureContext()
  if (!audio || !master) return
  const startAt = audio.currentTime + 0.01
  for (const note of notes) playNote(audio, master, startAt, note)
}

/** Sélection d'une réponse : petit « toc » feutré. */
const SELECT: Note[] = [
  { frequency: 520, at: 0, hold: 0.03, type: 'triangle', peak: 0.28, attack: 0.004, decay: 0.03, sustain: 0.3, release: 0.06 },
]

/** Bonne réponse : deux notes montantes (quinte, do5 → sol5). */
const CORRECT: Note[] = [
  { frequency: 523.25, at: 0, hold: 0.09, peak: 0.42 },
  { frequency: 783.99, at: 0.1, hold: 0.16, peak: 0.42, release: 0.3 },
]

/** « Pas encore » : une seule note grave, ronde et neutre. Ni descente ni dissonance. */
const SOFT: Note[] = [
  { frequency: 329.63, at: 0, hold: 0.12, peak: 0.34, attack: 0.03, decay: 0.1, sustain: 0.5, release: 0.28 },
]

/** Fin de QCM : arpège majeur calme (do5, mi5, sol5, do6) puis accord tenu. */
const COMPLETE: Note[] = [
  { frequency: 523.25, at: 0, hold: 0.1, peak: 0.36 },
  { frequency: 659.25, at: 0.13, hold: 0.1, peak: 0.36 },
  { frequency: 783.99, at: 0.26, hold: 0.1, peak: 0.36 },
  { frequency: 1046.5, at: 0.39, hold: 0.3, peak: 0.34, release: 0.6 },
  { frequency: 523.25, at: 0.39, hold: 0.3, peak: 0.2, type: 'triangle', release: 0.6 },
  { frequency: 659.25, at: 0.39, hold: 0.3, peak: 0.16, type: 'triangle', release: 0.6 },
]

function setMuted(value: boolean): void {
  muted.value = value
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Stockage indisponible : l'état reste valable pour la session.
  }
  if (!value) play(SELECT)
}

export interface QcmSound {
  /** État muet, en lecture seule. Modifier avec `toggleMute` ou `setMuted`. */
  muted: Readonly<typeof muted>
  playSelect: () => void
  playCorrect: () => void
  playSoft: () => void
  playComplete: () => void
  toggleMute: () => void
  setMuted: (value: boolean) => void
}

export function useQcmSound(): QcmSound {
  return {
    muted: readonly(muted),
    playSelect: () => play(SELECT),
    playCorrect: () => play(CORRECT),
    playSoft: () => play(SOFT),
    playComplete: () => play(COMPLETE),
    toggleMute: () => setMuted(!muted.value),
    setMuted,
  }
}
