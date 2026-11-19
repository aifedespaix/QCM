/**
 * Génère les schémas du QCM « L'atome et les molécules » : SVG (dossier svg/) puis WebP (dossier media/).
 * Usage : node examples/atome/build-media.mjs
 * Les schémas sont dessinés par code, pas par un modèle d'images : les nombres de particules,
 * les liaisons et les couleurs sont donc exacts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const W = 960
const H = 600
const FONT = "font-family=\"'DejaVu Sans', 'Segoe UI', Arial, sans-serif\""

/** Code couleur des modèles moléculaires + rayon de van der Waals (Å, pour les tailles relatives). */
const ELEMENTS = {
  H: { name: 'hydrogène', color: 'blanc', light: '#ffffff', dark: '#b9c0ca', stroke: '#8d96a3', r: 1.2 },
  C: { name: 'carbone', color: 'noir', light: '#6b7078', dark: '#16181b', stroke: '#0c0d0f', r: 1.7 },
  N: { name: 'azote', color: 'bleu', light: '#8db3ff', dark: '#1d4fc4', stroke: '#173f9c', r: 1.55 },
  O: { name: 'oxygène', color: 'rouge', light: '#ff9a90', dark: '#c0140a', stroke: '#9a0f07', r: 1.52 },
}

const PROTON = '#e8590c'
const NEUTRON = '#9aa1ab'
const ELECTRON = '#2563eb'

const f = (n) => Math.round(n * 100) / 100

function defs() {
  const grads = Object.entries(ELEMENTS)
    .map(
      ([s, e]) => `<radialGradient id="g${s}" cx="38%" cy="32%" r="75%" fx="32%" fy="26%">
      <stop offset="0" stop-color="${e.light}"/><stop offset="1" stop-color="${e.dark}"/></radialGradient>`,
    )
    .join('')
  return `<defs>${grads}
  <radialGradient id="gProton" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffa571"/><stop offset="1" stop-color="#c2410c"/></radialGradient>
  <radialGradient id="gNeutron" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#d5d9df"/><stop offset="1" stop-color="#6b7280"/></radialGradient>
  <radialGradient id="gElectron" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#7fa8ff"/><stop offset="1" stop-color="#1d4ed8"/></radialGradient>
  <radialGradient id="cloud"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.38"/><stop offset="0.55" stop-color="#3b82f6" stop-opacity="0.2"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
  <linearGradient id="stick" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e5e7eb"/><stop offset="0.5" stop-color="#9ca3af"/><stop offset="1" stop-color="#6b7280"/></linearGradient>
  </defs>`
}

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT}>
${defs()}<rect width="${W}" height="${H}" fill="#fbfcfe"/>
${body}
</svg>`
}

const text = (x, y, s, { size = 24, fill = '#1f2937', anchor = 'middle', weight = 400 } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${s}</text>`

