/**
 * Génère les deux schémas du QCM « Le chromosome » : SVG (dossier svg/) puis WebP (dossier media/).
 * Usage : node examples/chromosome/build-media.mjs
 * Les schémas sont dessinés par code : les repères A, B, C, D sont exacts et ne portent aucun nom,
 * l'élève choisit la bonne réponse au lieu d'écrire la légende.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const W = 960
const H = 600
const FONT = "font-family=\"'DejaVu Sans', 'Segoe UI', Arial, sans-serif\""
const f = (n) => Math.round(n * 100) / 100

const CHROMO_FILL = '#c084fc'
const CHROMO_STROKE = '#6b21a8'
const CENTRO = '#5b1a8f'

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT}>
<rect width="${W}" height="${H}" fill="#fbfcfe"/>
${body}
</svg>`

/** Chromosome à deux chromatides reliées par le centromère, centré en (0, 0), hauteur 136. */
const chromatid = (side) => {
  const d = `M ${20 * side},-55 Q 0,0 ${20 * side},55`
  return `<path d="${d}" fill="none" stroke="${CHROMO_STROKE}" stroke-width="31" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="${CHROMO_FILL}" stroke-width="26" stroke-linecap="round"/>`
}
const chromosomeShape = () => `${chromatid(-1)}${chromatid(1)}
  <ellipse cx="0" cy="0" rx="17" ry="9" fill="${CENTRO}"/>`

const chromosome = (x, y, scale, angle) =>
  `<g transform="translate(${f(x)},${f(y)}) rotate(${angle}) scale(${scale})">${chromosomeShape()}</g>`

/** Repère : pastille avec une lettre, reliée par un trait au point visé. */
function marker(mx, my, letter, tx, ty) {
  return `<line x1="${mx}" y1="${my}" x2="${tx}" y2="${ty}" stroke="#111827" stroke-width="3"/>
  <circle cx="${tx}" cy="${ty}" r="6" fill="#111827"/>
  <circle cx="${mx}" cy="${my}" r="24" fill="#ffffff" stroke="#111827" stroke-width="3.5"/>
  <text x="${mx}" y="${my + 10}" font-size="28" font-weight="700" fill="#111827" text-anchor="middle">${letter}</text>`
}

function helix(cx, y0, y1) {
  const A = 48
  const P = 100
  const strand = (phase) => {
    const pts = []
    for (let y = y0; y <= y1; y += 4) pts.push(`${f(cx + A * Math.sin(((y - y0) / P) * 2 * Math.PI + phase))},${y}`)
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="${phase ? '#e8590c' : '#2563eb'}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  const rungs = []
  for (let y = y0 + 6; y <= y1 - 6; y += 12.5) {
    const a = Math.sin(((y - y0) / P) * 2 * Math.PI)
    rungs.push(`<line x1="${f(cx + A * a)}" y1="${y}" x2="${f(cx - A * a)}" y2="${y}" stroke="#9ca3af" stroke-width="4"/>`)
  }
  return rungs.join('') + strand(0) + strand(Math.PI)
}

/** Image 1 : cellule, noyau, chromosomes et ADN. A cellule, B noyau, C chromosome, D ADN. */
function cellule() {
  const target = { x: 322, y: 292 }
  return svg(`
  <circle cx="270" cy="310" r="235" fill="#e6f0fb" stroke="#5b86b8" stroke-width="6"/>
  <circle cx="270" cy="310" r="105" fill="#c7d8f1" stroke="#3d5a99" stroke-width="5"/>
  <line x1="${target.x + 12}" y1="${target.y - 8}" x2="745" y2="154" stroke="#6b7280" stroke-width="2.5" stroke-dasharray="7 6"/>
  <line x1="${target.x + 12}" y1="${target.y + 8}" x2="745" y2="446" stroke="#6b7280" stroke-width="2.5" stroke-dasharray="7 6"/>
  ${chromosome(232, 275, 0.62, -25)}
  ${chromosome(target.x, target.y, 0.62, 20)}
  ${chromosome(240, 348, 0.62, 50)}
  ${chromosome(308, 342, 0.62, -40)}
  <circle cx="770" cy="300" r="150" fill="#ffffff" stroke="#4b5563" stroke-width="5"/>
  ${helix(770, 170, 430)}
  ${marker(62, 62, 'A', 150, 225)}
  ${marker(270, 30, 'B', 270, 228)}
  ${marker(478, 150, 'C', target.x + 6, target.y - 6)}
  ${marker(905, 90, 'D', 800, 218)}`)
}

/** Image 2 : chromosome à deux chromatides. A centromère, B une chromatide, C chromosome entier. */
function chromosomeDouble() {
  return svg(`
  <g transform="translate(430,300) scale(3.2)">${chromosomeShape()}</g>
  <path d="M 590 80 H 625 V 520 H 590" fill="none" stroke="#111827" stroke-width="5" stroke-linejoin="round"/>
  ${marker(130, 300, 'A', 430, 300)}
  ${marker(150, 120, 'B', 382, 175)}
  ${marker(780, 300, 'C', 625, 300)}`)
}

const IMAGES = { cellule_noyau_chromosome_adn: cellule(), chromosome_deux_chromatides: chromosomeDouble() }

mkdirSync(join(here, 'svg'), { recursive: true })
mkdirSync(join(here, 'media'), { recursive: true })
for (const [name, content] of Object.entries(IMAGES)) writeFileSync(join(here, 'svg', `${name}.svg`), content)

/* ---------- Conversion SVG → WebP (Chromium, Canvas) ---------- */
const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<canvas id="c" width="1280" height="800"></canvas>')
for (const [name, content] of Object.entries(IMAGES)) {
  const b64 = await page.evaluate(
    async (source) => {
      const img = new Image()
      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }))
      await new Promise((ok, ko) => ((img.onload = ok), (img.onerror = ko), (img.src = url)))
      const canvas = document.getElementById('c')
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, 1280, 800)
      ctx.drawImage(img, 0, 0, 1280, 800)
      return canvas.toDataURL('image/webp', 0.9).split(',')[1]
    },
    content,
  )
  const bytes = Buffer.from(b64, 'base64')
  writeFileSync(join(here, 'media', `${name}.webp`), bytes)
  console.log(`examples/chromosome/media/${name}.webp ${bytes.length} octets`)
}
await browser.close()
