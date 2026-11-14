# TASKS.md — Plan d'exécution QCM

Cinq tâches, à faire dans l'ordre. Tout le code est déjà écrit dans `ARCHITECTURE.md` : chaque titre `#### \`chemin\`` y désigne un fichier, et le bloc de code qui suit est son contenu complet. Une tâche consiste à créer ces fichiers à l'identique, puis à faire passer les commandes de validation.

Règle commune : toutes les commandes se lancent depuis la racine du dépôt, sauf mention contraire. Une commande « doit retourner 0 » = code de sortie 0, sans erreur.

---

- [ ] **Tâche 1 : Initialisation Monorepo & Package `@qcm/core`**

  - **Dépendances :** aucune.
  - **Sections `ARCHITECTURE.md` à copier/appliquer :** §1.2 (fichiers racine), §2.3 (fichiers `@qcm/core`), §6 (skill IA).
  - **Périmètre de fichiers :**
    - `package.json`, `tsconfig.base.json`, `.gitignore`
    - `examples/fractions/data.yaml`
    - `packages/core/package.json`, `packages/core/tsconfig.json`
    - `packages/core/src/schema.ts`, `errors.ts`, `archive.ts`, `webp.ts`, `index.ts`
    - `packages/core/scripts/pack.ts`
    - `packages/core/test/core.test.ts`
    - `docs/skill-ingestion-cours.md`
    - `examples/fractions/les-fractions-comparer-et-simplifier.qcm` (généré)
    - `bun.lock` (généré)
  - **Instructions d'assemblage rapide :**
    1. Créer chaque fichier du périmètre avec le contenu exact de son bloc dans `ARCHITECTURE.md`.
    2. Le fichier racine `package.json` déclare les workspaces `packages/*` et `apps/*` : les dossiers `apps/` n'existent pas encore, c'est normal.
    3. Ne rien ajouter : pas de README de package, pas de script de build (les packages sont consommés en source).
  - **Commandes de validation obligatoires :**
    ```bash
    bun install
    bun test packages/core
    bun run --filter @qcm/core typecheck
    bun run pack examples/fractions
    ```
    Attendu : 14 tests réussis ; la dernière commande affiche `OK examples/fractions/les-fractions-comparer-et-simplifier.qcm (5 questions, 0 image(s))`. Ce fichier d'exemple est conservé dans le dépôt.

---

- [ ] **Tâche 2 : Design System `@qcm/ui` & Moteur Audio**

  - **Dépendances :** Tâche 1 `[x]`.
  - **Sections `ARCHITECTURE.md` à copier/appliquer :** §0.4 (règles UX), §3.1, §3.2, §3.3.
  - **Périmètre de fichiers :**
    - `packages/ui/package.json`, `packages/ui/tsconfig.json`
    - `packages/ui/src/index.ts`
    - `packages/ui/src/styles/theme.css`
    - `packages/ui/src/composables/useQcmSound.ts`, `useQcmTheme.ts`, `useQcmPlayer.ts`
    - `packages/ui/src/components/QcmIntroCard.vue`, `QcmQuestionCard.vue`, `QcmChoiceGrid.vue`, `QcmFeedbackBanner.vue`, `QcmCompletionScreen.vue`, `QcmPlayer.vue`, `QcmSoundToggle.vue`, `QcmThemeToggle.vue`
    - `packages/ui/test/player.test.ts`
    - `bun.lock` (mis à jour)
  - **Instructions d'assemblage rapide :**
    1. Créer chaque fichier du périmètre avec le contenu exact de son bloc dans `ARCHITECTURE.md` §3.3.
    2. Ne pas créer de fichier `.mp3`, `.wav` ou `.ogg` : tous les sons viennent de `useQcmSound.ts`.
    3. Ne pas ajouter de couleur hors des jetons de `theme.css`. Ne pas utiliser `#fff`, `#000`, `white`, `black`, ni aucune classe Tailwind `red-*`.
    4. Le rendu visuel sera contrôlé à la Tâche 3 (desktop) et à la Tâche 5 (web) : ce package n'a pas de serveur de démonstration.
  - **Commandes de validation obligatoires :**
    ```bash
    bun install
    bun test
    bun run --filter @qcm/ui typecheck
    ```
    Attendu : 16 tests réussis (14 `core` + 2 `ui`).

