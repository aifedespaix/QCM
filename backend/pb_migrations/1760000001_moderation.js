/// <reference path="../pb_data/types.d.ts" />

// Modération : un QCM publié par un membre est « pending » jusqu'à validation par un administrateur.
// Administrateur = utilisateur dont le champ `admin` vaut true (posé par le hook de connexion
// quand l'e-mail du compte Google est celui de PB_SUPERUSER_EMAIL).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "admin" }))
  users.createRule = '@request.body.admin:isset = false'
  users.updateRule = 'id = @request.auth.id && @request.body.admin:isset = false'
  app.save(users)

  const qcms = app.findCollectionByNameOrId("qcms")
  qcms.fields.getByName("status").values = ["pending", "published", "hidden"]
  qcms.listRule = 'status = "published" || owner = @request.auth.id || @request.auth.admin = true'
  qcms.viewRule = 'status = "published" || owner = @request.auth.id || @request.auth.admin = true'
  qcms.updateRule = '(owner = @request.auth.id && @request.body.owner:changed = false && @request.body.status:changed = false && @request.body.rating_avg:changed = false && @request.body.rating_count:changed = false) || @request.auth.admin = true'
  qcms.deleteRule = 'owner = @request.auth.id || @request.auth.admin = true'
  app.save(qcms)
}, (app) => {
  const qcms = app.findCollectionByNameOrId("qcms")
  qcms.fields.getByName("status").values = ["published", "hidden"]
  qcms.listRule = 'status = "published" || owner = @request.auth.id'
  qcms.viewRule = 'status = "published" || owner = @request.auth.id'
  qcms.updateRule = 'owner = @request.auth.id && @request.body.owner:changed = false && @request.body.status:changed = false && @request.body.rating_avg:changed = false && @request.body.rating_count:changed = false'
  qcms.deleteRule = "owner = @request.auth.id"
  app.save(qcms)

  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("admin")
  users.createRule = ""
  users.updateRule = "id = @request.auth.id"
  app.save(users)
})
