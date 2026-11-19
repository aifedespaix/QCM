/**
 * Schémas des trois QCM de musique (séquence « La voix est-elle toujours porteuse de sens ? », 3e).
 * Usage : node examples/musique/build-media.mjs
 * Écrit dans examples/musique-histoire-du-soldat, examples/musique-voix et examples/musique-echauffement-vocal.
 * Tous les dessins sont originaux (aucune partition ni pochette d'un auteur n'est reproduite).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const W = 960
const H = 600
const FONT = "font-family=\"'DejaVu Sans', 'Segoe UI', Arial, sans-serif\""
const INK = '#1f2937'
const ORANGE = '#e8590c'
const BLUE = '#2563eb'
const TEAL = '#0f9d8a'

const f = (n) => Math.round(n * 100) / 100
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT}>
<rect width="${W}" height="${H}" fill="#fbfcfe"/>
${body}
</svg>`
const text = (x, y, s, { size = 24, fill = INK, anchor = 'middle', weight = 400 } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${s}</text>`
const badge = (letter, x, y) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="26" fill="#ffffff" stroke="#111827" stroke-width="3"/>${text(x, y + 10, letter, { size: 28, weight: 700 })}`

/** Personnage simple : tête + buste. */
const person = (x, y, color, s = 1) =>
  `<circle cx="${f(x)}" cy="${f(y - 30 * s)}" r="${f(15 * s)}" fill="${color}"/>
   <path d="M ${f(x - 24 * s)} ${f(y + 30 * s)} Q ${f(x - 24 * s)} ${f(y - 8 * s)} ${f(x)} ${f(y - 8 * s)} Q ${f(x + 24 * s)} ${f(y - 8 * s)} ${f(x + 24 * s)} ${f(y + 30 * s)} Z" fill="${color}"/>`

const legend = (items, y = 560) => {
  const w = items.map((i) => 70 + i[1].length * 12)
  let x = (W - w.reduce((a, b) => a + b, 0)) / 2
  return items
    .map(([color, label], i) => {
      const out = `<circle cx="${f(x + 14)}" cy="${y - 7}" r="12" fill="${color}"/>${text(x + 36, y, label, { size: 22, anchor: 'start' })}`
      x += w[i]
      return out
    })
    .join('')
}

/* ---- Plan de scène : 3 récitants et 7 instrumentistes ---- */
function planScene() {
  const reciters = [0, 1, 2].map((i) => person(210, 180 + i * 110, ORANGE)).join('')
  const players = Array.from({ length: 7 }, (_, i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = 420 + col * 120 + (row === 1 ? 60 : 0)
    const y = 200 + row * 150
    return `<circle cx="${x}" cy="${y}" r="34" fill="${BLUE}"/><circle cx="${x}" cy="${y}" r="14" fill="#ffffff" opacity="0.9"/>`
  }).join('')
  return svg(`
  ${text(480, 56, 'Plan de scène', { size: 28, weight: 600 })}
  <rect x="100" y="90" width="760" height="400" rx="26" fill="#eef2f8" stroke="#c7d0de" stroke-width="3"/>
  ${reciters}${players}
  ${legend([[ORANGE, 'récitant'], [BLUE, 'instrumentiste']])}`)
}

