/**
 * Emballe un dossier (data.yaml + media/*.webp) en fichier .qcm.
 * Usage : bun run pack <dossier> [sortie.qcm]
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { QcmFormatError, parseQcmYaml, qcmFileName, writeQcmArchive } from '../src/index.ts'

const [folder, output] = process.argv.slice(2)
if (!folder) {
  console.error('Usage : bun run pack <dossier> [sortie.qcm]')
  process.exit(2)
}

try {
  const data = parseQcmYaml(await Bun.file(join(folder, 'data.yaml')).text())
  const media = new Map<string, Uint8Array>()
  const names = await readdir(join(folder, 'media')).catch(() => [] as string[])
  for (const name of names) {
    media.set(`media/${name}`, new Uint8Array(await Bun.file(join(folder, 'media', name)).arrayBuffer()))
  }
  const target = output ?? join(folder, qcmFileName(data.meta.title))
  await Bun.write(target, writeQcmArchive({ data, media }))
  console.log(`OK ${target} (${data.questions.length} questions, ${media.size} image(s))`)
} catch (error) {
  if (error instanceof QcmFormatError) {
    console.error(`${error.code} ${error.message}`)
    for (const detail of error.details) console.error(`  - ${detail}`)
    process.exit(1)
  }
  throw error
}
