# ARCHITECTURE.md — Contrat technique QCM

Ce document décrit les décisions, les contrats et le fonctionnement du projet QCM. **Le code est dans le dépôt**, pas ici : chaque section renvoie vers les fichiers concernés. Un agent lit uniquement la section citée par sa tâche dans `TASKS.md`, puis ouvre les fichiers listés.

Règles :

- Les versions sont épinglées. Ne pas les changer, ne pas ajouter de dépendance.
- Ne pas changer le format `.qcm`, les noms de composants, de commandes Tauri, de collections ou de champs.

## 0. Décisions d'architecture (figées)

### 0.1 Ce qui a été remis en cause par rapport au brief initial

| Sujet | Brief initial | Décision retenue | Raison |
|---|---|---|---|
| Parsing YAML côté Rust | `serde_yaml` dans Tauri | **Rust ne lit pas le YAML.** Il dézippe, renvoie le texte brut de `data.yaml`, et sert les images. La validation est faite par `@qcm/core` (Zod) dans la webview. | `serde_yaml` est archivé. Surtout : un seul schéma (Zod) au lieu de deux (Zod + structs serde) qui divergeraient. |
| Mode Astro | hybride / SSR | **100 % statique** (`output: 'static'`), îlots Vue `client:only` qui appellent PocketBase depuis le navigateur. | Le mode `hybrid` n'existe plus dans Astro. Aucun serveur Node à héberger : un simple nginx. |
| Format d'une réponse | (libre) | `correct: true` posé sur **une** réponse, pas d'index `answer: 2`. | Robuste au réordonnancement, lisible, moins d'erreurs pour un LLM. |
| Flux d'erreur | « réessayer ou passer » | Deux étapes : **choisir** puis **Valider**. Après une erreur : indice facultatif, la réponse essayée est grisée, boutons « Réessayer » et « Voir la réponse ». | La validation explicite limite les réponses impulsives (TDAH). « Voir la réponse » remplace « passer » : l'élève repart avec la bonne information. |
| Écran de fin | (libre) | Aucun score, aucun pourcentage, aucune étoile. | Zéro culpabilité. |
| Composants `@qcm/ui` | 5 composants | 5 composants + `QcmPlayer` (orchestrateur) + `useQcmPlayer` (machine à états) + 2 boutons (son, thème). | Le desktop et le web partagent exactement le même lecteur : aucune logique dupliquée. |
| Commentaires | collection `comments` | Conservée, avec un champ `hidden` réservé aux administrateurs, et `status` sur `qcms`. | Public mineur : il faut pouvoir masquer un contenu sans le supprimer. |
| Moyenne des notes | (libre) | Champs `rating_avg` / `rating_count` sur `qcms`, recalculés par un hook serveur. | Permet le tri « mieux notés » sans exposer les notes individuelles. |
| Installateur | `.msi` / `.exe` | NSIS `.exe` **par utilisateur** (sans droits administrateur) + `.msi`, construits par GitHub Actions sur `windows-latest`. | Un élève installe sans mot de passe administrateur. Tauri ne compile pas d'installateur Windows depuis Linux. |
| Mise à jour | (demandée ensuite) | `tauri-plugin-updater` : une vérification au démarrage, une carte calme sur l'écran d'accueil, **un clic** sur « Mettre à jour ». Jamais pendant un QCM, jamais imposée. | Seule requête réseau du lecteur. Hors-ligne, elle échoue en silence. Détail en §4.5. |
| TypeScript | (non précisé) | `6.0.3`. | `vue-tsc` et `@astrojs/check` ne fonctionnent pas avec TypeScript 7. |

### 0.2 Versions épinglées

| Outil | Version |
|---|---|
| Bun | 1.4.4 |
| TypeScript | 6.0.3 |
| Vue | 3.5.45 |
| vue-tsc | 3.3.14 |
| Vite | 8.3.8 |
| Tailwind CSS / @tailwindcss/vite | 4.3.5 |
| Zod | 4.6.7 |
| yaml | 2.9.1 |
| fflate | 0.8.3 |
| Tauri (crate / CLI / API) | 2.12 / 2.12.4 / 2.12.4 |
| tauri-plugin-single-instance / dialog / updater / process | 2.5 / 2.8 / 2.14 / 2.4 |
| crate zip | 9.5 |
| Astro / @astrojs/vue / @astrojs/check | 7.4.12 / 7.1.6 / 0.9.12 |
| SDK pocketbase (npm) | 0.29.0 |
| PocketBase (serveur) | 0.40.6 |

