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
