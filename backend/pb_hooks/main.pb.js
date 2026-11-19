/// <reference path="../pb_data/types.d.ts" />

// Chaque handler s'exécute dans un contexte isolé : aucune variable globale partagée,
// le code commun est donc répété à l'intérieur de chaque handler.

// 1. Au démarrage : branche le fournisseur Google à partir des variables d'environnement.
onBootstrap((e) => {
  e.next()

  const clientId = $os.getenv("GOOGLE_CLIENT_ID")
  const clientSecret = $os.getenv("GOOGLE_CLIENT_SECRET")
  if (!clientId || !clientSecret) {
    console.log("[qcm] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET absents : connexion Google inactive.")
    return
  }
  const users = e.app.findCollectionByNameOrId("users")
  unmarshal({
    oauth2: {
      enabled: true,
      mappedFields: { name: "name", avatarURL: "avatar" },
      providers: [{ name: "google", clientId: clientId, clientSecret: clientSecret }],
    },
  }, users)
  e.app.save(users)
})

// 2. Création d'un QCM : compteurs imposés par le serveur ; statut « pending » (à valider),
//    sauf pour un administrateur dont les QCM sont publiés directement.
onRecordCreateRequest((e) => {
  const isAdmin = e.hasSuperuserAuth() || (e.auth && e.auth.get("admin") === true)
  e.record.set("status", isAdmin ? "published" : "pending")
  e.record.set("rating_avg", 0)
  e.record.set("rating_count", 0)
  e.next()
}, "qcms")

// 2 ter. Modification d'un QCM par son auteur : il repasse « pending » et doit être revalidé
//    avant de redevenir public. Un administrateur garde la main sur le statut.
onRecordUpdateRequest((e) => {
  const isAdmin = e.hasSuperuserAuth() || (e.auth && e.auth.get("admin") === true)
  if (!isAdmin) e.record.set("status", "pending")
  e.next()
}, "qcms")

// 2 bis. À chaque connexion : le compte dont l'e-mail est PB_SUPERUSER_EMAIL devient administrateur.
onRecordAuthRequest((e) => {
  const adminEmail = ($os.getenv("PB_SUPERUSER_EMAIL") || "").trim().toLowerCase()
  const email = String(e.record.get("email") || "").trim().toLowerCase()
  const shouldBeAdmin = adminEmail !== "" && email === adminEmail
  if (e.record.get("admin") !== shouldBeAdmin) {
    e.record.set("admin", shouldBeAdmin)
    e.app.save(e.record)
  }
  e.next()
}, "users")

// 3. Après chaque note créée, modifiée ou supprimée : recalcule la moyenne du QCM.
onRecordAfterCreateSuccess((e) => {
  const qcmId = e.record.get("qcm")
  const stats = new DynamicModel({ average: 0, total: 0 })
  e.app.db()
    .newQuery("SELECT COALESCE(AVG(value), 0) AS average, COUNT(*) AS total FROM ratings WHERE qcm = {:qcm}")
    .bind({ qcm: qcmId })
    .one(stats)
  e.app.db()
    .newQuery("UPDATE qcms SET rating_avg = {:average}, rating_count = {:total} WHERE id = {:qcm}")
    .bind({ average: Math.round(stats.average * 10) / 10, total: stats.total, qcm: qcmId })
    .execute()
  e.next()
}, "ratings")

onRecordAfterUpdateSuccess((e) => {
  const qcmId = e.record.get("qcm")
  const stats = new DynamicModel({ average: 0, total: 0 })
  e.app.db()
    .newQuery("SELECT COALESCE(AVG(value), 0) AS average, COUNT(*) AS total FROM ratings WHERE qcm = {:qcm}")
    .bind({ qcm: qcmId })
    .one(stats)
  e.app.db()
    .newQuery("UPDATE qcms SET rating_avg = {:average}, rating_count = {:total} WHERE id = {:qcm}")
    .bind({ average: Math.round(stats.average * 10) / 10, total: stats.total, qcm: qcmId })
    .execute()
  e.next()
}, "ratings")

onRecordAfterDeleteSuccess((e) => {
  const qcmId = e.record.get("qcm")
  const stats = new DynamicModel({ average: 0, total: 0 })
  e.app.db()
    .newQuery("SELECT COALESCE(AVG(value), 0) AS average, COUNT(*) AS total FROM ratings WHERE qcm = {:qcm}")
    .bind({ qcm: qcmId })
    .one(stats)
  e.app.db()
    .newQuery("UPDATE qcms SET rating_avg = {:average}, rating_count = {:total} WHERE id = {:qcm}")
    .bind({ average: Math.round(stats.average * 10) / 10, total: stats.total, qcm: qcmId })
    .execute()
  e.next()
}, "ratings")