### 0.3 État de validation

Exécuté avec succès sur le code du dépôt :

- `bun test` : 16 tests (`@qcm/core`, `@qcm/ui`).
- `bun run typecheck` : 0 erreur sur les 4 workspaces (`tsc`, `vue-tsc`, `astro check`).
- `cargo test` et `cargo clippy --all-targets -- -D warnings` sous Linux : 5 tests, 0 avertissement.
- `bun run build:web` : 4 pages ; parcours éditeur → aperçu → clavier → export `.qcm` vérifié dans Chromium, thèmes clair et sombre.
- PocketBase 0.40.6 : image Docker, migration, hooks de démarrage et de création, règles d'accès anonymes, export du schéma (4 collections).

**Jamais exécuté** (c'est l'objet de `TASKS.md`) : PocketBase (usage depuis le site web, hook de moyenne) ; l'installateur Windows, l'association `.qcm` et la mise à jour automatique (Windows uniquement) ; le workflow GitHub Actions ; la connexion Google.

### 0.4 Règles UX non négociables

1. Jamais de `#FFFFFF` ni de `#000000`. Uniquement les jetons de `theme.css`.
2. Jamais de rouge. Une erreur utilise `bg-retry` (ambre) ; une information neutre utilise `bg-selected` (lavande).
3. Tout élément cliquable principal porte la classe `qcm-block` (64 px minimum, bordure 2 px, `rounded-2xl`, ombre décalée).
4. Aucun score, chronomètre, compte à rebours, série (« streak »), classement ou confetti.
5. Aucune animation de plus de 150 ms. `prefers-reduced-motion` est respecté par `theme.css`.
6. Textes d'interface : tutoiement, phrases courtes, pas de point d'exclamation, pas d'émoji.
7. Clavier : `1` `2` `3` `4` ou `A` `B` `C` `D` choisissent une réponse ; `Entrée` ou `Espace` lancent l'action principale de l'écran (Commencer, Valider, Réessayer, Continuer).
8. Le lecteur desktop fait une seule requête réseau : la recherche de mise à jour au démarrage (§4.5). Tout le reste fonctionne hors-ligne.

---

## 1. Monorepo

### 1.1 Arborescence

```text
qcm/
├── ARCHITECTURE.md                  ce document
├── TASKS.md                         ce qui reste à faire
├── PROMPT.md                        consigne des agents
├── package.json
├── tsconfig.base.json
├── .gitignore
├── docker-compose.yml
├── bun.lock                         (généré par `bun install`)
├── .github/workflows/release-desktop.yml
├── docs/skill-ingestion-cours.md
├── examples/fractions/data.yaml
├── packages/
│   ├── core/                        @qcm/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── scripts/pack.ts
│   │   ├── src/{schema,errors,archive,webp,index}.ts
│   │   └── test/core.test.ts
│   └── ui/                          @qcm/ui
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/index.ts
│       ├── src/styles/theme.css
│       ├── src/composables/{useQcmSound,useQcmTheme,useQcmPlayer}.ts
│       ├── src/components/Qcm{IntroCard,QuestionCard,ChoiceGrid,FeedbackBanner,CompletionScreen,Player,SoundToggle,ThemeToggle}.vue
│       └── test/player.test.ts
├── apps/
│   ├── desktop/                     @qcm/desktop (Tauri 2)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── app-icon.svg
│   │   ├── src/{main.ts,style.css,App.vue}
│   │   ├── src/lib/{qcmFile,updater}.ts
│   │   └── src-tauri/
│   │       ├── Cargo.toml
│   │       ├── build.rs
│   │       ├── tauri.conf.json
│   │       ├── capabilities/default.json
│   │       ├── icons/               (généré par `bun run tauri icon app-icon.svg`)
│   │       └── src/{main.rs,lib.rs}
│   └── web/                         @qcm/web (Astro statique)
│       ├── package.json
│       ├── tsconfig.json
│       ├── astro.config.mjs
│       ├── Dockerfile
│       ├── nginx.conf
│       ├── public/favicon.svg       (copie de apps/desktop/app-icon.svg)
│       ├── scripts/seed.ts
│       └── src/
│           ├── env.d.ts
│           ├── styles/global.css
│           ├── layouts/Base.astro
│           ├── lib/{pb,editorDraft}.ts
│           ├── components/{HeaderControls,LibraryBrowser,QcmDetail,QcmEditor}.vue
│           └── pages/{index,bibliotheque,qcm,editeur}.astro
└── backend/
    ├── Dockerfile
    ├── entrypoint.sh
    ├── .env.example
    ├── pb_schema.json
    ├── pb_migrations/1760000000_init_qcm.js
    ├── pb_hooks/main.pb.js
    └── scripts/export-schema.sh
```

