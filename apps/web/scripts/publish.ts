/**
 * Publie un dossier QCM (data.yaml + media/*.webp) avec un jeton d'agent.
 * Le jeton se crée sur le site (page /agent) ; le QCM est publié au nom de son titulaire,
 * avec les mêmes règles qu'une publication faite depuis l'éditeur (relecture avant mise en ligne).
 * Usage : QCM_SITE_URL=https://… QCM_AGENT_TOKEN=qcm_… bun run --filter @qcm/web publish-qcm <dossier>
 * (dossier relatif à la racine du dépôt). `QCM_PB_URL` remplace `QCM_SITE_URL` si l'API est sur un autre domaine.
 */
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QcmFormatError, parseQcmYaml, qcmFileName, qcmFingerprint, summarizeQcm, writeQcmArchive } from '@qcm/core'

const folder = process.argv[2]
const base = (process.env.QCM_PB_URL ?? process.env.QCM_SITE_URL ?? '').replace(/\/+$/, '')
const token = process.env.QCM_AGENT_TOKEN
if (!folder || !base || !token) {
  console.error('Usage : QCM_SITE_URL et QCM_AGENT_TOKEN requis, puis le dossier du QCM en argument.')
  process.exit(2)
}

try {
  const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)), folder)
  const data = parseQcmYaml(await Bun.file(join(root, 'data.yaml')).text())
  const media = new Map<string, Uint8Array>()
  for (const name of await readdir(join(root, 'media')).catch(() => [] as string[])) {
    media.set(`media/${name}`, new Uint8Array(await Bun.file(join(root, 'media', name)).arrayBuffer()))
  }
  const summary = summarizeQcm(data)
  const bytes = writeQcmArchive({ data, media })

  const form = new FormData()
  form.set('title', data.meta.title)
  form.set('description', data.meta.description ?? '')
  form.set('subject', data.meta.subject)
  form.set('level', data.meta.level)
  form.set('chapter', data.meta.chapter)
  form.set('language', data.meta.language)
  form.set('question_count', String(summary.questionCount))
  form.set('has_images', String(summary.hasImages))
  form.set('fingerprint', qcmFingerprint(data))
  form.set('file', new File([bytes.slice().buffer], qcmFileName(data.meta.title), { type: 'application/zip' }))

  const response = await fetch(`${base}/api/qcm/agent-publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const body = (await response.json().catch(() => ({}))) as { id?: string; status?: string; created?: boolean; message?: string }
  if (!response.ok) {
    console.error(`Refusé (${response.status}) : ${body.message ?? 'erreur inconnue'}`)
    process.exit(1)
  }
  const state = body.status === 'published' ? 'publié, visible dans la bibliothèque' : 'envoyé, en attente de relecture'
  console.log(`OK ${body.created ? 'créé' : 'mis à jour'} : ${body.id} (${data.meta.title}, ${summary.questionCount} questions, ${summary.imagePaths.length} image(s)) ${state}`)
} catch (error) {
  if (error instanceof QcmFormatError) {
    console.error(`${error.code} ${error.message}`)
    for (const detail of error.details) console.error(`  - ${detail}`)
    process.exit(1)
  }
  throw error
}