// 5. Jetons d'agent. Un membre connecté crée un jeton (affiché une seule fois) ; seul son hachage est stocké.
//    Les jetons se listent et se révoquent par l'API de collection `agent_tokens` (règle : `owner = @request.auth.id`).
routerAdd("POST", "/api/qcm/agent-tokens", (e) => {
  const body = new DynamicModel({ name: "", days: 30 })
  e.bindBody(body)
  const name = String(body.name || "").trim()
  const days = Number(body.days)
  if (name.length < 1 || name.length > 60) throw new BadRequestError("Le nom doit faire de 1 à 60 caractères.")
  if (![7, 30, 90].includes(days)) throw new BadRequestError("La durée doit être de 7, 30 ou 90 jours.")

  const owner = e.auth
  const count = $app.countRecords("agent_tokens", $dbx.hashExp({ owner: owner.id }))
  if (count >= 10) throw new BadRequestError("Dix jetons au maximum : révoque-en un avant d'en créer un autre.")

  const token = "qcm_" + $security.randomString(40)
  const expires = new Date(Date.now() + days * 86400000).toISOString().replace("T", " ")
  const record = new Record($app.findCollectionByNameOrId("agent_tokens"))
  record.set("owner", owner.id)
  record.set("name", name)
  record.set("token_hash", $security.sha256(token))
  record.set("prefix", token.slice(0, 8))
  record.set("expires", expires)
  $app.save(record)

  return e.json(200, { id: record.id, token: token, expires: expires })
}, $apis.requireAuth("users"))

// 6. Publication par un agent : `Authorization: Bearer qcm_…` + les mêmes champs que l'éditeur du site.
//    Le QCM appartient au titulaire du jeton ; il suit les mêmes règles qu'une publication faite sur le site
//    (« à valider », sauf pour un administrateur). Un QCM du même titulaire et du même titre est mis à jour.
routerAdd("POST", "/api/qcm/agent-publish", (e) => {
  const header = e.request.header.get("Authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!token.startsWith("qcm_")) throw new UnauthorizedError("Jeton manquant ou invalide.")

  let grant
  try {
    grant = $app.findFirstRecordByData("agent_tokens", "token_hash", $security.sha256(token))
  } catch (_) {
    throw new UnauthorizedError("Jeton manquant ou invalide.")
  }
  if (grant.getDateTime("expires").time().unix() * 1000 < Date.now()) throw new UnauthorizedError("Ce jeton a expiré.")

  const owner = $app.findRecordById("users", grant.get("owner"))
  const isAdmin = owner.get("admin") === true
  const title = String(e.request.formValue("title") || "").trim()
  if (title === "") throw new BadRequestError("Le titre est obligatoire.")

  // findUploadedFiles échoue quand le champ est absent : on le traite comme « aucun fichier ».
  const upload = (key) => {
    try { return e.findUploadedFiles(key) } catch (_) { return [] }
  }
  const files = upload("file")
  const thumbs = upload("thumbnail")

  let record
  let created = false
  try {
    record = $app.findFirstRecordByFilter("qcms", "owner = {:owner} && title = {:title}", { owner: owner.id, title: title })
  } catch (_) {
    created = true
    record = new Record($app.findCollectionByNameOrId("qcms"))
    record.set("owner", owner.id)
    record.set("rating_avg", 0)
    record.set("rating_count", 0)
    if (files.length === 0) throw new BadRequestError("Le fichier .qcm est obligatoire.")
  }
  const fields = ["title", "description", "subject", "level", "chapter", "language", "question_count", "has_images", "fingerprint"]
  for (const field of fields) {
    const value = e.request.formValue(field)
    if (value !== "" || field === "description") record.set(field, value)
  }
  if (files.length > 0) record.set("file", files[0])
  if (thumbs.length > 0) record.set("thumbnail", thumbs[0])
  if (created || !isAdmin) record.set("status", isAdmin ? "published" : "pending")

  try {
    $app.save(record)
  } catch (err) {
    throw new BadRequestError("QCM refusé : " + String(err))
  }

  grant.set("last_used", new Date().toISOString().replace("T", " "))
  $app.save(grant)

  return e.json(created ? 201 : 200, { id: record.id, status: record.get("status"), created: created })
})