const ball = (cx, cy, r, id, stroke) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="url(#${id})" stroke="${stroke}" stroke-width="1.5"/>`

function particle(cx, cy, r, kind) {
  const id = kind === 'p' ? 'gProton' : kind === 'n' ? 'gNeutron' : 'gElectron'
  const stroke = kind === 'p' ? '#9a3412' : kind === 'n' ? '#4b5563' : '#1e3a8a'
  const mark = kind === 'p' ? '+' : kind === 'e' ? '−' : ''
  return (
    ball(cx, cy, r, id, stroke) +
    (mark ? text(cx, cy + r * 0.42, mark, { size: r * 1.35, fill: '#ffffff', weight: 700 }) : '')
  )
}

/** Pastille de repère (lettre) avec un trait vers la cible. */
function marker(letter, x, y, tx, ty) {
  return `<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="#111827" stroke-width="2.5"/>
  <circle cx="${tx}" cy="${ty}" r="5" fill="#111827"/>
  <circle cx="${x}" cy="${y}" r="24" fill="#ffffff" stroke="#111827" stroke-width="3"/>
  ${text(x, y + 9, letter, { size: 26, weight: 700 })}`
}

function particleLegend(items, y = 556) {
  const labels = { p: ['proton (+)', PROTON], n: ['neutron (neutre)', NEUTRON], e: ['électron (−)', ELECTRON] }
  const widths = items.map((k) => 60 + labels[k][0].length * 12)
  const total = widths.reduce((a, b) => a + b, 0)
  let x = (W - total) / 2
  return items
    .map((k, i) => {
      const out = `<circle cx="${f(x + 14)}" cy="${y - 7}" r="12" fill="${labels[k][1]}"/>${text(x + 36, y, labels[k][0], { size: 22, anchor: 'start' })}`
      x += widths[i]
      return out
    })
    .join('')
}

/* ---------- 1. Atome de carbone : noyau, nuage, électrons ---------- */
function atomeCarbone() {
  const cx = 480
  const cy = 285
  const electrons = [
    [-150, -95], [95, -150], [165, 40], [60, 150], [-110, 120], [-185, -5],
  ]
  // Nucléons : 6 protons + 6 neutrons groupés au centre (taille exagérée, voir légende).
  const kinds = ['p', 'n', 'n', 'p', 'p', 'n', 'p', 'n', 'n', 'p', 'p', 'n']
  const golden = Math.PI * (3 - Math.sqrt(5))
  const parts = kinds
    .map((k, i) => {
      const rad = 25 * Math.sqrt(i + 0.35)
      return particle(cx + rad * Math.cos(i * golden), cy + rad * Math.sin(i * golden), 13, k)
    })
    .join('')
  const dots = electrons.map(([x, y]) => particle(cx + x, cy + y, 14, 'e')).join('')
  return svg(`
  <circle cx="${cx}" cy="${cy}" r="245" fill="url(#cloud)"/>
  ${parts}
  ${dots}
  ${marker('A', 700, 95, cx + 38, cy - 32)}
  ${marker('B', 800, 415, cx + 150, cy + 105)}
  ${particleLegend(['p', 'n', 'e'])}
  ${text(930, 585, 'Schéma sans échelle', { size: 16, fill: '#6b7280', anchor: 'end' })}
  `)
}

/* ---------- 2. Noyau d'azote : 7 protons + 7 neutrons ---------- */
function noyauAzote() {
  const kinds = ['p', 'n', 'n', 'p', 'p', 'n', 'p', 'n', 'n', 'p', 'p', 'n', 'n', 'p']
  const r = 40
  const d = 66
  const golden = Math.PI * (3 - Math.sqrt(5))
  const items = kinds
    .map((k, i) => {
      const rad = d * Math.sqrt(i + 0.35)
      const a = i * golden
      return particle(480 + rad * Math.cos(a), 275 + rad * Math.sin(a), r, k)
    })
    .join('')
  return svg(`${items}${particleLegend(['p', 'n'])}`)
}

/* ---------- 3. Quatre atomes à l'échelle : couleurs et tailles ---------- */
function atomesCouleurs() {
  const s = 56
  const order = [['H', 'A'], ['O', 'B'], ['C', 'C'], ['N', 'D']]
  const gap = 60
  const diam = order.map(([sym]) => 2 * ELEMENTS[sym].r * s)
  const total = diam.reduce((a, b) => a + b, 0) + gap * 3
  let x = (W - total) / 2
  const base = 330
  const out = order
    .map(([sym, letter], i) => {
      const r = ELEMENTS[sym].r * s
      const cx = x + r
      x += 2 * r + gap
      return `${ball(cx, base - r + 40, r, 'g' + sym, ELEMENTS[sym].stroke)}
      <circle cx="${f(cx)}" cy="470" r="26" fill="#ffffff" stroke="#111827" stroke-width="3"/>${text(cx, 480, letter, { size: 28, weight: 700 })}`
    })
    .join('')
  return svg(`${out}${text(480, 56, 'Quatre atomes, modèle compact', { size: 26, weight: 600 })}
  ${text(480, 565, 'La taille de chaque sphère dépend de l’atome.', { size: 20, fill: '#6b7280' })}`)
}

/* ---------- 4. Molécules : modèle compact + modèle éclaté ---------- */
const rotate = ([x, y, z], ay, ax) => {
  const x1 = x * Math.cos(ay) + z * Math.sin(ay)
  const z1 = -x * Math.sin(ay) + z * Math.cos(ay)
  const y2 = y * Math.cos(ax) - z1 * Math.sin(ax)
  const z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
  return [x1, y2, z2]
}

function molecule({ atoms, bonds, ay = 0, ax = 0 }) {
  const pts = atoms.map(([sym, x, y, z = 0]) => ({ sym, p: rotate([x, y, z], ay, ax) }))
  const view = (c, scale) => pts.map((a) => ({ ...a, X: c[0] + a.p[0] * scale, Y: c[1] - a.p[1] * scale, Z: a.p[2] }))

  // Modèle compact (sphères de van der Waals, qui se recouvrent).
  const sc = 68
  const compact = view([240, 290], sc)
    .sort((a, b) => a.Z - b.Z)
    .map((a) => ball(a.X, a.Y, ELEMENTS[a.sym].r * sc, 'g' + a.sym, ELEMENTS[a.sym].stroke))
    .join('')

  // Modèle éclaté (boules + bâtons ; un double trait = une double liaison).
  const se = 138
  const ek = 0.2
  const e = view([720, 290], se)
  const sticks = bonds
    .map(([i, j, order]) => {
      const a = e[i]
      const b = e[j]
      const dx = b.X - a.X
      const dy = b.Y - a.Y
      const len = Math.hypot(dx, dy)
      const ux = dx / len
      const uy = dy / len
      const ra = ELEMENTS[a.sym].r * se * ek * 0.8
      const rb = ELEMENTS[b.sym].r * se * ek * 0.8
      const x1 = a.X + ux * ra
      const y1 = a.Y + uy * ra
      const x2 = b.X - ux * rb
      const y2 = b.Y - uy * rb
      const nx = -uy
      const ny = ux
      const one = (off, w) =>
        `<line x1="${f(x1 + nx * off)}" y1="${f(y1 + ny * off)}" x2="${f(x2 + nx * off)}" y2="${f(y2 + ny * off)}" stroke="#7b8494" stroke-width="${w}" stroke-linecap="round"/>
         <line x1="${f(x1 + nx * off)}" y1="${f(y1 + ny * off - w * 0.18)}" x2="${f(x2 + nx * off)}" y2="${f(y2 + ny * off - w * 0.18)}" stroke="#d1d5db" stroke-width="${w * 0.35}" stroke-linecap="round" opacity="0.8"/>`
      return order === 2 ? one(-9, 9) + one(9, 9) : one(0, 14)
    })
    .join('')
  const balls = [...e]
    .sort((a, b) => a.Z - b.Z)
    .map((a) => ball(a.X, a.Y, ELEMENTS[a.sym].r * se * ek, 'g' + a.sym, ELEMENTS[a.sym].stroke))
    .join('')

  // Légende : couleur, nom et symbole des atomes présents.
  const syms = [...new Set(atoms.map((a) => a[0]))]
  const w = 270
  let lx = (W - w * syms.length) / 2
  const legend = syms
    .map((s) => {
      const out = `${ball(lx + 18, 548, 14, 'g' + s, ELEMENTS[s].stroke)}${text(lx + 42, 556, `${ELEMENTS[s].color} : ${ELEMENTS[s].name} (${s})`, { size: 20, anchor: 'start' })}`
      lx += w
      return out
    })
    .join('')

  return svg(`
  <line x1="480" y1="95" x2="480" y2="500" stroke="#e5e7eb" stroke-width="2"/>
  ${text(240, 62, 'Modèle compact', { size: 26, weight: 600 })}${text(720, 62, 'Modèle éclaté', { size: 26, weight: 600 })}
  ${compact}${sticks}${balls}${legend}`)
}

const tetra = (L, sign) => sign.map(([a, b, c]) => [(a * L) / Math.sqrt(3), (b * L) / Math.sqrt(3), (c * L) / Math.sqrt(3)])

const MOLECULES = {
  molecule_eau: molecule({
    atoms: [['O', 0, -0.2, 0], ['H', -0.757, 0.386, 0], ['H', 0.757, 0.386, 0]],
    bonds: [[0, 1, 1], [0, 2, 1]],
  }),
  molecule_co2: molecule({
    atoms: [['C', 0, 0, 0], ['O', -1.16, 0, 0], ['O', 1.16, 0, 0]],
    bonds: [[0, 1, 2], [0, 2, 2]],
  }),
  molecule_ch4: molecule({
    atoms: [['C', 0, 0, 0], ...tetra(1.09, [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]).map(([x, y, z]) => ['H', x, y, z])],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]],
    ay: 0.25,
    ax: 1.2,
  }),
  molecule_nh3: molecule({
    atoms: [
      ['N', 0, 0.25, 0],
      ...[0, 1, 2].map((k) => ['H', 0.937 * Math.cos((k * 2 * Math.PI) / 3 + 0.3), -0.2, 0.937 * Math.sin((k * 2 * Math.PI) / 3 + 0.3)]),
    ],
    bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]],
    ay: 0.2,
    ax: 1.05,
  }),
  molecule_o2: molecule({
    atoms: [['O', -0.605, 0, 0], ['O', 0.605, 0, 0]],
    bonds: [[0, 1, 2]],
  }),
}

/* ---------- 5. Liaison dans H2 : deux nuages qui se chevauchent ---------- */
function liaisonH2() {
  const y = 300
  const xs = [345, 615]
  const clouds = xs.map((x) => `<circle cx="${x}" cy="${y}" r="200" fill="url(#cloud)"/>`).join('')
  const nuclei = xs.map((x) => particle(x, y, 20, 'p')).join('')
  const shared = particle(470, y - 28, 14, 'e') + particle(490, y + 28, 14, 'e')
  return svg(`${clouds}${nuclei}${shared}${marker('A', 480, 80, 480, y - 55)}
  ${particleLegend(['p', 'e'])}${text(930, 585, 'Schéma sans échelle', { size: 16, fill: '#6b7280', anchor: 'end' })}`)
}

const IMAGES = {
  atome_carbone: atomeCarbone(),
  noyau_azote: noyauAzote(),
  atomes_couleurs: atomesCouleurs(),
  liaison_h2: liaisonH2(),
  ...MOLECULES,
}

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
  console.log(`media/${name}.webp ${bytes.length} octets`)
}
await browser.close()