Principe : `@qcm/core` et `@qcm/ui` sont consommés **directement en source TypeScript/Vue** (champ `exports` vers `src/`). Il n'y a aucune étape de build pour les packages : Vite et Astro les compilent.

### 1.2 Fichiers racine et commandes

| Commande (depuis la racine) | Effet |
|---|---|
| `bun install` | Installe tout le monorepo |
| `bun test` | Tests `@qcm/core` et `@qcm/ui` |
| `bun run typecheck` | Types des 4 workspaces |
| `bun run pack <dossier>` | `data.yaml` + `media/` → fichier `.qcm` validé |
| `bun run dev:desktop` / `build:desktop` | Lecteur Tauri en développement / installateur |
| `bun run dev:web` / `build:web` | Site Astro en développement / build statique |

Fichiers : `package.json`, `tsconfig.base.json`, `.gitignore`, `examples/fractions/data.yaml`

---

## 2. `@qcm/core`

### 2.1 Format de fichier `.qcm`

Un fichier `.qcm` est une archive ZIP standard qui contient :

- `data.yaml` à la racine (obligatoire, 1 Mo au plus) ;
- `media/` (facultatif) : uniquement des fichiers `.webp`, 3 Mo au plus chacun, nommés `media/<nom>.webp` avec `<nom>` = 1 à 64 caractères parmi `a-z`, `0-9`, `_`, `-`, commençant par une lettre ou un chiffre.

Toute autre entrée de l'archive est ignorée à la lecture. Taille maximale du fichier `.qcm` : 20 Mo.

Schéma YAML de référence (`examples/fractions/data.yaml` en est un exemple complet) :

```yaml
version: 1                      # obligatoire, toujours 1
meta:
  title: "Texte"                # obligatoire, 1 à 80 caractères
  subject: maths                # obligatoire : maths | francais | histoire-geo | svt | physique-chimie | technologie | anglais | espagnol | allemand | emc | arts | musique | autre
  level: 6e                     # obligatoire : primaire | 6e | 5e | 4e | 3e | lycee | autre
  chapter: "Texte"              # obligatoire, 1 à 80 caractères
  language: fr                  # facultatif, 2 lettres, défaut : fr
  author: "Texte"               # facultatif, 60 caractères au plus
  description: "Texte"          # facultatif, 300 caractères au plus
questions:                      # 1 à 60 questions
  - id: q1                      # obligatoire, unique, a-z 0-9 _ - (32 caractères au plus)
    prompt: "Texte"             # obligatoire, 1 à 300 caractères
    image: media/q1_schema.webp # facultatif
    choices:                    # 2 à 4 réponses, textes tous différents
      - text: "Texte"           # obligatoire, 1 à 120 caractères
        correct: true           # exactement une réponse par question porte correct: true
      - text: "Texte"
    hint: "Texte"               # facultatif, 200 caractères au plus, affiché après une erreur
    explanation: "Texte"        # obligatoire, 500 caractères au plus, affiché avec la bonne réponse
```

Les clés inconnues sont refusées (`z.strictObject`).

