/// <reference path="../pb_data/types.d.ts" />

// Schéma initial QCM : complète `users` et crée `qcms`, `ratings`, `comments`.
// Appliqué automatiquement au démarrage de `pocketbase serve`.
migrate((app) => {
  const SUBJECTS = ["maths", "francais", "histoire-geo", "svt", "physique-chimie", "technologie", "anglais", "espagnol", "allemand", "emc", "arts", "musique", "autre"]
  const LEVELS = ["primaire", "6e", "5e", "4e", "3e", "lycee", "autre"]

  // --- users : connexion Google uniquement, profil public limité au nom et à l'avatar ---
  const users = app.findCollectionByNameOrId("users")
  unmarshal({
    listRule: "id = @request.auth.id",
    viewRule: "",
    createRule: "",
    updateRule: "id = @request.auth.id",
    deleteRule: "id = @request.auth.id",
    passwordAuth: { enabled: false },
    otp: { enabled: false },
    oauth2: {
      enabled: true,
      mappedFields: { name: "name", avatarURL: "avatar" },
    },
  }, users)
  app.save(users)

  // --- qcms : un fichier .qcm publié + ses métadonnées pour la recherche ---
  const qcms = new Collection({
    id: "pbcqcms00000001",
    type: "base",
    name: "qcms",
    listRule: 'status = "published" || owner = @request.auth.id',
    viewRule: 'status = "published" || owner = @request.auth.id',
    createRule: '@request.auth.id != "" && owner = @request.auth.id && @request.body.status:isset = false && @request.body.rating_avg:isset = false && @request.body.rating_count:isset = false',
    updateRule: 'owner = @request.auth.id && @request.body.owner:changed = false && @request.body.status:changed = false && @request.body.rating_avg:changed = false && @request.body.rating_count:changed = false',
    deleteRule: "owner = @request.auth.id",
    fields: [
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "title", type: "text", required: true, min: 1, max: 80, presentable: true },
      { name: "description", type: "text", max: 300 },
      { name: "subject", type: "select", required: true, maxSelect: 1, values: SUBJECTS },
      { name: "level", type: "select", required: true, maxSelect: 1, values: LEVELS },
      { name: "chapter", type: "text", required: true, min: 1, max: 80 },
      { name: "language", type: "text", required: true, pattern: "^[a-z]{2}$" },
      { name: "question_count", type: "number", required: true, min: 1, max: 60, onlyInt: true },
      { name: "has_images", type: "bool" },
      { name: "file", type: "file", required: true, maxSelect: 1, maxSize: 20971520, mimeTypes: ["application/zip"] },
      { name: "thumbnail", type: "file", maxSelect: 1, maxSize: 3145728, mimeTypes: ["image/webp"], thumbs: ["480x270"] },
      { name: "status", type: "select", maxSelect: 1, values: ["published", "hidden"] },
      { name: "rating_avg", type: "number", min: 0, max: 5 },
      { name: "rating_count", type: "number", min: 0, onlyInt: true },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_qcms_browse ON qcms (status, subject, level)",
      "CREATE INDEX idx_qcms_owner ON qcms (owner)",
      "CREATE INDEX idx_qcms_created ON qcms (created)",
    ],
  })
  app.save(qcms)

  // --- ratings : une note de 1 à 5 par utilisateur et par QCM ---
  const ratings = new Collection({
    id: "pbcratings00001",
    type: "base",
    name: "ratings",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: '@request.auth.id != "" && user = @request.auth.id && qcm.status = "published"',
    updateRule: "user = @request.auth.id && @request.body.user:changed = false && @request.body.qcm:changed = false",
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "qcm", type: "relation", required: true, maxSelect: 1, collectionId: qcms.id, cascadeDelete: true },
      { name: "user", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "value", type: "number", required: true, min: 1, max: 5, onlyInt: true },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_ratings_unique ON ratings (qcm, user)"],
  })
  app.save(ratings)

  // --- comments : texte court, masquable par un administrateur ---
  const comments = new Collection({
    id: "pbccomments0001",
    type: "base",
    name: "comments",
    listRule: "hidden = false || user = @request.auth.id",
    viewRule: "hidden = false || user = @request.auth.id",
    createRule: '@request.auth.id != "" && user = @request.auth.id && qcm.status = "published" && @request.body.hidden:isset = false',
    updateRule: "user = @request.auth.id && @request.body.user:changed = false && @request.body.qcm:changed = false && @request.body.hidden:changed = false",
    deleteRule: "user = @request.auth.id",
    fields: [
      { name: "qcm", type: "relation", required: true, maxSelect: 1, collectionId: qcms.id, cascadeDelete: true },
      { name: "user", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "text", type: "text", required: true, min: 1, max: 500 },
      { name: "hidden", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_comments_qcm ON comments (qcm, created)"],
  })
  app.save(comments)
}, (app) => {
  for (const name of ["comments", "ratings", "qcms"]) {
    app.delete(app.findCollectionByNameOrId(name))
  }
})
