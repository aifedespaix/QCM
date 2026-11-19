/// <reference path="../pb_data/types.d.ts" />

// Jetons d'agent : un membre connecté en crée un depuis le site, le donne à un agent (IA, script)
// qui peut alors publier des QCM sous son nom, sans jamais connaître son compte Google.
// Seul le hachage SHA-256 est conservé (champ caché). La création passe par la route
// POST /api/qcm/agent-tokens (hooks) : aucune règle de création n'est donc ouverte à l'API de collection.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const tokens = new Collection({
    id: "pbcagenttokens01",
    type: "base",
    name: "agent_tokens",
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: null,
    updateRule: null,
    deleteRule: "owner = @request.auth.id",
    fields: [
      { name: "owner", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: "name", type: "text", required: true, min: 1, max: 60, presentable: true },
      { name: "token_hash", type: "text", required: true, hidden: true, pattern: "^[a-f0-9]{64}$" },
      { name: "prefix", type: "text", required: true, max: 12 },
      { name: "expires", type: "date", required: true },
      { name: "last_used", type: "date" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_agent_tokens_hash ON agent_tokens (token_hash)",
      "CREATE INDEX idx_agent_tokens_owner ON agent_tokens (owner)",
    ],
  })
  app.save(tokens)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("agent_tokens"))
})