### 2.2 API publique

| Export | Rôle |
|---|---|
| `QcmSchema`, `QcmData`, `QcmQuestion`, `QcmMeta`, `QcmChoice` | Schéma Zod et types déduits |
| `SUBJECTS`, `LEVELS`, `SUBJECT_LABELS`, `LEVEL_LABELS`, `LIMITS` | Énumérations, libellés français, limites |
| `validateQcm(input)` | Objet quelconque → `QcmData`, ou lance `QcmFormatError('E_SCHEMA')` |
| `parseQcmYaml(text)` / `stringifyQcmYaml(data)` | Texte YAML ↔ données validées |
| `readQcmArchive(bytes)` / `writeQcmArchive({ data, media })` | Octets `.qcm` ↔ `{ data, media: Map<chemin, Uint8Array> }` |
| `summarizeQcm(data)` | `{ questionCount, hasImages, imagePaths }` |
| `correctIndexOf(question)` | Index de la bonne réponse |
| `imageToWebp(blob, options?)` | Navigateur uniquement : image → WebP, 1280 px au plus, qualité 0.82 |
| `fitWithin`, `mediaPathFor`, `qcmFileName`, `isWebp` | Utilitaires |
| `QcmFormatError`, `QcmErrorCode`, `QCM_ERROR_CODES` | Erreur unique : `code` stable + `details` lisibles |

Codes d'erreur : `E_OPEN`, `E_NOT_ZIP`, `E_NO_DATA`, `E_TOO_BIG`, `E_YAML`, `E_SCHEMA`, `E_MEDIA_MISSING`, `E_MEDIA_INVALID`, `E_IMAGE`.

### 2.3 Fichiers

`packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/schema.ts`, `packages/core/src/errors.ts`, `packages/core/src/archive.ts`, `packages/core/src/webp.ts`, `packages/core/src/index.ts`, `packages/core/scripts/pack.ts`, `packages/core/test/core.test.ts`

---

## 3. `@qcm/ui`

### 3.1 Jetons de couleur

| Jeton CSS | Utilitaire Tailwind | Clair | Sombre | Usage |
|---|---|---|---|---|
| `--qcm-bg` | `bg-bg` | `#f6f1e7` | `#23262f` | Fond de page |
| `--qcm-surface` | `bg-surface` | `#fffaf0` | `#2c303b` | Cartes, blocs |
| `--qcm-sunken` | `bg-sunken` | `#ece4d3` | `#1c1f26` | Progression vide |
| `--qcm-ink` | `text-ink` | `#2b2d42` | `#ece7db` | Texte principal |
| `--qcm-ink-soft` | `text-ink-soft` | `#565973` | `#b7b4c2` | Texte secondaire |
| `--qcm-line` | `border-line` | `#2b2d42` | `#8a8fa3` | Bordures 2 px |
| `--qcm-shadow` | `shadow-block`, `shadow-block-sm` | `#2b2d42` | `#14161b` | Ombre décalée |
| `--qcm-primary` | `bg-primary` | `#bfd7ea` | `#3a5874` | Bouton principal |
| `--qcm-selected` | `bg-selected` | `#dcd3f5` | `#4b4472` | Réponse choisie, information neutre |
| `--qcm-correct` / `-ink` | `bg-correct` / `text-correct-ink` | `#cfe6cf` / `#1f4d2e` | `#2f5540` / `#d3ecd6` | Bonne réponse |
| `--qcm-retry` / `-ink` | `bg-retry` / `text-retry-ink` | `#f5e3b5` / `#5c4208` | `#5a4720` / `#f5e3b5` | « Pas encore », messages d'erreur |
| `--qcm-focus` | `outline-focus` | `#3d5a80` | `#a9c7e8` | Anneau de focus |
| `--qcm-badge-a` … `-d` | `bg-badge-a` … `bg-badge-d` | `#bfd7ea` `#f7d6bf` `#cfe6cf` `#dcd3f5` | `#3a5874` `#6b4a36` `#2f5540` `#4b4472` | Pastilles A, B, C, D |

