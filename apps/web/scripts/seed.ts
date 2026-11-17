/**
 * Publie le QCM d'exemple dans une instance PocketBase (développement uniquement).
 * Usage : PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... bun run --filter @qcm/web seed
 */
import PocketBase from 'pocketbase'
import { parseQcmYaml, qcmFileName, qcmFingerprint, summarizeQcm, writeQcmArchive } from '@qcm/core'

const url = process.env.PB_URL ?? 'http://127.0.0.1:8090'
const email = process.env.PB_SUPERUSER_EMAIL
const password = process.env.PB_SUPERUSER_PASSWORD
if (!email || !password) {
  console.error('PB_SUPERUSER_EMAIL et PB_SUPERUSER_PASSWORD sont obligatoires.')
  process.exit(2)
}

const pb = new PocketBase(url)
await pb.collection('_superusers').authWithPassword(email, password)

// Utilisateur de démonstration, propriétaire du QCM d'exemple.
const demoEmail = 'demo@qcm.local'
const found = await pb.collection('users').getList(1, 1, { filter: pb.filter('email = {:email}', { email: demoEmail }) })
let ownerId = found.items[0]?.id
if (!ownerId) {
  const secret = crypto.randomUUID()
  const created = await pb.collection('users').create({
    email: demoEmail,
    password: secret,
    passwordConfirm: secret,
    name: 'Équipe QCM',
    verified: true,
  })
  ownerId = created.id
}

const yaml = await Bun.file(new URL('../../../examples/fractions/data.yaml', import.meta.url)).text()
const data = parseQcmYaml(yaml)
const summary = summarizeQcm(data)
const bytes = writeQcmArchive({ data })

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

const record = await pb.collection('qcms').create(form)
console.log(`OK QCM publié : ${record.id} (${data.meta.title})`)
