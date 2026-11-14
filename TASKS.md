# TASKS.md — Ce qui reste à faire

Tout le code est écrit et dans le dépôt. Ce qui a déjà été validé est listé dans `ARCHITECTURE.md` §0.3. Les tâches ci-dessous couvrent **uniquement ce qui n'a jamais tourné** : PocketBase, Windows, la mise à jour automatique et le déploiement.

- Les tâches 1 à 3 sont faisables par un agent.
- Les tâches 4 et 5 demandent une action du propriétaire du dépôt (clé de signature, comptes GitHub, Google et Dokploy). Elles sont marquées **HUMAIN**.

Toutes les commandes se lancent depuis la racine du dépôt, sauf mention contraire.

---

- [x] **Tâche 1 : Contrôle de l'installation locale**

  - **Dépendances :** aucune.
  - **Sections `ARCHITECTURE.md` à lire :** §0.2, §1.2.
  - **Périmètre de fichiers :** aucun fichier à modifier. Si une commande échoue, corriger uniquement le fichier désigné par le message d'erreur.
  - **Instructions :**
    1. Vérifier les outils : `bun --version` (1.4 ou plus), `cargo --version`.
    2. Sous Linux, installer d'abord les paquets système de `ARCHITECTURE.md` §4.4.
    3. Lancer les validations. Elles ont déjà réussi avant livraison : un échec signale un problème d'environnement, pas de code.
  - **Commandes de validation obligatoires :**
    ```bash
    bun install --frozen-lockfile
    bun test
    bun run typecheck
    bun run build:web
    cd apps/desktop/src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
    ```
    Attendu : 16 tests Bun, 0 erreur de types sur 4 workspaces, 4 pages générées, 5 tests Rust, 0 avertissement.

---

- [ ] **Tâche 2 : Premier démarrage réel de PocketBase**

  - **Dépendances :** Tâche 1 `[x]`. Docker installé.
  - **Sections `ARCHITECTURE.md` à lire :** §5.1, §5.2.
  - **Périmètre de fichiers :** `backend/pb_migrations/1760000000_init_qcm.js`, `backend/pb_hooks/main.pb.js`, `backend/Dockerfile`, `backend/entrypoint.sh`, `backend/pb_schema.json`.
  - **Instructions :**
    1. Ces fichiers ont été écrits d'après la documentation de PocketBase mais n'ont jamais été exécutés. Construire l'image et démarrer le conteneur avec les commandes ci-dessous.
    2. Lire `docker logs qcm-pb-test`. Pour chaque erreur de migration ou de hook : corriger uniquement l'instruction fautive, reconstruire, redémarrer (`docker rm -f qcm-pb-test` avant de relancer).
    3. Ne pas changer les noms de collections, les champs, ni les règles d'accès du tableau §5.1. Si une règle est refusée par PocketBase, corriger sa syntaxe en gardant le même sens.
    4. Si le téléchargement de PocketBase échoue dans le `Dockerfile` (version introuvable), prendre la dernière version stable publiée sur la page Releases de `pocketbase/pocketbase` et mettre le même numéro dans `backend/Dockerfile`, `docker-compose.yml` et `ARCHITECTURE.md` §0.2.
    5. Une fois tout au vert, lancer l'export : il remplace `backend/pb_schema.json` par l'export réel (4 collections).
    6. Laisser le conteneur tourner à la fin : la Tâche 3 l'utilise.
  - **Commandes de validation obligatoires :**
    ```bash
    docker compose config -q
    docker build -t qcm-pocketbase ./backend
    docker run -d --name qcm-pb-test -p 8090:8090 -e PB_SUPERUSER_EMAIL=admin@qcm.local -e PB_SUPERUSER_PASSWORD=motdepasse-test-1234 -e PB_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef qcm-pocketbase
    sleep 5 && curl -fsS http://127.0.0.1:8090/api/health
    curl -fsS http://127.0.0.1:8090/api/collections/qcms/records
    curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8090/api/collections/qcms/records -H "Content-Type: application/json" -d "{}"
    PB_SUPERUSER_EMAIL=admin@qcm.local PB_SUPERUSER_PASSWORD=motdepasse-test-1234 sh backend/scripts/export-schema.sh
    docker logs qcm-pb-test 2>&1 | grep -ci "error"
    ```
    Attendu : `/api/health` contient `"code":200` ; la liste `qcms` contient `"items":[]` ; le `POST` anonyme affiche `400` ; l'export affiche `OK backend/pb_schema.json` et le fichier contient `users`, `qcms`, `ratings`, `comments` ; le compteur d'erreurs affiche `0`.

---