Classes de composant fournies par `theme.css` : `qcm-card`, `qcm-block`, `qcm-block-primary`, `qcm-block-quiet`, `qcm-icon-button`, `qcm-key`.

Police : Atkinson Hyperlegible Next (variable), embarquée par `@fontsource-variable/atkinson-hyperlegible-next` : aucune requête vers un CDN.

Chaque application importe le thème ainsi dans son CSS d'entrée (le chemin `@source` est relatif au fichier CSS) :

```css
@import "tailwindcss";
@import "@qcm/ui/theme.css";
@source "<chemin relatif vers>/packages/ui/src";
```

### 3.2 Contrat des composants

| Composant | Props | Events | Slot |
|---|---|---|---|
| `QcmIntroCard` | `meta: QcmMeta`, `questionCount: number`, `hasImages: boolean` | `start` | — |
| `QcmQuestionCard` | `index: number` (base 0), `total: number`, `prompt: string`, `imageUrl?: string` | — | défaut : grille + feedback |
| `QcmChoiceGrid` | `choices: readonly { text: string }[]`, `selectedIndex: number \| null`, `triedIndexes: readonly number[]`, `correctIndex: number \| null`, `locked?: boolean` | `select(index: number)` | — |
| `QcmFeedbackBanner` | `kind: 'correct' \| 'retry' \| 'revealed'`, `text?: string`, `isLast?: boolean` | `continue`, `retry`, `reveal` | — |
| `QcmCompletionScreen` | `title: string`, `questionCount: number`, `closable?: boolean` | `restart`, `close` | — |
| `QcmPlayer` | `qcm: QcmData`, `resolveMedia?: (path: string) => string \| undefined`, `closable?: boolean` (défaut `false`), `keyboard?: boolean` (défaut `true`) | `close`, `complete` | — |
| `QcmSoundToggle` | — | — | — |
| `QcmThemeToggle` | — | — | — |

`QcmChoiceGrid` : grille 1 colonne sous 640 px, 2 colonnes (2×2) au-delà. `correctIndex` non nul = bonne réponse mise en avant et grille figée.

Machine à états de `useQcmPlayer` :

```text
intro ──start──▶ answering ──validate (bonne réponse)──▶ correct ──next──▶ answering | done
                     │  ▲
   validate (autre)  │  │ retry, ou choix direct d'une autre réponse
                     ▼  │
                    retry ──reveal──▶ revealed ──next──▶ answering | done
```

