/**
 * Schémas du QCM « Les molécules courantes » : SVG (svg/) puis WebP (media/).
 * Usage : node examples/molecules-courantes/build-media.mjs
 * Dessinés par code : les nombres d'atomes, les liaisons et les couleurs sont exacts.
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
  Cl: { name: 'chlore', color: 'vert', light: '#a7ebb4', dark: '#1f9d47', stroke: '#167a37', r: 1.75 },
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

/* ---------- 4. Molécules : modèle compact + modèle éclaté ---------- */
const rotate = ([x, y, z], ay, ax) => {
  const x1 = x * Math.cos(ay) + z * Math.sin(ay)
  const z1 = -x * Math.sin(ay) + z * Math.cos(ay)
  const y2 = y * Math.cos(ax) - z1 * Math.sin(ax)
  const z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
  return [x1, y2, z2]
}

function molecule({ atoms, bonds, ay = 0, ax = 0, sc = 68, se = 138, w = 270 }) {
  const pts = atoms.map(([sym, x, y, z = 0]) => ({ sym, p: rotate([x, y, z], ay, ax) }))
  const view = (c, scale) => pts.map((a) => ({ ...a, X: c[0] + a.p[0] * scale, Y: c[1] - a.p[1] * scale, Z: a.p[2] }))

  // Modèle compact (sphères de van der Waals, qui se recouvrent).
  const compact = view([240, 290], sc)
    .sort((a, b) => a.Z - b.Z)
    .map((a) => ball(a.X, a.Y, ELEMENTS[a.sym].r * sc, 'g' + a.sym, ELEMENTS[a.sym].stroke))
    .join('')

  // Modèle éclaté (boules + bâtons ; un double trait = une double liaison).
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

const unit = ([x, y, z]) => {
  const n = Math.hypot(x, y, z)
  return [x / n, y / n, z / n]
}

/** Butane : chaîne zigzag de 4 carbones, 3 + 2 + 2 + 3 hydrogènes (liaisons C-H de 1,09 Å). */
function butane() {
  const C = [[-1.92, -0.43, 0], [-0.64, 0.43, 0], [0.64, -0.43, 0], [1.92, 0.43, 0]]
  const atoms = C.map((p) => ['C', ...p])
  const bonds = [[0, 1, 1], [1, 2, 1], [2, 3, 1]]
  const L = 1.09
  const add = (ci, dir) => {
    const c = C[ci]
    atoms.push(['H', c[0] + dir[0] * L, c[1] + dir[1] * L, c[2] + dir[2] * L])
    bonds.push([ci, atoms.length - 1, 1])
  }
  const toward = (a, b) => unit([b[0] - a[0], b[1] - a[1], 0])
  C.forEach((c, i) => {
    const nb = [i - 1, i + 1].filter((j) => j >= 0 && j < 4).map((j) => toward(c, C[j]))
    if (nb.length === 2) {
      const bis = unit([-(nb[0][0] + nb[1][0]), -(nb[0][1] + nb[1][1]), 0])
      const cs = Math.cos((54.75 * Math.PI) / 180)
      const sn = Math.sin((54.75 * Math.PI) / 180)
      add(i, [bis[0] * cs, bis[1] * cs, sn])
      add(i, [bis[0] * cs, bis[1] * cs, -sn])
    } else {
      const u = nb[0]
      const v = [-u[1], u[0], 0]
      const ct = Math.cos((109.5 * Math.PI) / 180)
      const st = Math.sin((109.5 * Math.PI) / 180)
      for (const phi of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) {
        const cp = Math.cos(phi)
        const sp = Math.sin(phi)
        add(i, [u[0] * ct + st * cp * v[0], u[1] * ct + st * cp * v[1], st * sp])
      }
    }
  })
  return { atoms, bonds }
}

const IMAGES = {
  molecule_cl2: molecule({ atoms: [['Cl', -1, 0, 0], ['Cl', 1, 0, 0]], bonds: [[0, 1, 1]], sc: 62 }),
  molecule_n2o: molecule({
    atoms: [['N', -1.15, 0, 0], ['N', 0, 0, 0], ['O', 1.19, 0, 0]],
    bonds: [[0, 1, 2], [1, 2, 2]],
    sc: 60,
    se: 120,
    w: 240,
  }),
  molecule_butane: molecule({ ...butane(), ay: 0, ax: 0.35, sc: 46, se: 66, w: 270 }),
}

for (const name of Object.keys(IMAGES)) {
  mkdirSync(join(here, 'svg'), { recursive: true })
  mkdirSync(join(here, 'media'), { recursive: true })
  writeFileSync(join(here, 'svg', `${name}.svg`), IMAGES[name])
}
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
