/**
 * Publie un dossier QCM (data.yaml + media/*.webp) dans PocketBase, comme administrateur.
 * Usage : PB_URL=https://api... PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... bun run --filter @qcm/web publish-qcm <dossier>   (dossier relatif à la racine du dépôt)
 * Un QCM déjà publié sous le même titre par le même propriétaire est mis à jour, pas dupliqué.
 */
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import PocketBase from 'pocketbase'
import { parseQcmYaml, qcmFileName, qcmFingerprint, summarizeQcm, writeQcmArchive } from '@qcm/core'

const folder = process.argv[2]
const url = process.env.PB_URL
const email = process.env.PB_SUPERUSER_EMAIL
const password = process.env.PB_SUPERUSER_PASSWORD
if (!folder || !url || !email || !password) {
  console.error('Usage : PB_URL, PB_SUPERUSER_EMAIL et PB_SUPERUSER_PASSWORD requis, puis le dossier du QCM en argument.')
  process.exit(2)
}

// Chemin relatif : à partir de la racine du dépôt.
const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)), folder)
const data = parseQcmYaml(await Bun.file(join(root, 'data.yaml')).text())
const media = new Map<string, Uint8Array>()
for (const name of await readdir(join(root, 'media')).catch(() => [] as string[])) {
  media.set(`media/${name}`, new Uint8Array(await Bun.file(join(root, 'media', name)).arrayBuffer()))
}
const summary = summarizeQcm(data)
const bytes = writeQcmArchive({ data, media })

const pb = new PocketBase(url)
await pb.collection('_superusers').authWithPassword(email, password)

// Propriétaire : le compte « Équipe QCM » (créé au besoin), comme pour le QCM d'exemple.
const ownerEmail = 'equipe@qcm.local'
const found = await pb.collection('users').getList(1, 1, { filter: pb.filter('email = {:email}', { email: ownerEmail }) })
let ownerId = found.items[0]?.id
if (!ownerId) {
  const secret = crypto.randomUUID()
  ownerId = (
    await pb.collection('users').create({ email: ownerEmail, password: secret, passwordConfirm: secret, name: 'Équipe QCM', verified: true })
  ).id
}

const form = new FormData()
form.set('owner', ownerId)
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

const existing = await pb.collection('qcms').getList(1, 1, {
  filter: pb.filter('owner = {:owner} && title = {:title}', { owner: ownerId, title: data.meta.title }),
})
const record = existing.items[0] ? await pb.collection('qcms').update(existing.items[0].id, form) : await pb.collection('qcms').create(form)
console.log(`OK ${existing.items[0] ? 'mis à jour' : 'publié'} : ${record.id} (${data.meta.title}, ${summary.questionCount} questions, ${summary.imagePaths.length} image(s))`)