- [ ] **Tâche 3 : Site web branché sur PocketBase**

  - **Dépendances :** Tâche 2 `[x]`, conteneur `qcm-pb-test` démarré.
  - **Sections `ARCHITECTURE.md` à lire :** §5.1, §7.1, §7.3.
  - **Périmètre de fichiers :** `apps/web/src/lib/pb.ts`, `apps/web/scripts/seed.ts`, `apps/web/src/components/*.vue`, `apps/web/Dockerfile`, `backend/pb_hooks/main.pb.js`.
  - **Instructions :**
    1. Lancer le seed : il crée un utilisateur de démonstration et publie le QCM d'exemple.
    2. Vérifier par l'API que le QCM est listé, que `status` vaut `published` et que le fichier se télécharge.
    3. Vérifier le hook de moyenne : créer une note avec le compte administrateur, puis relire le QCM (`rating_count` doit valoir `1`). Commandes dans le bloc ci-dessous.
    4. Lancer `PUBLIC_PB_URL=http://127.0.0.1:8090 bun run dev:web`, ouvrir `/bibliotheque` : « Les fractions : comparer et simplifier » doit apparaître ; ouvrir sa fiche, cliquer « Essayer en ligne » : le lecteur doit démarrer.
    5. Toute erreur vient d'un écart entre `pb.ts` et le comportement réel de PocketBase : corriger `pb.ts` (ou le hook), pas le modèle de données.
    6. La connexion Google ne se teste pas ici (Tâche 5). L'écrire dans le rapport.
    7. À la fin : `docker rm -f qcm-pb-test`.
  - **Commandes de validation obligatoires :**
    ```bash
    PB_SUPERUSER_EMAIL=admin@qcm.local PB_SUPERUSER_PASSWORD=motdepasse-test-1234 bun run --filter @qcm/web seed
    curl -fsS "http://127.0.0.1:8090/api/collections/qcms/records?fields=id,title,status,question_count,rating_count"
    bun run typecheck
    bun run build:web
    docker compose build web
    ```
    Attendu : le seed affiche `OK QCM publié : ...` ; la liste contient 1 QCM avec `"status":"published"` et `"question_count":5` ; types et build à 0 erreur ; l'image `web` se construit.

---

- [ ] **Tâche 4 (HUMAIN) : Clé de signature, installateur Windows et mise à jour en un clic**

  - **Dépendances :** Tâche 1 `[x]`. Branche fusionnée dans `main`.
  - **Sections `ARCHITECTURE.md` à lire :** §4.1, §4.4, §4.5.
  - **Périmètre de fichiers :** `apps/desktop/src-tauri/tauri.conf.json` (clé publique, numéro de version), `apps/desktop/package.json` et `apps/desktop/src-tauri/Cargo.toml` (numéro de version).
  - **Instructions :**
    1. Générer la clé de signature et créer les 2 secrets GitHub : étapes exactes en §4.5. La clé privée ne va ni dans le dépôt, ni dans une conversation avec un agent.
    2. Remplacer `REMPLACER_PAR_LA_CLE_PUBLIQUE` dans `tauri.conf.json`, commiter, pousser.
    3. Pousser le tag `v0.1.0`. Attendre la fin du workflow `release-desktop`, puis publier le brouillon de Release.
    4. Sur un PC Windows 11 : télécharger et installer le `.exe`, puis faire les vérifications (1) à (3) de la fin de §4.5.
    5. Tester la mise à jour : passer la version à `0.1.1` dans les 3 fichiers, pousser le tag `v0.1.1`, publier la Release, relancer QCM 0.1.0 → vérification (4) de §4.5.
    6. Si le workflow échoue, donner le journal de l'étape en erreur à un agent avec la consigne : « corrige uniquement `.github/workflows/release-desktop.yml` ».
  - **Commandes de validation obligatoires :**
    ```bash
    grep -c "REMPLACER_PAR_LA_CLE_PUBLIQUE" apps/desktop/src-tauri/tauri.conf.json
    curl -fsSL https://github.com/aifedespaix/qcm/releases/latest/download/latest.json
    ```
    Attendu : le `grep` affiche `0` ; le `curl` renvoie un JSON avec `version` et une entrée `windows-x86_64` signée.

---

- [ ] **Tâche 5 (HUMAIN) : Déploiement Dokploy et connexion Google**

  - **Dépendances :** Tâches 2 et 3 `[x]`.
  - **Sections `ARCHITECTURE.md` à lire :** §5.3.
  - **Périmètre de fichiers :** aucun (réglages dans Dokploy et dans la console Google Cloud).
  - **Instructions :**
    1. Suivre les 5 étapes de §5.3.
    2. Sur le site en ligne : se connecter avec Google, créer un QCM dans l'éditeur, le publier, le retrouver dans la bibliothèque, le noter, le commenter, puis le supprimer.
    3. Dans le tableau de bord PocketBase (`/_/`) : vérifier qu'un administrateur peut passer un QCM en `hidden` et qu'il disparaît de la bibliothèque.
  - **Commandes de validation obligatoires :**
    ```bash
    curl -fsS https://<domaine pocketbase>/api/health
    curl -fsS -o /dev/null -w "%{http_code}\n" https://<domaine web>/bibliotheque
    ```
    Attendu : `"code":200` puis `200`.