/* ---- Partition graphique originale (formes libres, sans texte) ---- */
function partitionGraphique() {
  const staff = [0, 1, 2, 3, 4].map((i) => `<line x1="70" y1="${150 + i * 14}" x2="400" y2="${150 + i * 14}" stroke="#9ca3af" stroke-width="2"/>`).join('')
  const staff2 = [0, 1, 2, 3, 4].map((i) => `<line x1="560" y1="${400 + i * 14}" x2="890" y2="${400 + i * 14}" stroke="#9ca3af" stroke-width="2"/>`).join('')
  const dots = [[120, 330], [138, 318], [158, 335], [180, 322], [200, 340], [222, 326]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${5 + (i % 3) * 3}" fill="${INK}"/>`).join('')
  const stripes = Array.from({ length: 9 }, (_, i) => `<line x1="${600 + i * 14}" y1="${120 + i * 4}" x2="${880 - i * 28}" y2="${120 + i * 4}" stroke="${INK}" stroke-width="${3 + (i % 3)}" stroke-linecap="round"/>`).join('')
  return svg(`
  ${staff}${staff2}
  <path d="M 80 250 C 160 90, 230 360, 330 200 S 470 120, 520 260" fill="none" stroke="${ORANGE}" stroke-width="9" stroke-linecap="round"/>
  <path d="M 90 470 C 180 400, 250 540, 360 470 S 470 420, 520 480" fill="none" stroke="${BLUE}" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 16"/>
  <path d="M 540 300 L 620 230 L 700 330 L 780 210 L 880 300" fill="none" stroke="${TEAL}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}${stripes}
  <ellipse cx="760" cy="520" rx="70" ry="26" fill="${ORANGE}" opacity="0.8"/>
  <circle cx="430" cy="360" r="46" fill="none" stroke="${INK}" stroke-width="5"/>
  <circle cx="430" cy="360" r="22" fill="none" stroke="${INK}" stroke-width="5"/>
  ${text(480, 575, 'Dessin original, créé pour ce QCM', { size: 18, fill: '#6b7280' })}`)
}

/* ---- Trois sons à des hauteurs différentes ---- */
function hauteur() {
  const notes = [['A', 480, 300], ['B', 700, 150], ['C', 260, 450]]
  const out = notes.map(([l, x, y]) => `<circle cx="${x}" cy="${y}" r="34" fill="${BLUE}"/><circle cx="${x}" cy="${y}" r="12" fill="#fff" opacity="0.9"/>${badge(l, x + 84, y)}`).join('')
  return svg(`
  <line x1="90" y1="520" x2="90" y2="90" stroke="${INK}" stroke-width="4"/><path d="M 72 112 L 90 80 L 108 112 Z" fill="${INK}"/>
  ${text(90, 565, 'hauteur du son', { size: 22, anchor: 'start' })}
  ${[150, 300, 450].map((y) => `<line x1="110" y1="${y}" x2="900" y2="${y}" stroke="#e5e7eb" stroke-width="2"/>`).join('')}
  ${out}`)
}

/* ---- Trois sons de force différente (indicateur de volume) ---- */
function nuance() {
  const cols = [['A', 220, 6], ['B', 480, 1], ['C', 740, 3]]
  const out = cols
    .map(([l, x, n]) => {
      const bars = Array.from({ length: 6 }, (_, i) => `<rect x="${x - 55}" y="${440 - i * 62}" width="110" height="48" rx="10" fill="${i < n ? ORANGE : '#e5e7eb'}"/>`).join('')
      return bars + badge(l, x, 520)
    })
    .join('')
  return svg(`${text(480, 56, 'Force du son', { size: 28, weight: 600 })}${out}`)
}

/* ---- Deux sons de durée différente ---- */
function duree() {
  return svg(`
  ${text(480, 56, 'Durée du son', { size: 28, weight: 600 })}
  <line x1="90" y1="500" x2="880" y2="500" stroke="${INK}" stroke-width="4"/><path d="M 860 482 L 892 500 L 860 518 Z" fill="${INK}"/>
  ${text(880, 545, 'temps', { size: 22, anchor: 'end' })}
  <rect x="120" y="170" width="520" height="70" rx="35" fill="${BLUE}"/>${badge('A', 690, 205)}
  <rect x="120" y="320" width="130" height="70" rx="35" fill="${ORANGE}"/>${badge('B', 300, 355)}`)
}

/* ---- Technique responsoriale : une personne chante, le groupe répète ---- */
function responsorial() {
  const group = [0, 1, 2, 3, 4].map((i) => person(320 + i * 80, 440, BLUE, 0.9)).join('')
  return svg(`
  ${person(190, 200, ORANGE, 1.1)}
  <path d="M 262 205 l 24 -14 v -42 a 18 18 0 0 1 18 -18 h 460 a 18 18 0 0 1 18 18 v 72 a 18 18 0 0 1 -18 18 h -460 a 18 18 0 0 1 -18 -18 z" fill="#fff" stroke="${ORANGE}" stroke-width="4"/>
  ${text(550, 200, 'bada bada bada bada', { size: 28 })}
  <path d="M 480 285 v 60" stroke="${INK}" stroke-width="5"/><path d="M 462 331 L 480 363 L 498 331 Z" fill="${INK}"/>
  ${group}
  ${text(480, 535, 'bada bada bada bada', { size: 28 })}`)
}

const OUT = {
  'musique-histoire-du-soldat': { plan_scene: planScene() },
  'musique-voix': { partition_graphique: partitionGraphique() },
  'musique-echauffement-vocal': { hauteur: hauteur(), nuance: nuance(), duree: duree(), responsorial: responsorial() },
}

const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<canvas id="c" width="1280" height="800"></canvas>')
for (const [folder, images] of Object.entries(OUT)) {
  const root = join(here, '..', folder)
  mkdirSync(join(root, 'svg'), { recursive: true })
  mkdirSync(join(root, 'media'), { recursive: true })
  for (const [name, content] of Object.entries(images)) {
    writeFileSync(join(root, 'svg', `${name}.svg`), content)
    const b64 = await page.evaluate(async (source) => {
      const img = new Image()
      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }))
      await new Promise((ok, ko) => ((img.onload = ok), (img.onerror = ko), (img.src = url)))
      const canvas = document.getElementById('c')
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, 1280, 800)
      ctx.drawImage(img, 0, 0, 1280, 800)
      return canvas.toDataURL('image/webp', 0.9).split(',')[1]
    }, content)
    writeFileSync(join(root, 'media', `${name}.webp`), Buffer.from(b64, 'base64'))
    console.log(`${folder}/media/${name}.webp`)
  }
}
await browser.close()