Sons (`useQcmSound`) : `playSelect` (choix d'une réponse), `playCorrect` (bonne réponse), `playSoft` (« pas encore »), `playComplete` (fin). État muet partagé, conservé dans `localStorage` sous la clé `qcm:muted`. Le thème est conservé sous `qcm:theme`.

### 3.3 Fichiers

`packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/styles/theme.css`, `packages/ui/src/composables/useQcmSound.ts`, `packages/ui/src/composables/useQcmTheme.ts`, `packages/ui/src/composables/useQcmPlayer.ts`, `packages/ui/src/components/QcmIntroCard.vue`, `packages/ui/src/components/QcmQuestionCard.vue`, `packages/ui/src/components/QcmChoiceGrid.vue`, `packages/ui/src/components/QcmFeedbackBanner.vue`, `packages/ui/src/components/QcmCompletionScreen.vue`, `packages/ui/src/components/QcmPlayer.vue`, `packages/ui/src/components/QcmSoundToggle.vue`, `packages/ui/src/components/QcmThemeToggle.vue`, `packages/ui/src/index.ts`, `packages/ui/test/player.test.ts`

---

## 4. `apps/desktop` (Tauri 2, Windows 11)

### 4.1 Fonctionnement

Ouverture par double-clic dans l'Explorateur Windows :

1. L'installateur enregistre l'extension `.qcm` (`bundle.fileAssociations`). Windows lance `QCM.exe "C:\chemin\fichier.qcm"`.
2. **Démarrage à froid** : `setup` lit `std::env::args()`, garde le chemin dans `AppState.pending_path`. Au montage, le frontend appelle la commande `take_pending_file` puis `load_qcm`. Il n'y a pas de course : c'est le frontend qui vient chercher le chemin quand il est prêt.
3. **À chaud** (QCM déjà ouvert) : `tauri-plugin-single-instance` empêche la seconde instance, transmet ses arguments à la première, qui range le chemin dans `pending_path`, émet l'évènement `qcm-open-file` et remet la fenêtre au premier plan. Le frontend rappelle `take_pending_file`.
4. `load_qcm` dézippe en mémoire (limites anti « zip bomb »), renvoie `{ path, fileName, yaml, media }` et garde les images dans `AppState.media`.
5. Le frontend valide `yaml` avec `parseQcmYaml` de `@qcm/core`.
6. Les images sont servies par le protocole `qcm://` : `convertFileSrc('media/x.webp', 'qcm')` donne `http://qcm.localhost/media%2Fx.webp` sous Windows et `qcm://localhost/media%2Fx.webp` ailleurs. Le gestionnaire Rust décode le chemin et répond avec les octets WebP.

Commandes Tauri :

| Commande | Arguments | Retour |
|---|---|---|
| `load_qcm` | `path: string` | `{ path, fileName, yaml, media: string[] }` ou rejet avec un code `E_OPEN` / `E_NOT_ZIP` / `E_NO_DATA` / `E_TOO_BIG` / `E_MEDIA_INVALID` |
| `take_pending_file` | — | `string \| null` |

Permissions (`capabilities/default.json`) : `core:default`, `dialog:allow-open`, `updater:default`, `process:allow-restart`.

Autres entrées : bouton « Ouvrir un QCM » (dialogue natif) et glisser-déposer d'un fichier sur la fenêtre.

### 4.2 Frontend

Fichiers : `apps/desktop/package.json`, `apps/desktop/tsconfig.json`, `apps/desktop/vite.config.ts`, `apps/desktop/index.html`, `apps/desktop/app-icon.svg`, `apps/desktop/src/main.ts`, `apps/desktop/src/style.css`, `apps/desktop/src/lib/qcmFile.ts`, `apps/desktop/src/lib/updater.ts`, `apps/desktop/src/App.vue`

### 4.3 Backend Rust et configuration Tauri

Dans `lib.rs`, `tauri_plugin_single_instance` doit rester le premier `.plugin(...)`.

Fichiers : `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/build.rs`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/src-tauri/src/main.rs`, `apps/desktop/src-tauri/src/lib.rs`

### 4.4 Icônes et installateur

Les icônes ne sont pas écrites à la main. Depuis `apps/desktop` :

```bash
bun run tauri icon app-icon.svg
```

Les icônes sont déjà générées dans `src-tauri/icons/`. Ne relancer cette commande que si `app-icon.svg` change (puis supprimer `icons/android` et `icons/ios`).

Prérequis Linux pour `cargo check` / `cargo test` (Ubuntu 24.04) :

```bash
sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev libayatana-appindicator3-dev build-essential libssl-dev
```

Construction de l'installateur (Windows uniquement, ou via le workflow ci-dessous) : `bun run build:desktop`. Les fichiers sortent dans `apps/desktop/src-tauri/target/release/bundle/nsis/` et `.../msi/`.

Fichiers : `.github/workflows/release-desktop.yml`

### 4.5 Mise à jour en un clic

Fonctionnement :

1. Au démarrage, après l'ouverture éventuelle du fichier reçu, `checkForUpdate()` (`src/lib/updater.ts`) interroge `https://github.com/aifedespaix/qcm/releases/latest/download/latest.json` (délai maximal : 8 secondes). Sans réseau ou en cas d'erreur : rien ne s'affiche.
2. Si une version plus récente existe, l'écran d'accueil (jamais l'écran d'un QCM) affiche une carte lavande : « Une nouvelle version de QCM est prête. » avec un bouton « Mettre à jour ».
3. Un clic : téléchargement avec pourcentage, vérification de la signature, installation en mode `passive` (une barre de progression Windows, aucune question), puis QCM se rouvre.
4. Ignorer la carte est permis : QCM reste utilisable, la carte revient au prochain démarrage.

Mise en place, à faire **une seule fois** par le propriétaire du dépôt (la clé privée ne doit jamais être dans le dépôt ni dans une conversation) :

```bash
cd apps/desktop
```

```bash
bun run tauri signer generate -w ~/.tauri/qcm.key
```

- Copier le contenu de `~/.tauri/qcm.key.pub` à la place de `REMPLACER_PAR_LA_CLE_PUBLIQUE` dans `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`), puis commiter.
- GitHub > Settings > Secrets and variables > Actions : créer `TAURI_SIGNING_PRIVATE_KEY` (contenu de `~/.tauri/qcm.key`) et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (le mot de passe choisi).
- Conserver une copie de la clé et du mot de passe : sans eux, plus aucune mise à jour ne pourra être signée.

