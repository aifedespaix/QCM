/// <reference path="../pb_data/types.d.ts" />

// Nombre de commentaires visibles d'un QCM, tenu à jour par les hooks (comme la note moyenne) :
// la bibliothèque l'affiche sur chaque carte sans une requête de plus par QCM.
// Imposé par le serveur : un auteur ne peut ni le fixer à la création ni le modifier.
migrate((app) => {
  const qcms = app.findCollectionByNameOrId("qcms")
  qcms.fields.add(new NumberField({ name: "comment_count", min: 0, onlyInt: true }))
  qcms.createRule = qcms.createRule + " && @request.body.comment_count:isset = false"
  qcms.updateRule = qcms.updateRule.replace(
    "@request.body.rating_count:changed = false)",
    "@request.body.rating_count:changed = false && @request.body.comment_count:changed = false)",
  )
  app.save(qcms)

  // Rattrapage : compte les commentaires visibles déjà publiés.
  app.db()
    .newQuery("UPDATE qcms SET comment_count = (SELECT COUNT(*) FROM comments WHERE comments.qcm = qcms.id AND comments.hidden = FALSE)")
    .execute()
}, (app) => {
  const qcms = app.findCollectionByNameOrId("qcms")
  qcms.createRule = qcms.createRule.replace(" && @request.body.comment_count:isset = false", "")
  qcms.updateRule = qcms.updateRule.replace(" && @request.body.comment_count:changed = false", "")
  qcms.fields.removeByName("comment_count")
  app.save(qcms)
})
