/**
 * Calcule l'empreinte des QCM publiés avant l'introduction du champ `fingerprint`.
 * Relit chaque fichier .qcm, recalcule l'empreinte du contenu et l'écrit (sans toucher au reste).
 * Usage : PB_URL=... PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... bun run --filter @qcm/web backfill
 */
import PocketBase from 'pocketbase'
import { qcmFingerprint, readQcmArchive } from '@qcm/core'

const url = process.env.PB_URL ?? 'http://127.0.0.1:8090'
const email = process.env.PB_SUPERUSER_EMAIL
const password = process.env.PB_SUPERUSER_PASSWORD
if (!email || !password) {
  console.error('PB_SUPERUSER_EMAIL et PB_SUPERUSER_PASSWORD sont obligatoires.')
  process.exit(2)
}

const pb = new PocketBase(url)
await pb.collection('_superusers').authWithPassword(email, password)

const records = await pb.collection('qcms').getFullList({ filter: 'fingerprint = ""' })
let done = 0
for (const record of records) {
  try {
    const response = await fetch(pb.files.getURL(record, record.file as string))
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const { data } = readQcmArchive(new Uint8Array(await response.arrayBuffer()))
    await pb.collection('qcms').update(record.id, { fingerprint: qcmFingerprint(data) })
    done += 1
  } catch (error) {
    console.error(`KO ${record.id} (${record.title}) : ${error instanceof Error ? error.message : error}`)
  }
}
console.log(`OK ${done}/${records.length} empreinte(s) calculée(s).`)