Publier une version :

1. Mettre le même numéro dans `apps/desktop/package.json`, `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml`.
2. Pousser un tag `vX.Y.Z`. Le workflow construit les installateurs signés et `latest.json`, dans un brouillon de Release.
3. Publier le brouillon sur GitHub. À partir de là, les applications installées proposent la mise à jour.

Si le dépôt GitHub change de nom ou de propriétaire, modifier `plugins.updater.endpoints` dans `tauri.conf.json`.

Vérification manuelle sur Windows 11 après installation : (1) double-clic sur un `.qcm` alors que QCM est fermé → l'écran d'accueil du QCM s'affiche ; (2) double-clic sur un autre `.qcm` alors que QCM est ouvert → la même fenêtre passe au premier plan et affiche le nouveau QCM ; (3) couper le réseau → tout fonctionne et aucune carte de mise à jour n'apparaît ; (4) installer une version N, publier une version N+1, relancer QCM → la carte apparaît, un clic installe N+1 et QCM se rouvre.

---

## 5. `backend` (PocketBase) et infrastructure Dokploy

### 5.1 Modèle de données et règles d'accès

La migration `pb_migrations/1760000000_init_qcm.js` est la **source de vérité** : PocketBase l'applique automatiquement au démarrage. `pb_schema.json` contient les mêmes collections `qcms`, `ratings`, `comments` au format importable (Dashboard > Settings > Import collections), pour une instance créée sans migration. La collection système `users` est configurée par la migration et par le hook de démarrage.

