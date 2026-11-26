/**
 * Génère le schéma du QCM « Chromosomes sexuels et hérédité » : SVG (svg/) puis WebP (media/).
 * Usage : node examples/chromosomes-sexuels/build-media.mjs
 * A : paire de chromosomes sexuels d'une fille (deux X). B : paire d'un garçon (un X, un Y plus petit).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const W = 960
const H = 600
const FONT = "font-family=\"'DejaVu Sans', 'Segoe UI', Arial, sans-serif\""
const FILL = '#c084fc'
const STROKE = '#6b21a8'
const CENTRO = '#5b1a8f'

const chromatid = (side, len) => {
  const d = `M ${20 * side},${-len} Q 0,0 ${20 * side},${len}`
  return `<path d="${d}" fill="none" stroke="${STROKE}" stroke-width="31" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="${FILL}" stroke-width="26" stroke-linecap="round"/>`
}
/** Chromosome à deux chromatides ; len = demi-longueur du corps. Centromère au centre. */
const chromo = (x, y, len, scale = 1) =>
  `<g transform="translate(${x},${y}) scale(${scale})">${chromatid(-1, len)}${chromatid(1, len)}<ellipse cx="0" cy="0" rx="17" ry="9" fill="${CENTRO}"/></g>`

function marker(mx, my, letter, tx, ty) {
  return `<line x1="${mx}" y1="${my}" x2="${tx}" y2="${ty}" stroke="#111827" stroke-width="3"/>
  <circle cx="${tx}" cy="${ty}" r="6" fill="#111827"/>
  <circle cx="${mx}" cy="${my}" r="24" fill="#ffffff" stroke="#111827" stroke-width="3.5"/>
  <text x="${mx}" y="${my + 10}" font-size="28" font-weight="700" fill="#111827" text-anchor="middle">${letter}</text>`
}

const panel = (x) => `<rect x="${x}" y="60" width="400" height="480" rx="24" fill="#e6f0fb" stroke="#5b86b8" stroke-width="4"/>`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT}>
<rect width="${W}" height="${H}" fill="#fbfcfe"/>
${panel(50)}${panel(510)}
${chromo(180, 320, 85, 1.5)}${chromo(320, 320, 85, 1.5)}
${chromo(640, 320, 85, 1.5)}${chromo(780, 395, 40, 1.5)}
<path d="M 105 165 V 150 H 395 V 165" fill="none" stroke="#111827" stroke-width="5" stroke-linejoin="round"/>
<path d="M 565 165 V 150 H 855 V 165" fill="none" stroke="#111827" stroke-width="5" stroke-linejoin="round"/>
${marker(250, 80, 'A', 250, 150)}
${marker(710, 80, 'B', 710, 150)}
</svg>`

mkdirSync(join(here, 'svg'), { recursive: true })
mkdirSync(join(here, 'media'), { recursive: true })
writeFileSync(join(here, 'svg', 'paires_chromosomes_sexuels.svg'), svg)

const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<canvas id="c" width="1280" height="800"></canvas>')
const b64 = await page.evaluate(async (source) => {
  const img = new Image()
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }))
  await new Promise((ok, ko) => ((img.onload = ok), (img.onerror = ko), (img.src = url)))
  const ctx = document.getElementById('c').getContext('2d')
  ctx.clearRect(0, 0, 1280, 800)
  ctx.drawImage(img, 0, 0, 1280, 800)
  return document.getElementById('c').toDataURL('image/webp', 0.9).split(',')[1]
}, svg)
const bytes = Buffer.from(b64, 'base64')
writeFileSync(join(here, 'media', 'paires_chromosomes_sexuels.webp'), bytes)
console.log(`media/paires_chromosomes_sexuels.webp ${bytes.length} octets`)
await browser.close()