---

- [ ] **Tâche 3 : Application Desktop `apps/desktop` (Tauri 2 Windows 11)**

  - **Dépendances :** Tâches 1 et 2 `[x]`.
  - **Sections `ARCHITECTURE.md` à copier/appliquer :** §4.1, §4.2, §4.3, §4.4.
  - **Périmètre de fichiers :**
    - `apps/desktop/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `app-icon.svg`
    - `apps/desktop/src/main.ts`, `style.css`, `App.vue`
    - `apps/desktop/src/lib/qcmFile.ts`
    - `apps/desktop/src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`
    - `apps/desktop/src-tauri/capabilities/default.json`
    - `apps/desktop/src-tauri/src/main.rs`, `lib.rs`
    - `apps/desktop/src-tauri/icons/*` (généré), `apps/desktop/src-tauri/Cargo.lock` (généré)
    - `.github/workflows/release-desktop.yml`
    - `bun.lock` (mis à jour)
  - **Instructions d'assemblage rapide :**
    1. Créer chaque fichier du périmètre avec le contenu exact de son bloc dans `ARCHITECTURE.md` §4.2, §4.3 et §4.4.
    2. `bun install`, puis depuis `apps/desktop` : `bun run tauri icon app-icon.svg`. Supprimer `src-tauri/icons/android` et `src-tauri/icons/ios`.
    3. Sous Linux, installer d'abord les paquets système listés en §4.4.
    4. Ne pas ajouter `serde_yaml` ni aucun autre crate : Rust ne lit pas le YAML (§0.1).
    5. Dans `lib.rs`, `tauri_plugin_single_instance` doit rester le premier `.plugin(...)`.
    6. Si la machine est sous Windows 11 : lancer aussi `bun run build:desktop`, installer le `.exe` produit et faire les 3 vérifications manuelles de la fin de §4.4. Sinon, l'écrire dans le rapport : « installateur Windows non vérifié ».
  - **Commandes de validation obligatoires :**
    ```bash
    bun install
    bun run --filter @qcm/desktop typecheck
    bun run --filter @qcm/desktop build
    cd apps/desktop/src-tauri && cargo check && cargo test && cargo clippy --all-targets -- -D warnings
    ```
    Attendu : 5 tests Rust réussis, 0 avertissement clippy, dossier `apps/desktop/dist/` créé.

---

- [ ] **Tâche 4 : Backend PocketBase & Docker Dokploy**

  - **Dépendances :** Tâche 1 `[x]`.
  - **Sections `ARCHITECTURE.md` à copier/appliquer :** §5.1, §5.2, §5.3.
  - **Périmètre de fichiers :**
    - `backend/Dockerfile`, `backend/entrypoint.sh`, `backend/.env.example`
    - `backend/pb_migrations/1760000000_init_qcm.js`
    - `backend/pb_hooks/main.pb.js`
    - `backend/pb_schema.json`
    - `backend/scripts/export-schema.sh`
    - `docker-compose.yml`
  - **Instructions d'assemblage rapide :**
    1. Créer chaque fichier du périmètre avec le contenu exact de son bloc dans `ARCHITECTURE.md` §5.2.
    2. Cette section est la seule de `ARCHITECTURE.md` qui n'a pas été exécutée avant rédaction (§0.3). La validation ci-dessous est donc le premier démarrage réel.
    3. Si PocketBase affiche une erreur au démarrage dans la migration ou dans un hook : corriger uniquement l'instruction fautive d'après le message d'erreur. Ne pas changer les noms de collections, les champs, ni les règles d'accès du tableau §5.1.
    4. Le service `web` de `docker-compose.yml` ne se construit qu'après la Tâche 5 : ici, ne construire et démarrer que `pocketbase`.
    5. Une fois PocketBase démarré sans erreur, régénérer `backend/pb_schema.json` avec `backend/scripts/export-schema.sh` (remplace la version écrite à la main par l'export réel, qui inclut `users`).
  - **Commandes de validation obligatoires :**
    ```bash
    docker compose config -q
    docker build -t qcm-pocketbase ./backend
    docker run -d --name qcm-pb-test -p 8090:8090 -e PB_SUPERUSER_EMAIL=admin@qcm.local -e PB_SUPERUSER_PASSWORD=motdepasse-test-1234 -e PB_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef qcm-pocketbase
    sleep 5 && curl -fsS http://127.0.0.1:8090/api/health
    curl -fsS "http://127.0.0.1:8090/api/collections/qcms/records"
    curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8090/api/collections/qcms/records -H "Content-Type: application/json" -d "{}"
    PB_SUPERUSER_EMAIL=admin@qcm.local PB_SUPERUSER_PASSWORD=motdepasse-test-1234 sh backend/scripts/export-schema.sh
    docker logs qcm-pb-test 2>&1 | grep -ci "error" ; docker rm -f qcm-pb-test
    ```
    Attendu : `/api/health` répond avec `"code":200` ; la liste `qcms` répond avec `"items":[]` ; le `POST` anonyme affiche `400` (création refusée sans connexion) ; l'export affiche `OK backend/pb_schema.json` et le fichier contient les 4 collections `users`, `qcms`, `ratings`, `comments` ; le compteur d'erreurs des journaux affiche `0`.

---

- [ ] **Tâche 5 : Plateforme Web `apps/web` (Astro + Vue 3)**

  - **Dépendances :** Tâches 1, 2 et 4 `[x]`.
  - **Sections `ARCHITECTURE.md` à copier/appliquer :** §7.1, §7.2, §7.3, §7.4, §7.5.
  - **Périmètre de fichiers :**
    - `apps/web/package.json`, `tsconfig.json`, `astro.config.mjs`, `Dockerfile`, `nginx.conf`
    - `apps/web/public/favicon.svg` (copie de `apps/desktop/app-icon.svg`)
    - `apps/web/scripts/seed.ts`
    - `apps/web/src/env.d.ts`
    - `apps/web/src/styles/global.css`
    - `apps/web/src/layouts/Base.astro`
    - `apps/web/src/lib/pb.ts`, `editorDraft.ts`
    - `apps/web/src/components/HeaderControls.vue`, `LibraryBrowser.vue`, `QcmDetail.vue`, `QcmEditor.vue`
    - `apps/web/src/pages/index.astro`, `bibliotheque.astro`, `qcm.astro`, `editeur.astro`
    - `bun.lock` (mis à jour)
  - **Instructions d'assemblage rapide :**
    1. Créer chaque fichier du périmètre avec le contenu exact de son bloc dans `ARCHITECTURE.md` §7.2 à §7.5.
    2. Ne pas ajouter d'adaptateur Astro (`@astrojs/node`, etc.) : le site est statique (§0.1).
    3. Garder `client:only="vue"` sur les 4 îlots.
    4. Contrôle fonctionnel avec PocketBase local (conteneur de la Tâche 4 relancé sur le port 8090) : lancer le seed, puis `PUBLIC_PB_URL=http://127.0.0.1:8090 bun run dev:web`, ouvrir `/bibliotheque` et vérifier que « Les fractions : comparer et simplifier » apparaît ; ouvrir `/editeur`, remplir une question, cliquer « Essayer le QCM » puis « Enregistrer le fichier .qcm ».
    5. La connexion Google ne se teste qu'avec de vrais identifiants OAuth (§5.3) : sans eux, l'écrire dans le rapport : « connexion Google non vérifiée ».
  - **Commandes de validation obligatoires :**
    ```bash
    bun install
    bun run typecheck
    bun test
    bun run build:web
    PB_SUPERUSER_EMAIL=admin@qcm.local PB_SUPERUSER_PASSWORD=motdepasse-test-1234 bun run --filter @qcm/web seed
    docker compose build web
    ```
    Attendu : `typecheck` à 0 erreur sur les 4 workspaces ; 16 tests réussis ; 4 pages générées dans `apps/web/dist/` ; le seed affiche `OK QCM publié : ...`.