| Collection | List / View | Create | Update | Delete |
|---|---|---|---|---|
| `users` (auth) | List : `id = @request.auth.id` · View : public (nom, avatar ; l'e-mail reste masqué) | public (nécessaire à OAuth2) | `id = @request.auth.id` | `id = @request.auth.id` |
| `qcms` | `status = "published" \|\| owner = @request.auth.id` | connecté, `owner` = soi ; `status`, `rating_avg`, `rating_count` interdits dans la requête | propriétaire ; `owner`, `status`, `rating_*` non modifiables | propriétaire |
| `ratings` | `user = @request.auth.id` | connecté, `user` = soi, QCM publié | auteur ; `user` et `qcm` non modifiables | auteur |
| `comments` | `hidden = false \|\| user = @request.auth.id` | connecté, `user` = soi, QCM publié, `hidden` interdit | auteur ; `user`, `qcm`, `hidden` non modifiables | auteur |

Les règles exactes (chaînes de filtre PocketBase) sont dans la migration. Un administrateur (superuser) contourne toutes les règles : il masque un QCM en passant `status` à `hidden`, ou un commentaire en cochant `hidden`, depuis le tableau de bord `/_/`.

Hooks serveur (`pb_hooks/main.pb.js`) :

1. `onBootstrap` : active le fournisseur Google à partir de `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
2. `onRecordCreateRequest` sur `qcms` : force `status = "published"`, `rating_avg = 0`, `rating_count = 0`.
3. Après création, modification ou suppression d'une note : recalcule `rating_avg` (1 décimale) et `rating_count` du QCM.

Limite connue : PocketBase ne peut pas ouvrir le ZIP côté serveur. Le fichier `.qcm` publié est limité à 20 Mo et au type `application/zip` ; son contenu est toujours revalidé par `@qcm/core` (web) et par Rust (desktop) avant affichage.

### 5.2 Fichiers

Fichiers : `backend/pb_migrations/1760000000_init_qcm.js`, `backend/pb_hooks/main.pb.js`, `backend/pb_schema.json`, `backend/Dockerfile`, `backend/entrypoint.sh`, `backend/.env.example`, `backend/scripts/export-schema.sh`, `docker-compose.yml`

### 5.3 Déploiement Dokploy

1. Dokploy > Create Service > **Compose** > dépôt Git du projet, fichier `./docker-compose.yml`.
2. Onglet Environment : coller le contenu de `backend/.env.example` avec les vraies valeurs.
3. Onglet Domains : un domaine pour le service `pocketbase` (port `8090`), un domaine pour le service `web` (port `80`), HTTPS Let's Encrypt activé pour les deux.
4. Console Google Cloud > Credentials > OAuth client « Web application » : URI de redirection autorisée = `https://<domaine pocketbase>/api/oauth2-redirect`.
5. Deploy. Tableau de bord : `https://<domaine pocketbase>/_/`.

Si la version de PocketBase épinglée (`PB_VERSION`) refuse une instruction de la migration ou d'un hook, corriger l'instruction d'après le message d'erreur affiché au démarrage : ne pas changer le modèle de données ni les règles du tableau 5.1.

---

## 6. Skill IA d'ingestion de cours

Le prompt système complet, prêt à copier, est dans `docs/skill-ingestion-cours.md`. Il produit un `data.yaml` conforme au schéma de §2.1 et applique 18 règles pédagogiques TSA (une idée par question, sens littéral, aucune négation, aucun piège, ton neutre). Son exemple de sortie a été validé par `bun run pack`.

Boucle d'utilisation : réponse du LLM → `mon-cours/data.yaml` → `bun run pack mon-cours` → en cas d'erreur `E_SCHEMA` / `E_YAML`, renvoyer les lignes d'erreur au LLM.

---

## 7. `apps/web` (Astro statique + îlots Vue)

### 7.1 Pages

| Route | Fichier | Contenu |
|---|---|---|
| `/` | `pages/index.astro` | Vitrine, bouton « Télécharger pour Windows » (vers `PUBLIC_RELEASES_URL`), engagements |
| `/bibliotheque` | `pages/bibliotheque.astro` + `LibraryBrowser.vue` | Recherche, filtres matière et niveau, tri, pagination, téléchargement direct |
| `/qcm?id=<id>` | `pages/qcm.astro` + `QcmDetail.vue` | Fiche, téléchargement, « Essayer en ligne » (`QcmPlayer`), note 1 à 5, commentaires |
| `/editeur` | `pages/editeur.astro` + `QcmEditor.vue` | Éditeur sans code : questions, images déposées converties en WebP, aperçu, export local, publication |

Tous les îlots sont montés avec `client:only="vue"` (ils utilisent `localStorage`, le SDK PocketBase et la Canvas API). L'export local fonctionne sans compte ; la publication demande une connexion Google.

Variables d'environnement lues au build : `PUBLIC_PB_URL`, `PUBLIC_SITE_URL`, `PUBLIC_RELEASES_URL`.

### 7.2 Configuration

Fichiers : `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/astro.config.mjs`, `apps/web/Dockerfile`, `apps/web/nginx.conf`, `apps/web/src/env.d.ts`, `apps/web/src/styles/global.css`

### 7.3 Bibliothèques

Fichiers : `apps/web/src/lib/pb.ts`, `apps/web/src/lib/editorDraft.ts`, `apps/web/scripts/seed.ts`

### 7.4 Mise en page et pages

Fichiers : `apps/web/src/layouts/Base.astro`, `apps/web/src/pages/index.astro`, `apps/web/src/pages/bibliotheque.astro`, `apps/web/src/pages/qcm.astro`, `apps/web/src/pages/editeur.astro`

### 7.5 Îlots Vue

Fichiers : `apps/web/src/components/HeaderControls.vue`, `apps/web/src/components/LibraryBrowser.vue`, `apps/web/src/components/QcmDetail.vue`, `apps/web/src/components/QcmEditor.vue`
