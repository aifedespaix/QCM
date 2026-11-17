/// <reference path="../pb_data/types.d.ts" />

// Empreinte du contenu publié (`qcmFingerprint` de @qcm/core, 22 caractères a-z 0-9).
// Le lecteur desktop s'en sert pour relier un fichier ouvert à son QCM de la bibliothèque
// et pour savoir si la version qu'il garde est encore la version en ligne. Facultative :
// les QCM publiés avant cette migration n'en ont pas (script de rattrapage : `bun run --filter @qcm/web backfill`).
migrate((app) => {
  const qcms = app.findCollectionByNameOrId("qcms")
  qcms.fields.add(new TextField({ name: "fingerprint", pattern: "^[a-z0-9]{22}$" }))
  qcms.indexes.push("CREATE INDEX idx_qcms_fingerprint ON qcms (fingerprint)")
  app.save(qcms)
}, (app) => {
  const qcms = app.findCollectionByNameOrId("qcms")
  qcms.indexes = qcms.indexes.filter((index) => !index.includes("idx_qcms_fingerprint"))
  qcms.fields.removeByName("fingerprint")
  app.save(qcms)
})
