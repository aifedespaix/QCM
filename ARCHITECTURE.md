# ARCHITECTURE.md — Contrat technique QCM

Ce document est la **source unique** du projet QCM. Il contient le contenu **intégral et verbatim** de chaque fichier du dépôt. Un agent d'exécution n'a aucune décision à prendre : il crée chaque fichier au chemin indiqué par le titre `#### \`chemin\``, avec exactement le contenu du bloc de code qui suit, puis lance les commandes de validation de `TASKS.md`.

Règles de lecture :

- Un titre `#### \`chemin/fichier\`` = un fichier à créer. Le bloc de code juste en dessous est son contenu complet, du premier au dernier caractère.
- Aucun fichier hors de ce document n'est à inventer, sauf ceux produits par une commande (`bun.lock`, `Cargo.lock`, `apps/desktop/src-tauri/icons/*`, `apps/desktop/src-tauri/gen/*`).
- Les versions sont épinglées. Ne pas les changer, ne pas ajouter de dépendance.

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
| Mise à jour automatique | (non précisé) | Aucune. | Bulle hors-ligne : le lecteur ne contacte jamais le réseau. |
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
| tauri-plugin-single-instance / dialog | 2.5 / 2.8 |
| crate zip | 9.5 |
| Astro / @astrojs/vue / @astrojs/check | 7.4.12 / 7.1.6 / 0.9.12 |
| SDK pocketbase (npm) | 0.29.0 |
| PocketBase (serveur) | 0.42.2 |

### 0.3 État de validation de ce document

Le code de ce document a été exécuté tel quel avant rédaction :

- `bun test` : 16 tests réussis (`@qcm/core` et `@qcm/ui`).
- `bun run typecheck` : 0 erreur sur les 4 workspaces (`tsc`, `vue-tsc`, `astro check`).
- `cargo test` et `cargo clippy --all-targets` sur `apps/desktop/src-tauri` (Linux) : 5 tests réussis, 0 avertissement.
- `bun run build:web` : 4 pages générées ; parcours éditeur → aperçu → clavier → export `.qcm` vérifié dans Chromium, thèmes clair et sombre.

**Non exécuté** (à valider pendant les tâches) : la section 5 (PocketBase : migration, hooks, Docker) est écrite d'après la documentation officielle mais n'a pas tourné ; l'installateur Windows et l'association `.qcm` ne se vérifient que sur Windows (Tâche 3) ; le workflow GitHub Actions n'a pas tourné.

### 0.4 Règles UX non négociables

1. Jamais de `#FFFFFF` ni de `#000000`. Uniquement les jetons de `theme.css`.
2. Jamais de rouge. Une erreur utilise `bg-retry` (ambre) ; une information neutre utilise `bg-selected` (lavande).
3. Tout élément cliquable principal porte la classe `qcm-block` (64 px minimum, bordure 2 px, `rounded-2xl`, ombre décalée).
4. Aucun score, chronomètre, compte à rebours, série (« streak »), classement ou confetti.
5. Aucune animation de plus de 150 ms. `prefers-reduced-motion` est respecté par `theme.css`.
6. Textes d'interface : tutoiement, phrases courtes, pas de point d'exclamation, pas d'émoji.
7. Clavier : `1` `2` `3` `4` ou `A` `B` `C` `D` choisissent une réponse ; `Entrée` ou `Espace` lancent l'action principale de l'écran (Commencer, Valider, Réessayer, Continuer).
8. Le lecteur desktop ne fait aucune requête réseau.

---

## 1. Monorepo

### 1.1 Arborescence

```text
qcm/
├── ARCHITECTURE.md
├── TASKS.md
├── PROMPT.md
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
│   │   ├── src/lib/qcmFile.ts
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

### 1.2 Fichiers racine

#### `package.json`

```json
{
  "name": "qcm-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "typecheck": "bun run --filter '*' typecheck",
    "test": "bun test",
    "pack": "bun packages/core/scripts/pack.ts",
    "dev:desktop": "bun run --filter @qcm/desktop tauri dev",
    "build:desktop": "bun run --filter @qcm/desktop tauri build",
    "dev:web": "bun run --filter @qcm/web dev",
    "build:web": "bun run --filter @qcm/web build"
  },
  "devDependencies": {
    "@types/bun": "1.4.4",
    "typescript": "6.0.3"
  }
}
```

#### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "preserve"
  }
}
```

#### `.gitignore`

```gitignore
node_modules/
dist/
.astro/
target/
apps/desktop/src-tauri/gen/
backend/pb_data/
*.qcm
!examples/**/*.qcm
.env
.DS_Store
```

#### `examples/fractions/data.yaml`

```yaml
version: 1
meta:
  title: "Les fractions : comparer et simplifier"
  subject: maths
  level: 6e
  chapter: "Chapitre 4 — Fractions"
  language: fr
  author: "Équipe QCM"
  description: "Cinq questions pour revoir les fractions égales et la simplification."
questions:
  - id: q1
    prompt: "Quelle fraction est égale à 1/2 ?"
    choices:
      - text: "2/4"
        correct: true
      - text: "1/3"
      - text: "3/4"
      - text: "2/3"
    hint: "Multiplie le haut et le bas de 1/2 par le même nombre."
    explanation: "1/2 = 2/4, car 1 × 2 = 2 et 2 × 2 = 4."
  - id: q2
    prompt: "Dans la fraction 3/5, comment s'appelle le nombre 5 ?"
    choices:
      - text: "Le numérateur"
      - text: "Le dénominateur"
        correct: true
    hint: "C'est le nombre écrit en bas."
    explanation: "Le nombre du bas s'appelle le dénominateur. Il indique en combien de parts égales on partage."
  - id: q3
    prompt: "Quelle est la forme simplifiée de 6/8 ?"
    choices:
      - text: "2/3"
      - text: "3/4"
        correct: true
      - text: "6/4"
      - text: "1/2"
    hint: "Divise le haut et le bas par 2."
    explanation: "6 ÷ 2 = 3 et 8 ÷ 2 = 4. Donc 6/8 = 3/4."
  - id: q4
    prompt: "Quelle fraction est la plus grande ?"
    choices:
      - text: "1/4"
      - text: "2/4"
      - text: "3/4"
        correct: true
    explanation: "Les trois fractions ont le même dénominateur. La plus grande est celle qui a le plus grand numérateur : 3/4."
  - id: q5
    prompt: "Combien vaut 4/4 ?"
    choices:
      - text: "0"
      - text: "1"
        correct: true
      - text: "4"
      - text: "8"
    hint: "On prend toutes les parts du partage."
    explanation: "4/4 = 1 : on prend les 4 parts sur 4, donc l'unité entière."
```


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

#### `packages/core/package.json`

```json
{
  "name": "@qcm/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "test": "bun test"
  },
  "dependencies": {
    "fflate": "0.8.3",
    "yaml": "2.9.1",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "@types/bun": "1.4.4",
    "typescript": "6.0.3"
  }
}
```

#### `packages/core/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["bun"]
  },
  "include": ["src", "test", "scripts"]
}
```

#### `packages/core/src/schema.ts`

```ts
import { z } from 'zod'

/** Version du format `data.yaml`. Toute évolution incompatible incrémente ce nombre. */
export const QCM_FORMAT_VERSION = 1 as const

export const SUBJECTS = [
  'maths',
  'francais',
  'histoire-geo',
  'svt',
  'physique-chimie',
  'technologie',
  'anglais',
  'espagnol',
  'allemand',
  'emc',
  'arts',
  'musique',
  'autre',
] as const

export const LEVELS = ['primaire', '6e', '5e', '4e', '3e', 'lycee', 'autre'] as const

export type Subject = (typeof SUBJECTS)[number]
export type Level = (typeof LEVELS)[number]

export const SUBJECT_LABELS: Record<Subject, string> = {
  maths: 'Mathématiques',
  francais: 'Français',
  'histoire-geo': 'Histoire-Géographie',
  svt: 'SVT',
  'physique-chimie': 'Physique-Chimie',
  technologie: 'Technologie',
  anglais: 'Anglais',
  espagnol: 'Espagnol',
  allemand: 'Allemand',
  emc: 'EMC',
  arts: 'Arts plastiques',
  musique: 'Musique',
  autre: 'Autre',
}

export const LEVEL_LABELS: Record<Level, string> = {
  primaire: 'Primaire',
  '6e': '6e',
  '5e': '5e',
  '4e': '4e',
  '3e': '3e',
  lycee: 'Lycée',
  autre: 'Autre',
}

/** Limites du format. Partagées par l'éditeur, le lecteur et le skill IA. */
export const LIMITS = {
  title: 80,
  chapter: 80,
  author: 60,
  description: 300,
  prompt: 300,
  choiceText: 120,
  hint: 200,
  explanation: 500,
  minChoices: 2,
  maxChoices: 4,
  minQuestions: 1,
  maxQuestions: 60,
} as const

/** Chemin d'image autorisé : `media/<nom>.webp`, minuscules, chiffres, `_` et `-`. */
export const MEDIA_PATH_REGEX = /^media\/[a-z0-9][a-z0-9_-]{0,63}\.webp$/
export const QUESTION_ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,31}$/

/**
 * Texte court : YAML peut lire `text: 12` comme un nombre, on le reconvertit en chaîne
 * pour que les auteurs (humains ou IA) n'aient pas à penser aux guillemets.
 */
const text = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'number' ? String(value) : value),
    z.string().trim().min(1, 'Ce texte est vide.').max(max, `Ce texte dépasse ${max} caractères.`),
  )

export const MediaPathSchema = z
  .string()
  .regex(MEDIA_PATH_REGEX, 'Chemin d\'image invalide. Format attendu : media/nom_en_minuscules.webp')

export const ChoiceSchema = z.strictObject({
  text: text(LIMITS.choiceText),
  correct: z.boolean().default(false),
})

export const QuestionSchema = z
  .strictObject({
    id: z.string().regex(QUESTION_ID_REGEX, 'Identifiant invalide. Exemple valide : q1'),
    prompt: text(LIMITS.prompt),
    image: MediaPathSchema.optional(),
    choices: z
      .array(ChoiceSchema)
      .min(LIMITS.minChoices, `Il faut au moins ${LIMITS.minChoices} réponses.`)
      .max(LIMITS.maxChoices, `Il faut au plus ${LIMITS.maxChoices} réponses.`),
    hint: text(LIMITS.hint).optional(),
    explanation: text(LIMITS.explanation),
  })
  .superRefine((question, ctx) => {
    const correctCount = question.choices.filter((choice) => choice.correct).length
    if (correctCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['choices'],
        message: `Il faut exactement 1 bonne réponse (trouvé : ${correctCount}).`,
      })
    }
    const seen = new Set<string>()
    question.choices.forEach((choice, index) => {
      const key = choice.text.toLocaleLowerCase('fr')
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['choices', index, 'text'],
          message: 'Deux réponses ont le même texte.',
        })
      }
      seen.add(key)
    })
  })

export const MetaSchema = z.strictObject({
  title: text(LIMITS.title),
  subject: z.enum(SUBJECTS),
  level: z.enum(LEVELS),
  chapter: text(LIMITS.chapter),
  language: z.string().regex(/^[a-z]{2}$/, 'Code langue sur 2 lettres, exemple : fr').default('fr'),
  author: text(LIMITS.author).optional(),
  description: text(LIMITS.description).optional(),
})

export const QcmSchema = z
  .strictObject({
    version: z.literal(QCM_FORMAT_VERSION),
    meta: MetaSchema,
    questions: z
      .array(QuestionSchema)
      .min(LIMITS.minQuestions, 'Il faut au moins 1 question.')
      .max(LIMITS.maxQuestions, `Il faut au plus ${LIMITS.maxQuestions} questions.`),
  })
  .superRefine((qcm, ctx) => {
    const seen = new Set<string>()
    qcm.questions.forEach((question, index) => {
      if (seen.has(question.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'id'],
          message: `L'identifiant « ${question.id} » est utilisé deux fois.`,
        })
      }
      seen.add(question.id)
    })
  })

export type QcmChoice = z.infer<typeof ChoiceSchema>
export type QcmQuestion = z.infer<typeof QuestionSchema>
export type QcmMeta = z.infer<typeof MetaSchema>
export type QcmData = z.infer<typeof QcmSchema>
/** Forme acceptée en entrée (avant application des valeurs par défaut). */
export type QcmDataInput = z.input<typeof QcmSchema>

/** Résumé affiché sur l'écran d'accueil d'un QCM et stocké dans PocketBase. */
export interface QcmSummary {
  questionCount: number
  hasImages: boolean
  imagePaths: string[]
}

export function summarizeQcm(qcm: QcmData): QcmSummary {
  const imagePaths = [
    ...new Set(qcm.questions.flatMap((question) => (question.image ? [question.image] : []))),
  ]
  return {
    questionCount: qcm.questions.length,
    hasImages: imagePaths.length > 0,
    imagePaths,
  }
}

/** Index de la bonne réponse d'une question valide. */
export function correctIndexOf(question: QcmQuestion): number {
  return question.choices.findIndex((choice) => choice.correct)
}
```

#### `packages/core/src/errors.ts`

```ts
import type { z } from 'zod'

export type QcmErrorCode =
  | 'E_OPEN'
  | 'E_NOT_ZIP'
  | 'E_NO_DATA'
  | 'E_TOO_BIG'
  | 'E_YAML'
  | 'E_SCHEMA'
  | 'E_MEDIA_MISSING'
  | 'E_MEDIA_INVALID'
  | 'E_IMAGE'

const DEFAULT_MESSAGES: Record<QcmErrorCode, string> = {
  E_OPEN: 'Ce fichier ne peut pas être ouvert.',
  E_NOT_ZIP: 'Ce fichier n\'est pas un fichier QCM lisible.',
  E_NO_DATA: 'Ce fichier QCM ne contient pas de questions (data.yaml absent).',
  E_TOO_BIG: 'Ce fichier QCM est trop volumineux.',
  E_YAML: 'Le contenu du QCM est mal écrit (YAML invalide).',
  E_SCHEMA: 'Le contenu du QCM ne respecte pas le format attendu.',
  E_MEDIA_MISSING: 'Une image du QCM est introuvable dans le fichier.',
  E_MEDIA_INVALID: 'Une image du QCM n\'est pas une image WebP valide.',
  E_IMAGE: 'Cette image ne peut pas être convertie.',
}

/** Erreur unique du format QCM : un code stable + des détails lisibles en français. */
export const QCM_ERROR_CODES = Object.keys(DEFAULT_MESSAGES) as QcmErrorCode[]

export class QcmFormatError extends Error {
  readonly code: QcmErrorCode
  /** Une ligne par problème, par exemple `questions[2].choices : Il faut exactement 1 bonne réponse`. */
  readonly details: string[]

  constructor(code: QcmErrorCode, details: string[] = [], message?: string) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'QcmFormatError'
    this.code = code
    this.details = details
  }
}

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path
      .map((segment) => (typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`))
      .join('')
      .replace(/^\./, '')
    return path ? `${path} : ${issue.message}` : issue.message
  })
}
```

#### `packages/core/src/archive.ts`

```ts
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { QcmFormatError, formatZodIssues } from './errors.ts'
import { MEDIA_PATH_REGEX, QcmSchema, summarizeQcm, type QcmData } from './schema.ts'

export const DATA_FILE = 'data.yaml'
export const QCM_EXTENSION = '.qcm'
export const QCM_MIME = 'application/zip'

/** Garde-fous contre les archives piégées. Mêmes valeurs que dans le backend Rust. */
export const ARCHIVE_LIMITS = {
  maxArchiveBytes: 20 * 1024 * 1024,
  maxDataBytes: 1024 * 1024,
  maxMediaBytes: 3 * 1024 * 1024,
  maxTotalBytes: 60 * 1024 * 1024,
} as const

export interface QcmArchive {
  data: QcmData
  /** Clé = chemin relatif `media/nom.webp`, valeur = octets WebP. */
  media: Map<string, Uint8Array>
}

/** Valide un objet JavaScript quelconque contre le schéma. Lance `QcmFormatError('E_SCHEMA')`. */
export function validateQcm(input: unknown): QcmData {
  const result = QcmSchema.safeParse(input)
  if (!result.success) {
    throw new QcmFormatError('E_SCHEMA', formatZodIssues(result.error))
  }
  return result.data
}

/** Texte `data.yaml` → données validées. */
export function parseQcmYaml(yamlText: string): QcmData {
  let raw: unknown
  try {
    raw = parseYaml(yamlText, { schema: 'core', maxAliasCount: 0 })
  } catch (error) {
    throw new QcmFormatError('E_YAML', [error instanceof Error ? error.message : String(error)])
  }
  return validateQcm(raw)
}

/** Données validées → texte `data.yaml` stable et lisible (ordre des clés fixe, `correct: false` omis). */
export function stringifyQcmYaml(input: QcmData): string {
  const data = validateQcm(input)
  const meta = data.meta
  const plain = {
    version: data.version,
    meta: {
      title: meta.title,
      subject: meta.subject,
      level: meta.level,
      chapter: meta.chapter,
      language: meta.language,
      ...(meta.author ? { author: meta.author } : {}),
      ...(meta.description ? { description: meta.description } : {}),
    },
    questions: data.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      ...(question.image ? { image: question.image } : {}),
      choices: question.choices.map((choice) =>
        choice.correct ? { text: choice.text, correct: true } : { text: choice.text },
      ),
      ...(question.hint ? { hint: question.hint } : {}),
      explanation: question.explanation,
    })),
  }
  return stringifyYaml(plain, { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' })
}

/** Vrai si les octets commencent par un en-tête RIFF....WEBP. */
export function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
}

/** Octets d'un fichier `.qcm` → données validées + images. */
export function readQcmArchive(bytes: Uint8Array): QcmArchive {
  if (bytes.length > ARCHIVE_LIMITS.maxArchiveBytes) {
    throw new QcmFormatError('E_TOO_BIG')
  }
  let total = 0
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        const wanted = file.name === DATA_FILE || MEDIA_PATH_REGEX.test(file.name)
        if (!wanted) return false
        const max = file.name === DATA_FILE ? ARCHIVE_LIMITS.maxDataBytes : ARCHIVE_LIMITS.maxMediaBytes
        total += file.originalSize
        if (file.originalSize > max || total > ARCHIVE_LIMITS.maxTotalBytes) {
          throw new QcmFormatError('E_TOO_BIG')
        }
        return true
      },
    })
  } catch (error) {
    if (error instanceof QcmFormatError) throw error
    throw new QcmFormatError('E_NOT_ZIP')
  }

  const dataBytes = files[DATA_FILE]
  if (!dataBytes) throw new QcmFormatError('E_NO_DATA')
  const data = parseQcmYaml(strFromU8(dataBytes))

  const media = new Map<string, Uint8Array>()
  for (const path of summarizeQcm(data).imagePaths) {
    const image = files[path]
    if (!image) throw new QcmFormatError('E_MEDIA_MISSING', [path])
    if (!isWebp(image)) throw new QcmFormatError('E_MEDIA_INVALID', [path])
    media.set(path, image)
  }
  return { data, media }
}

/** Données + images → octets d'un fichier `.qcm`. Seules les images référencées sont écrites. */
export function writeQcmArchive(archive: { data: QcmData; media?: ReadonlyMap<string, Uint8Array> }): Uint8Array {
  const data = validateQcm(archive.data)
  const zippable: Zippable = {
    [DATA_FILE]: [strToU8(stringifyQcmYaml(data)), { level: 9 }],
  }
  for (const path of summarizeQcm(data).imagePaths) {
    const image = archive.media?.get(path)
    if (!image) throw new QcmFormatError('E_MEDIA_MISSING', [path])
    if (!isWebp(image)) throw new QcmFormatError('E_MEDIA_INVALID', [path])
    if (image.length > ARCHIVE_LIMITS.maxMediaBytes) throw new QcmFormatError('E_TOO_BIG', [path])
    // WebP est déjà compressé : on stocke sans recompresser.
    zippable[path] = [image, { level: 0 }]
  }
  const bytes = zipSync(zippable)
  if (bytes.length > ARCHIVE_LIMITS.maxArchiveBytes) throw new QcmFormatError('E_TOO_BIG')
  return bytes
}

/** Nom de fichier sûr pour un export : « Les fractions ! » → `les-fractions.qcm`. */
export function qcmFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'qcm'}${QCM_EXTENSION}`
}
```

#### `packages/core/src/webp.ts`

```ts
import { QcmFormatError } from './errors.ts'
import { ARCHIVE_LIMITS } from './archive.ts'

export const WEBP_MAX_DIMENSION = 1280
export const WEBP_QUALITY = 0.82

export interface WebpResult {
  bytes: Uint8Array
  width: number
  height: number
}

export interface WebpOptions {
  /** Plus grand côté autorisé en pixels. Défaut : 1280. */
  maxDimension?: number
  /** Qualité WebP entre 0 et 1. Défaut : 0.82. */
  quality?: number
}

/** Calcule la taille finale en conservant les proportions, sans jamais agrandir. */
export function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxDimension) return { width, height }
  const scale = maxDimension / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Construit un chemin `media/...webp` valide et unique : (`q3`, `Schéma Cellule.PNG`) → `media/q3_schema-cellule.webp`. */
export function mediaPathFor(questionId: string, originalName: string, taken: Iterable<string> = []): string {
  const base = originalName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const stem = `${questionId}_${base || 'image'}`.slice(0, 56)
  const used = new Set(taken)
  let candidate = `media/${stem}.webp`
  for (let n = 2; used.has(candidate); n++) {
    candidate = `media/${stem}-${n}.webp`
  }
  return candidate
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) return null
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    return canvas.convertToBlob({ type: 'image/webp', quality })
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
}

/**
 * Convertit une image du navigateur (PNG, JPEG, GIF, WebP, SVG...) en WebP redimensionné.
 * Navigateur uniquement (Canvas API). Lance `QcmFormatError('E_IMAGE')` si la conversion échoue.
 */
export async function imageToWebp(source: Blob, options: WebpOptions = {}): Promise<WebpResult> {
  const maxDimension = options.maxDimension ?? WEBP_MAX_DIMENSION
  let quality = options.quality ?? WEBP_QUALITY

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch {
    throw new QcmFormatError('E_IMAGE', ['Format d\'image non reconnu.'])
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension)
    // Jusqu'à 3 essais en baissant la qualité si le fichier dépasse la limite du format.
    for (let attempt = 0; attempt < 3; attempt++) {
      const blob = await encode(bitmap, width, height, quality)
      if (!blob || blob.type !== 'image/webp') {
        throw new QcmFormatError('E_IMAGE', ['Ce navigateur ne sait pas créer d\'images WebP.'])
      }
      if (blob.size <= ARCHIVE_LIMITS.maxMediaBytes) {
        return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
      }
      quality -= 0.2
    }
    throw new QcmFormatError('E_IMAGE', ['Image trop lourde même après compression.'])
  } finally {
    bitmap.close()
  }
}
```

#### `packages/core/src/index.ts`

```ts
export * from './schema.ts'
export * from './errors.ts'
export * from './archive.ts'
export * from './webp.ts'
```

#### `packages/core/scripts/pack.ts`

```ts
/**
 * Emballe un dossier (data.yaml + media/*.webp) en fichier .qcm.
 * Usage : bun run pack <dossier> [sortie.qcm]
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { QcmFormatError, parseQcmYaml, qcmFileName, writeQcmArchive } from '../src/index.ts'

const [folder, output] = process.argv.slice(2)
if (!folder) {
  console.error('Usage : bun run pack <dossier> [sortie.qcm]')
  process.exit(2)
}

try {
  const data = parseQcmYaml(await Bun.file(join(folder, 'data.yaml')).text())
  const media = new Map<string, Uint8Array>()
  const names = await readdir(join(folder, 'media')).catch(() => [] as string[])
  for (const name of names) {
    media.set(`media/${name}`, new Uint8Array(await Bun.file(join(folder, 'media', name)).arrayBuffer()))
  }
  const target = output ?? join(folder, qcmFileName(data.meta.title))
  await Bun.write(target, writeQcmArchive({ data, media }))
  console.log(`OK ${target} (${data.questions.length} questions, ${media.size} image(s))`)
} catch (error) {
  if (error instanceof QcmFormatError) {
    console.error(`${error.code} ${error.message}`)
    for (const detail of error.details) console.error(`  - ${detail}`)
    process.exit(1)
  }
  throw error
}
```

#### `packages/core/test/core.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { zipSync, strToU8 } from 'fflate'
import {
  QcmFormatError,
  correctIndexOf,
  fitWithin,
  isWebp,
  mediaPathFor,
  parseQcmYaml,
  qcmFileName,
  readQcmArchive,
  stringifyQcmYaml,
  summarizeQcm,
  writeQcmArchive,
} from '../src/index.ts'

const EXAMPLE = await Bun.file(new URL('../../../examples/fractions/data.yaml', import.meta.url)).text()

/** Plus petit en-tête WebP accepté par `isWebp`. */
const FAKE_WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0])

const MINIMAL = `
version: 1
meta: { title: Test, subject: maths, level: 6e, chapter: Chapitre 1 }
questions:
  - id: q1
    prompt: Combien font 2 + 2 ?
    image: media/q1_schema.webp
    choices:
      - text: 4
        correct: true
      - text: 5
    explanation: 2 + 2 = 4.
`

function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof QcmFormatError) return error.code
    throw error
  }
  return 'NO_ERROR'
}

describe('schema', () => {
  test('accepte le QCM d\'exemple', () => {
    const qcm = parseQcmYaml(EXAMPLE)
    expect(qcm.questions).toHaveLength(5)
    expect(qcm.meta.language).toBe('fr')
    expect(summarizeQcm(qcm)).toEqual({ questionCount: 5, hasImages: false, imagePaths: [] })
    expect(correctIndexOf(qcm.questions[0]!)).toBe(0)
  })

  test('convertit les nombres en texte et applique les valeurs par défaut', () => {
    const qcm = parseQcmYaml(MINIMAL)
    expect(qcm.questions[0]!.choices).toEqual([
      { text: '4', correct: true },
      { text: '5', correct: false },
    ])
  })

  test('refuse zéro ou plusieurs bonnes réponses', () => {
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('correct: true', 'correct: false')))).toBe('E_SCHEMA')
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('- text: 5', '- text: 5\n        correct: true')))).toBe('E_SCHEMA')
  })

  test('refuse les clés inconnues, les identifiants en double et une mauvaise version', () => {
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('explanation:', 'score: 3\n    explanation:')))).toBe('E_SCHEMA')
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('version: 1', 'version: 2')))).toBe('E_SCHEMA')
    const twice = MINIMAL + MINIMAL.slice(MINIMAL.indexOf('  - id: q1'))
    expect(codeOf(() => parseQcmYaml(twice))).toBe('E_SCHEMA')
  })

  test('refuse un chemin d\'image hors de media/', () => {
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('media/q1_schema.webp', '../secret.webp')))).toBe('E_SCHEMA')
    expect(codeOf(() => parseQcmYaml(MINIMAL.replace('media/q1_schema.webp', 'media/Q1.png')))).toBe('E_SCHEMA')
  })

  test('signale un YAML illisible', () => {
    expect(codeOf(() => parseQcmYaml('version: [1'))).toBe('E_YAML')
  })

  test('donne des détails lisibles', () => {
    try {
      parseQcmYaml(MINIMAL.replace('correct: true', 'correct: false'))
      throw new Error('aurait dû échouer')
    } catch (error) {
      expect(error).toBeInstanceOf(QcmFormatError)
      expect((error as QcmFormatError).details[0]).toStartWith('questions[0].choices : ')
    }
  })
})

describe('archive', () => {
  test('aller-retour YAML stable', () => {
    const qcm = parseQcmYaml(EXAMPLE)
    const yaml = stringifyQcmYaml(qcm)
    expect(parseQcmYaml(yaml)).toEqual(qcm)
    expect(yaml).not.toContain('correct: false')
    expect(stringifyQcmYaml(parseQcmYaml(yaml))).toBe(yaml)
  })

  test('aller-retour ZIP avec image', () => {
    const data = parseQcmYaml(MINIMAL)
    const media = new Map([
      ['media/q1_schema.webp', FAKE_WEBP],
      ['media/inutile.webp', FAKE_WEBP],
    ])
    const bytes = writeQcmArchive({ data, media })
    const archive = readQcmArchive(bytes)
    expect(archive.data).toEqual(data)
    expect([...archive.media.keys()]).toEqual(['media/q1_schema.webp'])
    expect(isWebp(archive.media.get('media/q1_schema.webp')!)).toBe(true)
  })

  test('erreurs d\'archive', () => {
    const data = parseQcmYaml(MINIMAL)
    expect(codeOf(() => writeQcmArchive({ data }))).toBe('E_MEDIA_MISSING')
    expect(codeOf(() => writeQcmArchive({ data, media: new Map([['media/q1_schema.webp', strToU8('png')]]) }))).toBe('E_MEDIA_INVALID')
    expect(codeOf(() => readQcmArchive(strToU8('pas un zip')))).toBe('E_NOT_ZIP')
    expect(codeOf(() => readQcmArchive(zipSync({ 'autre.txt': strToU8('x') })))).toBe('E_NO_DATA')
    expect(codeOf(() => readQcmArchive(zipSync({ 'data.yaml': strToU8(MINIMAL) })))).toBe('E_MEDIA_MISSING')
    expect(codeOf(() => readQcmArchive(zipSync({ 'data.yaml': new Uint8Array(1024 * 1024 + 1) })))).toBe('E_TOO_BIG')
  })

  test('ignore les fichiers non prévus', () => {
    const bytes = zipSync({
      'data.yaml': strToU8(EXAMPLE),
      'media/virus.exe': strToU8('x'),
      '../evil.webp': FAKE_WEBP,
    })
    expect(readQcmArchive(bytes).media.size).toBe(0)
  })

  test('nom de fichier', () => {
    expect(qcmFileName('Les fractions : comparer & simplifier !')).toBe('les-fractions-comparer-simplifier.qcm')
    expect(qcmFileName('???')).toBe('qcm.qcm')
  })
})

describe('webp', () => {
  test('fitWithin conserve les proportions et n\'agrandit jamais', () => {
    expect(fitWithin(2560, 1440, 1280)).toEqual({ width: 1280, height: 720 })
    expect(fitWithin(1000, 4000, 1280)).toEqual({ width: 320, height: 1280 })
    expect(fitWithin(640, 480, 1280)).toEqual({ width: 640, height: 480 })
  })

  test('mediaPathFor produit des chemins valides et uniques', () => {
    expect(mediaPathFor('q3', 'Schéma Cellule.PNG')).toBe('media/q3_schema-cellule.webp')
    expect(mediaPathFor('q3', 'Schéma Cellule.PNG', ['media/q3_schema-cellule.webp'])).toBe('media/q3_schema-cellule-2.webp')
    expect(mediaPathFor('q1', '???.jpg')).toBe('media/q1_image.webp')
  })
})
```


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

#### `packages/ui/package.json`

```json
{
  "name": "@qcm/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./theme.css": "./src/styles/theme.css"
  },
  "scripts": {
    "typecheck": "vue-tsc --noEmit -p tsconfig.json",
    "test": "bun test"
  },
  "dependencies": {
    "@fontsource-variable/atkinson-hyperlegible-next": "5.3.0",
    "@qcm/core": "workspace:*"
  },
  "peerDependencies": {
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@types/bun": "1.4.4",
    "typescript": "6.0.3",
    "vue": "3.5.45",
    "vue-tsc": "3.3.14"
  }
}
```

#### `packages/ui/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["bun"]
  },
  "include": ["src", "test"]
}
```

#### `packages/ui/src/styles/theme.css`

```css
/*
 * Thème QCM — « brutalité douce ».
 * À importer APRÈS `@import "tailwindcss";` dans le CSS d'entrée de chaque application.
 * Les couleurs changent via l'attribut `data-theme="light" | "dark"` posé sur <html>.
 */
@import "@fontsource-variable/atkinson-hyperlegible-next";

:root,
[data-theme="light"] {
  color-scheme: light;
  --qcm-bg: #f6f1e7;          /* fond crème */
  --qcm-surface: #fffaf0;     /* cartes */
  --qcm-sunken: #ece4d3;      /* zones en creux, barre de progression vide */
  --qcm-ink: #2b2d42;         /* texte principal, bordures */
  --qcm-ink-soft: #565973;    /* texte secondaire */
  --qcm-line: #2b2d42;        /* bordures 2px */
  --qcm-shadow: #2b2d42;      /* ombre décalée */
  --qcm-primary: #bfd7ea;     /* bouton principal, bleu brume */
  --qcm-selected: #dcd3f5;    /* réponse sélectionnée, lavande */
  --qcm-correct: #cfe6cf;     /* bonne réponse, sauge */
  --qcm-correct-ink: #1f4d2e;
  --qcm-retry: #f5e3b5;       /* « pas encore », ambre doux */
  --qcm-retry-ink: #5c4208;
  --qcm-focus: #3d5a80;       /* anneau de focus clavier */
  --qcm-badge-a: #bfd7ea;
  --qcm-badge-b: #f7d6bf;
  --qcm-badge-c: #cfe6cf;
  --qcm-badge-d: #dcd3f5;
}

[data-theme="dark"] {
  color-scheme: dark;
  --qcm-bg: #23262f;          /* ardoise douce */
  --qcm-surface: #2c303b;
  --qcm-sunken: #1c1f26;
  --qcm-ink: #ece7db;
  --qcm-ink-soft: #b7b4c2;
  --qcm-line: #8a8fa3;
  --qcm-shadow: #14161b;
  --qcm-primary: #3a5874;
  --qcm-selected: #4b4472;
  --qcm-correct: #2f5540;
  --qcm-correct-ink: #d3ecd6;
  --qcm-retry: #5a4720;
  --qcm-retry-ink: #f5e3b5;
  --qcm-focus: #a9c7e8;
  --qcm-badge-a: #3a5874;
  --qcm-badge-b: #6b4a36;
  --qcm-badge-c: #2f5540;
  --qcm-badge-d: #4b4472;
}

@theme inline {
  --font-sans: "Atkinson Hyperlegible Next Variable", "Atkinson Hyperlegible Next", "Segoe UI", system-ui, sans-serif;

  --color-bg: var(--qcm-bg);
  --color-surface: var(--qcm-surface);
  --color-sunken: var(--qcm-sunken);
  --color-ink: var(--qcm-ink);
  --color-ink-soft: var(--qcm-ink-soft);
  --color-line: var(--qcm-line);
  --color-primary: var(--qcm-primary);
  --color-selected: var(--qcm-selected);
  --color-correct: var(--qcm-correct);
  --color-correct-ink: var(--qcm-correct-ink);
  --color-retry: var(--qcm-retry);
  --color-retry-ink: var(--qcm-retry-ink);
  --color-focus: var(--qcm-focus);
  --color-badge-a: var(--qcm-badge-a);
  --color-badge-b: var(--qcm-badge-b);
  --color-badge-c: var(--qcm-badge-c);
  --color-badge-d: var(--qcm-badge-d);

  --shadow-block: 4px 4px 0 0 var(--qcm-shadow);
  --shadow-block-sm: 2px 2px 0 0 var(--qcm-shadow);
}

@layer base {
  html {
    background-color: var(--qcm-bg);
    color: var(--qcm-ink);
    font-family: var(--font-sans);
    font-size: 18px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  body {
    margin: 0;
    min-height: 100dvh;
  }

  :focus-visible {
    outline: 3px solid var(--qcm-focus);
    outline-offset: 3px;
  }

  ::selection {
    background-color: var(--qcm-selected);
    color: var(--qcm-ink);
  }
}

@layer components {
  /* Carte : surface, bordure nette 2px, coins très arrondis, ombre décalée. */
  .qcm-card {
    background-color: var(--qcm-surface);
    border: 2px solid var(--qcm-line);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-block);
  }

  /* Bloc cliquable : 64px minimum, s'enfonce au clic. */
  .qcm-block {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 64px;
    padding: 0.75rem 1.25rem;
    background-color: var(--qcm-surface);
    color: var(--qcm-ink);
    border: 2px solid var(--qcm-line);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-block);
    font-family: inherit;
    font-size: 1.125rem;
    font-weight: 700;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
    transition: transform 120ms ease-out, box-shadow 120ms ease-out, background-color 120ms ease-out;
  }

  .qcm-block:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 0 var(--qcm-shadow);
  }

  .qcm-block:active:not(:disabled) {
    transform: translate(3px, 3px);
    box-shadow: 1px 1px 0 0 var(--qcm-shadow);
  }

  .qcm-block:disabled {
    cursor: default;
  }

  .qcm-block-primary {
    justify-content: center;
    background-color: var(--qcm-primary);
    text-align: center;
  }

  .qcm-block-quiet {
    justify-content: center;
    box-shadow: var(--shadow-block-sm);
    font-weight: 600;
    text-align: center;
  }

  /* Petit bouton rond de barre d'outils (son, thème). */
  .qcm-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background-color: var(--qcm-surface);
    color: var(--qcm-ink);
    border: 2px solid var(--qcm-line);
    border-radius: 9999px;
    box-shadow: var(--shadow-block-sm);
    cursor: pointer;
  }

  /* Touche clavier affichée dans un bloc (A, B, C, D, Entrée). */
  .qcm-key {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-width: 40px;
    height: 40px;
    padding: 0 0.5rem;
    border: 2px solid var(--qcm-line);
    border-radius: var(--radius-xl);
    font-size: 1rem;
    font-weight: 800;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

#### `packages/ui/src/composables/useQcmSound.ts`

```ts
import { readonly, ref } from 'vue'

/**
 * Moteur audio procédural QCM : aucun fichier son, tout est synthétisé avec la Web Audio API.
 * Sons courts, doux (ondes sinus/triangle, attaque lente, volume bas), jamais stridents.
 * L'état muet est partagé par toute l'application et conservé dans localStorage.
 */

const STORAGE_KEY = 'qcm:muted'
const MASTER_VOLUME = 0.35

interface Note {
  /** Fréquence en hertz. */
  frequency: number
  /** Décalage de départ en secondes par rapport au début du son. */
  at: number
  /** Durée tenue avant le relâchement, en secondes. */
  hold: number
  type?: OscillatorType
  /** Volume de crête de la note, entre 0 et 1. */
  peak?: number
  attack?: number
  decay?: number
  /** Niveau de maintien, en proportion de `peak`. */
  sustain?: number
  release?: number
}

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const muted = ref(readMuted())
let context: AudioContext | null = null
let master: GainNode | null = null

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!context) {
    context = new AudioContext({ latencyHint: 'interactive' })
    master = context.createGain()
    master.gain.value = MASTER_VOLUME
    // Filtre passe-bas : retire les aigus agressifs.
    const softener = context.createBiquadFilter()
    softener.type = 'lowpass'
    softener.frequency.value = 3200
    softener.Q.value = 0.5
    master.connect(softener).connect(context.destination)
  }
  if (context.state === 'suspended') void context.resume()
  return context
}

function playNote(audio: AudioContext, output: AudioNode, startAt: number, note: Note): void {
  const peak = note.peak ?? 0.5
  const attack = note.attack ?? 0.012
  const decay = note.decay ?? 0.08
  const sustain = (note.sustain ?? 0.6) * peak
  const release = note.release ?? 0.18
  const t0 = startAt + note.at
  const tHoldEnd = t0 + Math.max(note.hold, attack + decay)
  const tEnd = tHoldEnd + release

  const oscillator = audio.createOscillator()
  oscillator.type = note.type ?? 'sine'
  oscillator.frequency.setValueAtTime(note.frequency, t0)

  // Enveloppe ADSR.
  const envelope = audio.createGain()
  envelope.gain.setValueAtTime(0.0001, t0)
  envelope.gain.linearRampToValueAtTime(peak, t0 + attack)
  envelope.gain.linearRampToValueAtTime(sustain, t0 + attack + decay)
  envelope.gain.setValueAtTime(sustain, tHoldEnd)
  envelope.gain.exponentialRampToValueAtTime(0.0001, tEnd)

  oscillator.connect(envelope).connect(output)
  oscillator.start(t0)
  oscillator.stop(tEnd + 0.02)
  oscillator.onended = () => {
    oscillator.disconnect()
    envelope.disconnect()
  }
}

function play(notes: Note[]): void {
  if (muted.value) return
  const audio = ensureContext()
  if (!audio || !master) return
  const startAt = audio.currentTime + 0.01
  for (const note of notes) playNote(audio, master, startAt, note)
}

/** Sélection d'une réponse : petit « toc » feutré. */
const SELECT: Note[] = [
  { frequency: 520, at: 0, hold: 0.03, type: 'triangle', peak: 0.28, attack: 0.004, decay: 0.03, sustain: 0.3, release: 0.06 },
]

/** Bonne réponse : deux notes montantes (quinte, do5 → sol5). */
const CORRECT: Note[] = [
  { frequency: 523.25, at: 0, hold: 0.09, peak: 0.42 },
  { frequency: 783.99, at: 0.1, hold: 0.16, peak: 0.42, release: 0.3 },
]

/** « Pas encore » : une seule note grave, ronde et neutre. Ni descente ni dissonance. */
const SOFT: Note[] = [
  { frequency: 329.63, at: 0, hold: 0.12, peak: 0.34, attack: 0.03, decay: 0.1, sustain: 0.5, release: 0.28 },
]

/** Fin de QCM : arpège majeur calme (do5, mi5, sol5, do6) puis accord tenu. */
const COMPLETE: Note[] = [
  { frequency: 523.25, at: 0, hold: 0.1, peak: 0.36 },
  { frequency: 659.25, at: 0.13, hold: 0.1, peak: 0.36 },
  { frequency: 783.99, at: 0.26, hold: 0.1, peak: 0.36 },
  { frequency: 1046.5, at: 0.39, hold: 0.3, peak: 0.34, release: 0.6 },
  { frequency: 523.25, at: 0.39, hold: 0.3, peak: 0.2, type: 'triangle', release: 0.6 },
  { frequency: 659.25, at: 0.39, hold: 0.3, peak: 0.16, type: 'triangle', release: 0.6 },
]

function setMuted(value: boolean): void {
  muted.value = value
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Stockage indisponible : l'état reste valable pour la session.
  }
  if (!value) play(SELECT)
}

export interface QcmSound {
  /** État muet, en lecture seule. Modifier avec `toggleMute` ou `setMuted`. */
  muted: Readonly<typeof muted>
  playSelect: () => void
  playCorrect: () => void
  playSoft: () => void
  playComplete: () => void
  toggleMute: () => void
  setMuted: (value: boolean) => void
}

export function useQcmSound(): QcmSound {
  return {
    muted: readonly(muted),
    playSelect: () => play(SELECT),
    playCorrect: () => play(CORRECT),
    playSoft: () => play(SOFT),
    playComplete: () => play(COMPLETE),
    toggleMute: () => setMuted(!muted.value),
    setMuted,
  }
}
```

#### `packages/ui/src/composables/useQcmTheme.ts`

```ts
import { readonly, ref } from 'vue'

export type QcmTheme = 'light' | 'dark'

const STORAGE_KEY = 'qcm:theme'

function initialTheme(): QcmTheme {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Stockage indisponible : on suit le système.
  }
  const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  return prefersDark ? 'dark' : 'light'
}

const theme = ref<QcmTheme>(initialTheme())

function apply(value: QcmTheme): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = value
}

apply(theme.value)

function setTheme(value: QcmTheme): void {
  theme.value = value
  apply(value)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value)
  } catch {
    // Stockage indisponible : le thème reste valable pour la session.
  }
}

/** Thème clair/sombre partagé, conservé dans localStorage, appliqué sur <html data-theme>. */
export function useQcmTheme() {
  return {
    theme: readonly(theme),
    setTheme,
    toggleTheme: () => setTheme(theme.value === 'dark' ? 'light' : 'dark'),
  }
}
```

#### `packages/ui/src/composables/useQcmPlayer.ts`

```ts
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { correctIndexOf, type QcmData, type QcmQuestion } from '@qcm/core'

/**
 * Machine à états du lecteur QCM.
 *
 *   intro ──start──▶ answering ──validate(bonne)──▶ correct ──next──▶ answering | done
 *                        │  ▲
 *        validate(autre) │  │ retry / select
 *                        ▼  │
 *                       retry ──reveal──▶ revealed ──next──▶ answering | done
 *
 * Aucun score, aucun chronomètre : une erreur mène à « retry », jamais à un échec.
 */
export type QcmPhase = 'intro' | 'answering' | 'retry' | 'correct' | 'revealed' | 'done'

export interface QcmPlayerSounds {
  playSelect?: () => void
  playCorrect?: () => void
  playSoft?: () => void
  playComplete?: () => void
}

export function useQcmPlayer(source: MaybeRefOrGetter<QcmData>, sounds: QcmPlayerSounds = {}) {
  const phase = ref<QcmPhase>('intro')
  const index = ref(0)
  const selectedIndex = ref<number | null>(null)
  /** Réponses déjà essayées sur la question en cours : elles restent grisées. */
  const triedIndexes = ref<number[]>([])

  const questions = computed<QcmQuestion[]>(() => toValue(source).questions)
  const total = computed(() => questions.value.length)
  const question = computed<QcmQuestion | undefined>(() => questions.value[index.value])
  const correctIndex = computed(() => (question.value ? correctIndexOf(question.value) : -1))
  const isLast = computed(() => index.value >= total.value - 1)

  function resetQuestion(): void {
    selectedIndex.value = null
    triedIndexes.value = []
  }

  function start(): void {
    index.value = 0
    resetQuestion()
    phase.value = 'answering'
  }

  function select(choiceIndex: number): void {
    if (phase.value !== 'answering' && phase.value !== 'retry') return
    const choices = question.value?.choices ?? []
    if (choiceIndex < 0 || choiceIndex >= choices.length) return
    if (triedIndexes.value.includes(choiceIndex)) return
    selectedIndex.value = choiceIndex
    phase.value = 'answering'
    sounds.playSelect?.()
  }

  function validate(): void {
    if (phase.value !== 'answering' || selectedIndex.value === null) return
    if (selectedIndex.value === correctIndex.value) {
      phase.value = 'correct'
      sounds.playCorrect?.()
      return
    }
    triedIndexes.value = [...triedIndexes.value, selectedIndex.value]
    selectedIndex.value = null
    phase.value = 'retry'
    sounds.playSoft?.()
  }

  function retry(): void {
    if (phase.value === 'retry') phase.value = 'answering'
  }

  /** « Voir la réponse » : montre la bonne réponse, sans pénalité. */
  function reveal(): void {
    if (phase.value !== 'retry' && phase.value !== 'answering') return
    selectedIndex.value = null
    phase.value = 'revealed'
  }

  function next(): void {
    if (phase.value !== 'correct' && phase.value !== 'revealed') return
    if (isLast.value) {
      phase.value = 'done'
      sounds.playComplete?.()
      return
    }
    index.value += 1
    resetQuestion()
    phase.value = 'answering'
  }

  function restart(): void {
    index.value = 0
    resetQuestion()
    phase.value = 'intro'
  }

  /** Action principale de l'écran courant (touches Entrée et Espace). */
  function primary(): void {
    switch (phase.value) {
      case 'intro':
        return start()
      case 'answering':
        return validate()
      case 'retry':
        return retry()
      case 'correct':
      case 'revealed':
        return next()
      case 'done':
        return
    }
  }

  /**
   * Raccourcis clavier : 1-4 ou A-D pour choisir, Entrée ou Espace pour l'action principale.
   * Retourne `true` si la touche a été utilisée (l'appelant fait alors `preventDefault`).
   */
  function handleKey(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return false
    const target = event.target as Element | null
    const inside = (selector: string): boolean =>
      typeof target?.closest === 'function' && target.closest(selector) !== null
    if (inside('input, textarea, select, [contenteditable="true"]')) return false

    if (event.key === 'Enter' || event.key === ' ') {
      // Un bouton qui a le focus garde son comportement natif, sauf une réponse (role="radio") :
      // après un clic sur une réponse, Entrée doit valider et non re-sélectionner.
      if (inside('button:not([role="radio"]), a[href]')) return false
      if (phase.value === 'done') return false
      primary()
      return true
    }

    if (phase.value !== 'answering' && phase.value !== 'retry') return false
    const key = event.key.toLowerCase()
    const byDigit = ['1', '2', '3', '4'].indexOf(key)
    const choiceIndex = byDigit >= 0 ? byDigit : ['a', 'b', 'c', 'd'].indexOf(key)
    if (choiceIndex < 0) return false
    select(choiceIndex)
    return true
  }

  return {
    phase,
    index,
    total,
    question,
    selectedIndex,
    triedIndexes,
    correctIndex,
    isLast,
    start,
    select,
    validate,
    retry,
    reveal,
    next,
    restart,
    primary,
    handleKey,
  }
}
```

#### `packages/ui/src/components/QcmIntroCard.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { LEVEL_LABELS, SUBJECT_LABELS, type QcmMeta } from '@qcm/core'

const props = defineProps<{
  meta: QcmMeta
  questionCount: number
  hasImages: boolean
}>()

const emit = defineEmits<{ start: [] }>()

const facts = computed(() => [
  { label: 'Matière', value: SUBJECT_LABELS[props.meta.subject] },
  { label: 'Niveau', value: LEVEL_LABELS[props.meta.level] },
  { label: 'Chapitre', value: props.meta.chapter },
  { label: 'Questions', value: props.questionCount === 1 ? '1 question' : `${props.questionCount} questions` },
  { label: 'Images', value: props.hasImages ? 'Avec images' : 'Sans image' },
])
</script>

<template>
  <section class="qcm-card mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8" aria-labelledby="qcm-intro-title">
    <h1 id="qcm-intro-title" class="text-3xl leading-tight font-extrabold text-ink">{{ meta.title }}</h1>
    <p v-if="meta.description" class="text-ink-soft">{{ meta.description }}</p>

    <dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div
        v-for="fact in facts"
        :key="fact.label"
        class="rounded-2xl border-2 border-line bg-bg px-4 py-3"
      >
        <dt class="text-sm font-semibold text-ink-soft">{{ fact.label }}</dt>
        <dd class="text-lg font-bold text-ink">{{ fact.value }}</dd>
      </div>
    </dl>

    <button type="button" class="qcm-block qcm-block-primary w-full text-xl" @click="emit('start')">
      Commencer
      <span class="qcm-key" aria-hidden="true">Entrée</span>
    </button>
  </section>
</template>
```

#### `packages/ui/src/components/QcmQuestionCard.vue`

```vue
<script setup lang="ts">
defineProps<{
  /** Index de la question, à partir de 0. */
  index: number
  total: number
  prompt: string
  /** URL affichable de l'image (déjà résolue), ou `undefined` s'il n'y a pas d'image. */
  imageUrl?: string
}>()
</script>

<template>
  <section class="qcm-card mx-auto flex w-full max-w-3xl flex-col gap-5 p-5 sm:p-7" aria-labelledby="qcm-question-prompt">
    <header class="flex flex-col gap-2">
      <p class="text-base font-bold text-ink-soft">Question {{ index + 1 }} sur {{ total }}</p>
      <div class="flex gap-1.5" aria-hidden="true">
        <span
          v-for="step in total"
          :key="step"
          class="h-2.5 flex-1 rounded-full border-2 border-line"
          :class="step <= index ? 'bg-correct' : step === index + 1 ? 'bg-primary' : 'bg-sunken'"
        />
      </div>
    </header>

    <h2 id="qcm-question-prompt" class="text-2xl leading-snug font-extrabold text-ink">{{ prompt }}</h2>

    <img
      v-if="imageUrl"
      :src="imageUrl"
      alt="Image de la question"
      class="max-h-80 w-full rounded-2xl border-2 border-line bg-bg object-contain"
      draggable="false"
    />

    <slot />
  </section>
</template>
```

#### `packages/ui/src/components/QcmChoiceGrid.vue`

```vue
<script setup lang="ts">
const props = defineProps<{
  choices: readonly { text: string }[]
  selectedIndex: number | null
  /** Réponses déjà essayées : grisées et non cliquables. */
  triedIndexes: readonly number[]
  /** Si renseigné, la bonne réponse est mise en avant et toute la grille est figée. */
  correctIndex: number | null
  /** Fige la grille sans montrer la bonne réponse. */
  locked?: boolean
}>()

const emit = defineEmits<{ select: [index: number] }>()

const LETTERS = ['A', 'B', 'C', 'D'] as const
const BADGES = ['bg-badge-a', 'bg-badge-b', 'bg-badge-c', 'bg-badge-d'] as const

function isDisabled(index: number): boolean {
  return props.locked === true || props.correctIndex !== null || props.triedIndexes.includes(index)
}

function stateClass(index: number): string {
  if (props.correctIndex === index) return 'bg-correct text-correct-ink'
  if (props.triedIndexes.includes(index)) return 'border-dashed opacity-55 shadow-none'
  if (props.correctIndex !== null) return 'opacity-55 shadow-none'
  if (props.selectedIndex === index) return 'bg-selected translate-x-[2px] translate-y-[2px] shadow-block-sm'
  return ''
}
</script>

<template>
  <div role="radiogroup" aria-label="Réponses possibles" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <button
      v-for="(choice, index) in choices"
      :key="index"
      type="button"
      role="radio"
      class="qcm-block w-full"
      :class="stateClass(index)"
      :aria-checked="selectedIndex === index"
      :disabled="isDisabled(index)"
      @click="emit('select', index)"
    >
      <span class="qcm-key" :class="BADGES[index]" aria-hidden="true">{{ LETTERS[index] }}</span>
      <span class="flex-1">{{ choice.text }}</span>
      <span v-if="correctIndex === index" class="text-sm font-bold">Bonne réponse</span>
      <span v-else-if="triedIndexes.includes(index)" class="text-sm font-semibold">Déjà essayée</span>
    </button>
  </div>
</template>
```

#### `packages/ui/src/components/QcmFeedbackBanner.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** `correct` : bonne réponse. `retry` : pas encore. `revealed` : la réponse est montrée. */
  kind: 'correct' | 'retry' | 'revealed'
  /** Explication (correct, revealed) ou indice (retry). */
  text?: string
  /** Dernière question : le bouton dit « Terminer ». */
  isLast?: boolean
}>()

const emit = defineEmits<{
  continue: []
  retry: []
  reveal: []
}>()

const title = computed(() => {
  if (props.kind === 'correct') return 'Bonne réponse.'
  if (props.kind === 'retry') return 'Pas encore.'
  return 'Voici la bonne réponse.'
})

const tone = computed(() =>
  props.kind === 'retry' ? 'bg-retry text-retry-ink' : props.kind === 'correct' ? 'bg-correct text-correct-ink' : 'bg-selected text-ink',
)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div role="status" aria-live="polite" class="rounded-2xl border-2 border-line px-5 py-4" :class="tone">
      <p class="text-xl font-extrabold">{{ title }}</p>
      <p v-if="text" class="mt-1 text-lg font-medium">{{ text }}</p>
      <p v-else-if="kind === 'retry'" class="mt-1 text-lg font-medium">Tu peux essayer une autre réponse.</p>
    </div>

    <div v-if="kind === 'retry'" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <button type="button" class="qcm-block qcm-block-primary" @click="emit('retry')">
        Réessayer
        <span class="qcm-key" aria-hidden="true">Entrée</span>
      </button>
      <button type="button" class="qcm-block qcm-block-quiet" @click="emit('reveal')">Voir la réponse</button>
    </div>
    <button v-else type="button" class="qcm-block qcm-block-primary w-full" @click="emit('continue')">
      {{ isLast ? 'Terminer' : 'Continuer' }}
      <span class="qcm-key" aria-hidden="true">Entrée</span>
    </button>
  </div>
</template>
```

#### `packages/ui/src/components/QcmCompletionScreen.vue`

```vue
<script setup lang="ts">
defineProps<{
  title: string
  questionCount: number
  /** Affiche le bouton « Fermer » (lecteur desktop, aperçu web). */
  closable?: boolean
}>()

const emit = defineEmits<{
  restart: []
  close: []
}>()
</script>

<template>
  <section class="qcm-card mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 text-center sm:p-8" aria-labelledby="qcm-done-title">
    <h1 id="qcm-done-title" class="text-3xl font-extrabold text-ink">C'est terminé.</h1>
    <p class="text-lg text-ink">
      Tu as vu {{ questionCount === 1 ? 'la question' : `les ${questionCount} questions` }} de
      <strong class="font-bold">« {{ title }} »</strong>.
    </p>
    <div class="grid grid-cols-1 gap-4" :class="closable ? 'sm:grid-cols-2' : ''">
      <button
        type="button"
        class="qcm-block"
        :class="closable ? 'qcm-block-quiet' : 'qcm-block-primary'"
        @click="emit('restart')"
      >
        Recommencer
      </button>
      <button v-if="closable" type="button" class="qcm-block qcm-block-primary" @click="emit('close')">Fermer</button>
    </div>
  </section>
</template>
```

#### `packages/ui/src/components/QcmPlayer.vue`

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { summarizeQcm, type QcmData } from '@qcm/core'
import { useQcmPlayer } from '../composables/useQcmPlayer.ts'
import { useQcmSound } from '../composables/useQcmSound.ts'
import QcmChoiceGrid from './QcmChoiceGrid.vue'
import QcmCompletionScreen from './QcmCompletionScreen.vue'
import QcmFeedbackBanner from './QcmFeedbackBanner.vue'
import QcmIntroCard from './QcmIntroCard.vue'
import QcmQuestionCard from './QcmQuestionCard.vue'

const props = withDefaults(
  defineProps<{
    qcm: QcmData
    /** Transforme un chemin `media/x.webp` en URL affichable (protocole `qcm://`, blob:, etc.). */
    resolveMedia?: (path: string) => string | undefined
    /** Affiche « Fermer » sur l'écran de fin. */
    closable?: boolean
    /** Écoute le clavier sur `window`. Mettre `false` quand le lecteur est intégré dans un formulaire. */
    keyboard?: boolean
  }>(),
  { resolveMedia: undefined, closable: false, keyboard: true },
)

const emit = defineEmits<{
  close: []
  complete: []
}>()

const sound = useQcmSound()
const player = useQcmPlayer(() => props.qcm, sound)
const { phase, index, total, question, selectedIndex, triedIndexes, correctIndex, isLast } = player

const summary = computed(() => summarizeQcm(props.qcm))
const imageUrl = computed(() => {
  const path = question.value?.image
  return path ? props.resolveMedia?.(path) : undefined
})
const resolved = computed(() => phase.value === 'correct' || phase.value === 'revealed')
const feedbackText = computed(() => (phase.value === 'retry' ? question.value?.hint : question.value?.explanation))

// Un nouveau fichier remet le lecteur sur l'écran d'accueil.
watch(() => props.qcm, () => player.restart())
watch(phase, (value) => {
  if (value === 'done') emit('complete')
})

function onKeydown(event: KeyboardEvent): void {
  if (player.handleKey(event)) event.preventDefault()
}

onMounted(() => {
  if (props.keyboard) window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="w-full">
    <QcmIntroCard
      v-if="phase === 'intro'"
      :meta="qcm.meta"
      :question-count="summary.questionCount"
      :has-images="summary.hasImages"
      @start="player.start()"
    />

    <QcmCompletionScreen
      v-else-if="phase === 'done'"
      :title="qcm.meta.title"
      :question-count="summary.questionCount"
      :closable="closable"
      @restart="player.restart()"
      @close="emit('close')"
    />

    <QcmQuestionCard
      v-else-if="question"
      :key="question.id"
      :index="index"
      :total="total"
      :prompt="question.prompt"
      :image-url="imageUrl"
    >
      <QcmChoiceGrid
        :choices="question.choices"
        :selected-index="selectedIndex"
        :tried-indexes="triedIndexes"
        :correct-index="resolved ? correctIndex : null"
        @select="player.select($event)"
      />

      <QcmFeedbackBanner
        v-if="phase !== 'answering'"
        :kind="phase === 'retry' ? 'retry' : phase === 'correct' ? 'correct' : 'revealed'"
        :text="feedbackText"
        :is-last="isLast"
        @continue="player.next()"
        @retry="player.retry()"
        @reveal="player.reveal()"
      />
      <button
        v-else
        type="button"
        class="qcm-block qcm-block-primary w-full"
        :class="selectedIndex === null ? 'opacity-55 shadow-none' : ''"
        :disabled="selectedIndex === null"
        @click="player.validate()"
      >
        Valider
        <span class="qcm-key" aria-hidden="true">Entrée</span>
      </button>
    </QcmQuestionCard>
  </div>
</template>
```

#### `packages/ui/src/components/QcmSoundToggle.vue`

```vue
<script setup lang="ts">
import { useQcmSound } from '../composables/useQcmSound.ts'

const { muted, toggleMute } = useQcmSound()
</script>

<template>
  <button
    type="button"
    class="qcm-icon-button"
    :aria-pressed="muted"
    :aria-label="muted ? 'Activer le son' : 'Couper le son'"
    :title="muted ? 'Activer le son' : 'Couper le son'"
    @click="toggleMute"
  >
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" />
      <template v-if="muted">
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      </template>
      <template v-else>
        <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />
      </template>
    </svg>
  </button>
</template>
```

#### `packages/ui/src/components/QcmThemeToggle.vue`

```vue
<script setup lang="ts">
import { useQcmTheme } from '../composables/useQcmTheme.ts'

const { theme, toggleTheme } = useQcmTheme()
</script>

<template>
  <button
    type="button"
    class="qcm-icon-button"
    :aria-pressed="theme === 'dark'"
    :aria-label="theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'"
    :title="theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'"
    @click="toggleTheme"
  >
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path v-if="theme === 'dark'" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      <template v-else>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </template>
    </svg>
  </button>
</template>
```

#### `packages/ui/src/index.ts`

```ts
export { default as QcmIntroCard } from './components/QcmIntroCard.vue'
export { default as QcmQuestionCard } from './components/QcmQuestionCard.vue'
export { default as QcmChoiceGrid } from './components/QcmChoiceGrid.vue'
export { default as QcmFeedbackBanner } from './components/QcmFeedbackBanner.vue'
export { default as QcmCompletionScreen } from './components/QcmCompletionScreen.vue'
export { default as QcmPlayer } from './components/QcmPlayer.vue'
export { default as QcmSoundToggle } from './components/QcmSoundToggle.vue'
export { default as QcmThemeToggle } from './components/QcmThemeToggle.vue'
export { useQcmSound, type QcmSound } from './composables/useQcmSound.ts'
export { useQcmTheme, type QcmTheme } from './composables/useQcmTheme.ts'
export { useQcmPlayer, type QcmPhase, type QcmPlayerSounds } from './composables/useQcmPlayer.ts'
```

#### `packages/ui/test/player.test.ts`

```ts
import { describe, expect, test } from 'bun:test'
import { validateQcm } from '@qcm/core'
import { useQcmPlayer } from '../src/composables/useQcmPlayer.ts'

const qcm = validateQcm({
  version: 1,
  meta: { title: 'Test', subject: 'maths', level: '6e', chapter: 'Chapitre 1' },
  questions: [
    {
      id: 'q1',
      prompt: 'Combien font 2 + 2 ?',
      choices: [{ text: '3' }, { text: '4', correct: true }, { text: '5' }],
      explanation: '2 + 2 = 4.',
    },
    {
      id: 'q2',
      prompt: 'Combien font 1 + 1 ?',
      choices: [{ text: '2', correct: true }, { text: '3' }],
      explanation: '1 + 1 = 2.',
    },
  ],
})

function key(value: string): KeyboardEvent {
  return { key: value, ctrlKey: false, altKey: false, metaKey: false, repeat: false, target: null } as unknown as KeyboardEvent
}

describe('useQcmPlayer', () => {
  test('parcours complet au clavier, avec une erreur puis un nouvel essai', () => {
    const played: string[] = []
    const player = useQcmPlayer(qcm, {
      playSelect: () => played.push('select'),
      playCorrect: () => played.push('correct'),
      playSoft: () => played.push('soft'),
      playComplete: () => played.push('complete'),
    })
    expect(player.phase.value).toBe('intro')
    expect(player.handleKey(key('Enter'))).toBe(true)
    expect(player.phase.value).toBe('answering')

    // Entrée sans sélection : rien ne se passe.
    player.handleKey(key('Enter'))
    expect(player.phase.value).toBe('answering')

    // Mauvaise réponse : phase « retry », la réponse essayée est grisée.
    player.handleKey(key('1'))
    expect(player.selectedIndex.value).toBe(0)
    player.handleKey(key(' '))
    expect(player.phase.value).toBe('retry')
    expect(player.triedIndexes.value).toEqual([0])
    expect(player.selectedIndex.value).toBeNull()

    // Une réponse déjà essayée ne peut plus être choisie.
    player.handleKey(key('a'))
    expect(player.selectedIndex.value).toBeNull()

    // Choisir une autre réponse relance directement la question.
    player.handleKey(key('B'))
    expect(player.phase.value).toBe('answering')
    player.handleKey(key('Enter'))
    expect(player.phase.value).toBe('correct')
    player.handleKey(key('Enter'))
    expect(player.index.value).toBe(1)
    expect(player.triedIndexes.value).toEqual([])

    // Touche hors plage : ignorée.
    expect(player.handleKey(key('4'))).toBe(true)
    expect(player.selectedIndex.value).toBeNull()

    player.handleKey(key('1'))
    player.handleKey(key('Enter'))
    expect(player.isLast.value).toBe(true)
    player.handleKey(key('Enter'))
    expect(player.phase.value).toBe('done')
    expect(played).toEqual(['select', 'soft', 'select', 'correct', 'select', 'correct', 'complete'])
  })

  test('« Voir la réponse » puis recommencer', () => {
    const player = useQcmPlayer(qcm)
    player.start()
    player.select(2)
    player.validate()
    player.retry()
    expect(player.phase.value).toBe('answering')
    player.reveal()
    expect(player.phase.value).toBe('revealed')
    expect(player.correctIndex.value).toBe(1)
    player.next()
    expect(player.index.value).toBe(1)
    player.restart()
    expect(player.phase.value).toBe('intro')
    expect(player.index.value).toBe(0)
  })
})
```


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

Autres entrées : bouton « Ouvrir un QCM » (dialogue natif) et glisser-déposer d'un fichier sur la fenêtre.

### 4.2 Frontend

#### `apps/desktop/package.json`

```json
{
  "name": "@qcm/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit -p tsconfig.json && vite build",
    "typecheck": "vue-tsc --noEmit -p tsconfig.json",
    "tauri": "tauri"
  },
  "dependencies": {
    "@qcm/core": "workspace:*",
    "@qcm/ui": "workspace:*",
    "@tauri-apps/api": "2.12.4",
    "@tauri-apps/plugin-dialog": "2.8.4",
    "vue": "3.5.45"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.3.5",
    "@tauri-apps/cli": "2.12.4",
    "@vitejs/plugin-vue": "6.0.11",
    "tailwindcss": "4.3.5",
    "typescript": "6.0.3",
    "vite": "8.3.8",
    "vue-tsc": "3.3.14"
  }
}
```

#### `apps/desktop/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

#### `apps/desktop/vite.config.ts`

```ts
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Configuration Vite pour Tauri 2 : port fixe 1420, pas d'effacement du terminal.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

#### `apps/desktop/index.html`

```html
<!doctype html>
<html lang="fr" data-theme="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>QCM</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

#### `apps/desktop/app-icon.svg`

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="64" y="64" width="896" height="896" rx="200" fill="#F6F1E7" stroke="#2B2D42" stroke-width="40"/>
  <g stroke="#2B2D42" stroke-width="32">
    <rect x="212" y="212" width="270" height="270" rx="64" fill="#BFD7EA"/>
    <rect x="542" y="212" width="270" height="270" rx="64" fill="#F7D6BF"/>
    <rect x="212" y="542" width="270" height="270" rx="64" fill="#CFE6CF"/>
    <rect x="542" y="542" width="270" height="270" rx="64" fill="#DCD3F5"/>
  </g>
  <path d="M282 680l48 48 88-104" fill="none" stroke="#1F4D2E" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

#### `apps/desktop/src/main.ts`

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
```

#### `apps/desktop/src/style.css`

```css
@import "tailwindcss";
@import "@qcm/ui/theme.css";
@source "../../../packages/ui/src";

/* Application de bureau : pas de sélection de texte accidentelle ni de défilement élastique. */
html,
body {
  overscroll-behavior: none;
  user-select: none;
}
```

#### `apps/desktop/src/lib/qcmFile.ts`

```ts
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import {
  QCM_ERROR_CODES,
  QcmFormatError,
  parseQcmYaml,
  summarizeQcm,
  type QcmData,
  type QcmErrorCode,
} from '@qcm/core'

/** Réponse de la commande Rust `load_qcm`. */
interface LoadedQcmPayload {
  path: string
  fileName: string
  yaml: string
  /** Chemins `media/x.webp` disponibles via le protocole `qcm://`. */
  media: string[]
}

export interface OpenedQcm {
  path: string
  fileName: string
  data: QcmData
}

const OPEN_FILE_EVENT = 'qcm-open-file'

function toErrorCode(value: unknown): QcmErrorCode {
  return QCM_ERROR_CODES.includes(value as QcmErrorCode) ? (value as QcmErrorCode) : 'E_OPEN'
}

/** Charge un fichier `.qcm` : Rust dézippe, `@qcm/core` valide le YAML. */
export async function loadQcm(path: string): Promise<OpenedQcm> {
  let payload: LoadedQcmPayload
  try {
    payload = await invoke<LoadedQcmPayload>('load_qcm', { path })
  } catch (code) {
    throw new QcmFormatError(toErrorCode(code))
  }
  const data = parseQcmYaml(payload.yaml)
  const missing = summarizeQcm(data).imagePaths.filter((image) => !payload.media.includes(image))
  if (missing.length > 0) throw new QcmFormatError('E_MEDIA_MISSING', missing)
  return { path: payload.path, fileName: payload.fileName, data }
}

/** `media/x.webp` → URL servie par le protocole Rust `qcm://` (http://qcm.localhost/ sous Windows). */
export function resolveMedia(path: string): string {
  return convertFileSrc(path, 'qcm')
}

/** Chemin reçu au lancement (double-clic dans l'Explorateur) ou à chaud. `null` s'il n'y en a pas. */
export function takePendingFile(): Promise<string | null> {
  return invoke<string | null>('take_pending_file')
}

/** Prévenu quand une deuxième instance a transmis un fichier à ouvrir. */
export function onOpenFileRequest(handler: () => void): Promise<UnlistenFn> {
  return listen(OPEN_FILE_EVENT, () => handler())
}

/** Glisser-déposer d'un fichier `.qcm` sur la fenêtre. */
export function onQcmFileDrop(handler: (path: string) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type !== 'drop') return
    const path = event.payload.paths.find((candidate) => candidate.toLowerCase().endsWith('.qcm'))
    if (path) handler(path)
  })
}

/** Boîte de dialogue native « Ouvrir ». */
export async function pickQcmFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: 'Ouvrir un QCM',
    filters: [{ name: 'QCM', extensions: ['qcm'] }],
  })
  return typeof selected === 'string' ? selected : null
}
```

#### `apps/desktop/src/App.vue`

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { QcmFormatError } from '@qcm/core'
import { QcmPlayer, QcmSoundToggle, QcmThemeToggle } from '@qcm/ui'
import {
  loadQcm,
  onOpenFileRequest,
  onQcmFileDrop,
  pickQcmFile,
  resolveMedia,
  takePendingFile,
  type OpenedQcm,
} from './lib/qcmFile.ts'

type View = 'home' | 'loading' | 'player' | 'error'

const view = ref<View>('loading')
const opened = shallowRef<OpenedQcm | null>(null)
const errorMessage = ref('')
const errorDetails = ref<string[]>([])
/** Change à chaque ouverture : force un lecteur neuf, même pour le même fichier. */
const openCount = ref(0)
const unlisten: Array<() => void> = []

async function openPath(path: string): Promise<void> {
  view.value = 'loading'
  try {
    opened.value = await loadQcm(path)
    openCount.value += 1
    view.value = 'player'
  } catch (error) {
    opened.value = null
    if (error instanceof QcmFormatError) {
      errorMessage.value = error.message
      errorDetails.value = error.details.slice(0, 5)
    } else {
      errorMessage.value = 'Ce fichier ne peut pas être ouvert.'
      errorDetails.value = []
    }
    view.value = 'error'
  }
}

async function openPending(): Promise<boolean> {
  const path = await takePendingFile()
  if (!path) return false
  await openPath(path)
  return true
}

async function chooseFile(): Promise<void> {
  const path = await pickQcmFile()
  if (path) await openPath(path)
}

function goHome(): void {
  opened.value = null
  view.value = 'home'
}

onMounted(async () => {
  unlisten.push(await onOpenFileRequest(() => void openPending()))
  unlisten.push(await onQcmFileDrop((path) => void openPath(path)))
  if (!(await openPending())) view.value = 'home'
})

onBeforeUnmount(() => {
  for (const stop of unlisten) stop()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg text-ink">
    <header class="flex items-center justify-between gap-4 px-6 py-4">
      <p class="truncate text-base font-bold text-ink-soft">
        {{ view === 'player' && opened ? opened.fileName : 'QCM' }}
      </p>
      <div class="flex items-center gap-3">
        <button v-if="view === 'player'" type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" @click="goHome">
          Fermer le QCM
        </button>
        <QcmSoundToggle />
        <QcmThemeToggle />
      </div>
    </header>

    <main class="flex flex-1 items-center justify-center px-6 pb-10">
      <QcmPlayer
        v-if="view === 'player' && opened"
        :key="openCount"
        :qcm="opened.data"
        :resolve-media="resolveMedia"
        closable
        @close="goHome"
      />

      <section v-else-if="view === 'home'" class="qcm-card flex w-full max-w-xl flex-col gap-6 p-8 text-center">
        <h1 class="text-3xl font-extrabold">QCM</h1>
        <p class="text-lg text-ink-soft">Ouvre un fichier .qcm pour commencer. Tu peux aussi le glisser ici.</p>
        <button type="button" class="qcm-block qcm-block-primary w-full text-xl" @click="chooseFile">Ouvrir un QCM</button>
      </section>

      <section v-else-if="view === 'error'" class="qcm-card flex w-full max-w-xl flex-col gap-5 p-8" role="alert">
        <h1 class="text-2xl font-extrabold">Ce QCM ne s'ouvre pas.</h1>
        <p class="rounded-2xl border-2 border-line bg-retry px-5 py-4 text-lg font-medium text-retry-ink">{{ errorMessage }}</p>
        <ul v-if="errorDetails.length > 0" class="list-disc pl-6 text-base text-ink-soft select-text">
          <li v-for="detail in errorDetails" :key="detail">{{ detail }}</li>
        </ul>
        <button type="button" class="qcm-block qcm-block-primary w-full" @click="chooseFile">Ouvrir un autre QCM</button>
      </section>

      <p v-else class="text-lg font-bold text-ink-soft" role="status">Ouverture du QCM…</p>
    </main>
  </div>
</template>
```


### 4.3 Backend Rust et configuration Tauri

#### `apps/desktop/src-tauri/Cargo.toml`

```toml
[package]
name = "qcm-desktop"
version = "0.1.0"
description = "QCM - lecteur hors-ligne de fichiers .qcm"
edition = "2021"
rust-version = "1.80"
license = "MIT"

[lib]
name = "qcm_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.7", features = [] }

[dependencies]
tauri = { version = "2.12", features = [] }
tauri-plugin-dialog = "2.8"
tauri-plugin-single-instance = "2.5"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
percent-encoding = "2.3"
zip = { version = "9.5", default-features = false, features = ["deflate"] }

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true
```

#### `apps/desktop/src-tauri/build.rs`

```rust
fn main() {
    tauri_build::build()
}
```

#### `apps/desktop/src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "QCM",
  "version": "0.1.0",
  "identifier": "org.qcm.desktop",
  "build": {
    "beforeDevCommand": "bun run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "bun run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "QCM",
        "width": 1100,
        "height": 780,
        "minWidth": 720,
        "minHeight": 560,
        "center": true,
        "resizable": true,
        "dragDropEnabled": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: qcm: http://qcm.localhost; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "category": "Education",
    "shortDescription": "Lecteur de QCM hors-ligne",
    "longDescription": "QCM ouvre les fichiers .qcm et permet de réviser au calme, sans connexion, sans publicité et sans chronomètre.",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "fileAssociations": [
      {
        "ext": ["qcm"],
        "name": "QCM",
        "description": "Questionnaire QCM",
        "mimeType": "application/x-qcm",
        "role": "Viewer"
      }
    ],
    "windows": {
      "webviewInstallMode": { "type": "embedBootstrapper" },
      "nsis": {
        "installMode": "currentUser",
        "languages": ["French"],
        "displayLanguageSelector": false
      },
      "wix": {
        "language": "fr-FR"
      }
    }
  }
}
```

#### `apps/desktop/src-tauri/capabilities/default.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permissions de la fenêtre principale du lecteur QCM.",
  "windows": ["main"],
  "permissions": ["core:default", "dialog:allow-open"]
}
```

#### `apps/desktop/src-tauri/src/main.rs`

```rust
// Pas de console noire derrière la fenêtre sous Windows en version finale.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    qcm_desktop_lib::run()
}
```

#### `apps/desktop/src-tauri/src/lib.rs`

```rust
//! Backend du lecteur QCM.
//!
//! Rôle volontairement réduit : ouvrir l'archive `.qcm`, renvoyer le texte brut de `data.yaml`
//! au frontend (qui le valide avec `@qcm/core`, seule source de vérité du schéma) et servir les
//! images `media/*.webp` par le protocole `qcm://`.

use std::{
    collections::HashMap,
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::{http, AppHandle, Emitter, Manager, State};
use zip::ZipArchive;

/// Évènement envoyé au frontend quand un fichier attend d'être ouvert (`take_pending_file`).
const OPEN_FILE_EVENT: &str = "qcm-open-file";

// Mêmes limites que `ARCHIVE_LIMITS` dans `@qcm/core`.
const MAX_ARCHIVE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_DATA_BYTES: u64 = 1024 * 1024;
const MAX_MEDIA_BYTES: u64 = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 60 * 1024 * 1024;
const DATA_FILE: &str = "data.yaml";

/// Codes d'erreur partagés avec `QcmErrorCode` de `@qcm/core`.
#[derive(Debug, PartialEq, Eq)]
pub enum QcmError {
    Open,
    NotZip,
    NoData,
    TooBig,
    MediaInvalid,
}

impl QcmError {
    pub fn code(&self) -> &'static str {
        match self {
            QcmError::Open => "E_OPEN",
            QcmError::NotZip => "E_NOT_ZIP",
            QcmError::NoData => "E_NO_DATA",
            QcmError::TooBig => "E_TOO_BIG",
            QcmError::MediaInvalid => "E_MEDIA_INVALID",
        }
    }
}

#[derive(Default)]
pub struct AppState {
    /// Fichier reçu en argument, en attente de lecture par le frontend.
    pending_path: Mutex<Option<String>>,
    /// Images du QCM ouvert. Clé : `media/nom.webp`.
    media: Mutex<HashMap<String, Vec<u8>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedQcm {
    path: String,
    file_name: String,
    yaml: String,
    media: Vec<String>,
}

/// Contenu utile d'une archive `.qcm`.
#[derive(Debug)]
pub struct QcmContent {
    pub yaml: String,
    pub media: HashMap<String, Vec<u8>>,
}

/// Premier argument qui ressemble à un fichier `.qcm` (le premier élément, l'exécutable, est ignoré).
/// Un chemin relatif est résolu par rapport à `cwd`.
pub fn qcm_path_from_args<I, S>(args: I, cwd: Option<&Path>) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().skip(1).find_map(|arg| {
        let arg = arg.as_ref();
        if arg.starts_with('-') || !arg.to_lowercase().ends_with(".qcm") {
            return None;
        }
        let path = PathBuf::from(arg);
        let path = match cwd {
            Some(cwd) if path.is_relative() => cwd.join(path),
            _ => path,
        };
        Some(path.to_string_lossy().into_owned())
    })
}

/// `media/<nom>.webp` avec `<nom>` de 1 à 64 caractères parmi `a-z 0-9 _ -`, sans commencer par `_` ou `-`.
pub fn is_media_path(name: &str) -> bool {
    let Some(stem) = name
        .strip_prefix("media/")
        .and_then(|rest| rest.strip_suffix(".webp"))
    else {
        return false;
    };
    let valid_char = |c: char| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-';
    let first_ok = stem
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    first_ok && stem.len() <= 64 && stem.chars().all(valid_char)
}

fn is_webp(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP"
}

/// Lit une entrée en refusant de dépasser `limit` octets décompressés (protection anti « zip bomb »).
fn read_limited(entry: impl Read, limit: u64) -> Result<Vec<u8>, QcmError> {
    let mut buffer = Vec::new();
    entry
        .take(limit + 1)
        .read_to_end(&mut buffer)
        .map_err(|_| QcmError::NotZip)?;
    if buffer.len() as u64 > limit {
        return Err(QcmError::TooBig);
    }
    Ok(buffer)
}

/// Ouvre un fichier `.qcm` et en extrait `data.yaml` et les images autorisées. Tout le reste est ignoré.
pub fn read_qcm_file(path: &Path) -> Result<QcmContent, QcmError> {
    let file = File::open(path).map_err(|_| QcmError::Open)?;
    let size = file.metadata().map_err(|_| QcmError::Open)?.len();
    if size > MAX_ARCHIVE_BYTES {
        return Err(QcmError::TooBig);
    }
    let mut archive = ZipArchive::new(file).map_err(|_| QcmError::NotZip)?;

    let mut yaml: Option<String> = None;
    let mut media = HashMap::new();
    let mut total: u64 = 0;

    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|_| QcmError::NotZip)?;
        // Nom illisible (encodage invalide) : entrée ignorée.
        let name = match entry.name() {
            Ok(name) => name.into_owned(),
            Err(_) => continue,
        };
        let limit = if name == DATA_FILE {
            MAX_DATA_BYTES
        } else if is_media_path(&name) {
            MAX_MEDIA_BYTES
        } else {
            continue;
        };
        let bytes = read_limited(entry, limit)?;
        total += bytes.len() as u64;
        if total > MAX_TOTAL_BYTES {
            return Err(QcmError::TooBig);
        }
        if name == DATA_FILE {
            yaml = Some(String::from_utf8(bytes).map_err(|_| QcmError::NoData)?);
        } else {
            if !is_webp(&bytes) {
                return Err(QcmError::MediaInvalid);
            }
            media.insert(name, bytes);
        }
    }

    Ok(QcmContent {
        yaml: yaml.ok_or(QcmError::NoData)?,
        media,
    })
}

/// Charge un `.qcm` : renvoie le YAML brut et garde les images en mémoire pour `qcm://`.
#[tauri::command(async)]
fn load_qcm(path: String, state: State<'_, AppState>) -> Result<LoadedQcm, String> {
    let content = read_qcm_file(Path::new(&path)).map_err(|error| error.code().to_string())?;
    let mut names: Vec<String> = content.media.keys().cloned().collect();
    names.sort();
    *state.media.lock().expect("verrou media") = content.media;
    let file_name = Path::new(&path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(LoadedQcm {
        path,
        file_name,
        yaml: content.yaml,
        media: names,
    })
}

/// Renvoie (une seule fois) le chemin reçu par double-clic, au lancement ou à chaud.
#[tauri::command]
fn take_pending_file(state: State<'_, AppState>) -> Option<String> {
    state.pending_path.lock().expect("verrou pending").take()
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Sert `qcm://localhost/media/x.webp` (Windows : `http://qcm.localhost/media/x.webp`).
fn serve_media(app: &AppHandle, request: &http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let raw = request.uri().path().trim_start_matches('/');
    let key = percent_decode_str(raw).decode_utf8_lossy();
    let state = app.state::<AppState>();
    let media = state.media.lock().expect("verrou media");
    let builder = http::Response::builder().header("Access-Control-Allow-Origin", "*");
    let response = match media.get(key.as_ref()) {
        Some(bytes) => builder
            .status(http::StatusCode::OK)
            .header(http::header::CONTENT_TYPE, "image/webp")
            .header(http::header::CACHE_CONTROL, "no-store")
            .body(bytes.clone()),
        None => builder.status(http::StatusCode::NOT_FOUND).body(Vec::new()),
    };
    response.expect("réponse HTTP valide")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Doit rester le PREMIER plugin : une 2e instance transmet ses arguments ici puis se ferme.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Some(path) = qcm_path_from_args(argv, Some(Path::new(&cwd))) {
                *app.state::<AppState>()
                    .pending_path
                    .lock()
                    .expect("verrou pending") = Some(path);
                let _ = app.emit(OPEN_FILE_EVENT, ());
            }
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .register_uri_scheme_protocol("qcm", |context, request| {
            serve_media(context.app_handle(), &request)
        })
        .setup(|app| {
            // Démarrage à froid : Windows lance `QCM.exe "C:\...\fichier.qcm"` au double-clic.
            let cwd = std::env::current_dir().ok();
            if let Some(path) = qcm_path_from_args(std::env::args(), cwd.as_deref()) {
                *app.state::<AppState>()
                    .pending_path
                    .lock()
                    .expect("verrou pending") = Some(path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_qcm, take_pending_file])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de QCM");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    const WEBP: &[u8] = b"RIFF\x04\x00\x00\x00WEBP\x00\x00\x00\x00";

    fn write_qcm(name: &str, entries: &[(&str, &[u8])]) -> PathBuf {
        let path = std::env::temp_dir().join(format!("qcm-test-{}-{name}.qcm", std::process::id()));
        let mut writer = zip::ZipWriter::new(File::create(&path).unwrap());
        for (entry, bytes) in entries {
            writer.start_file(*entry, SimpleFileOptions::default()).unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();
        path
    }

    #[test]
    fn finds_qcm_path_in_args() {
        let args = ["C:\\Program Files\\QCM\\QCM.exe", "--flag", "C:\\Users\\Léo\\Mes cours\\Fractions.QCM"];
        assert_eq!(
            qcm_path_from_args(args, None).as_deref(),
            Some("C:\\Users\\Léo\\Mes cours\\Fractions.QCM")
        );
        assert_eq!(qcm_path_from_args(["QCM.exe"], None), None);
        assert_eq!(qcm_path_from_args(["fichier.qcm"], None), None);
        assert_eq!(qcm_path_from_args(["QCM.exe", "notes.txt"], None), None);
    }

    #[test]
    fn resolves_relative_path_against_cwd() {
        let cwd = std::env::temp_dir();
        let found = qcm_path_from_args(["qcm", "cours.qcm"], Some(&cwd)).unwrap();
        assert_eq!(PathBuf::from(found), cwd.join("cours.qcm"));
    }

    #[test]
    fn validates_media_paths() {
        assert!(is_media_path("media/q1_schema.webp"));
        assert!(is_media_path("media/a.webp"));
        assert!(!is_media_path("media/Q1.webp"));
        assert!(!is_media_path("media/q1.png"));
        assert!(!is_media_path("media/../x.webp"));
        assert!(!is_media_path("media/sub/x.webp"));
        assert!(!is_media_path("media/.webp"));
        assert!(!is_media_path("media/_x.webp"));
        assert!(!is_media_path("x.webp"));
    }

    #[test]
    fn reads_archive_and_ignores_unknown_entries() {
        let path = write_qcm(
            "ok",
            &[
                ("data.yaml", b"version: 1\n"),
                ("media/q1_schema.webp", WEBP),
                ("media/virus.exe", b"x"),
                ("notes.txt", b"x"),
            ],
        );
        let content = read_qcm_file(&path).unwrap();
        assert_eq!(content.yaml, "version: 1\n");
        assert_eq!(content.media.keys().collect::<Vec<_>>(), vec!["media/q1_schema.webp"]);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn reports_error_codes() {
        let missing = std::env::temp_dir().join("qcm-test-absent.qcm");
        assert_eq!(read_qcm_file(&missing).unwrap_err(), QcmError::Open);

        let not_zip = std::env::temp_dir().join(format!("qcm-test-{}-notzip.qcm", std::process::id()));
        std::fs::write(&not_zip, b"pas un zip").unwrap();
        assert_eq!(read_qcm_file(&not_zip).unwrap_err(), QcmError::NotZip);
        std::fs::remove_file(not_zip).unwrap();

        let no_data = write_qcm("nodata", &[("autre.txt", b"x")]);
        assert_eq!(read_qcm_file(&no_data).unwrap_err(), QcmError::NoData);
        std::fs::remove_file(no_data).unwrap();

        let bad_media = write_qcm("badmedia", &[("data.yaml", b"version: 1\n"), ("media/q1.webp", b"PNG")]);
        assert_eq!(read_qcm_file(&bad_media).unwrap_err(), QcmError::MediaInvalid);
        std::fs::remove_file(bad_media).unwrap();

        let big = vec![b' '; (MAX_DATA_BYTES + 1) as usize];
        let too_big = write_qcm("toobig", &[("data.yaml", &big)]);
        assert_eq!(read_qcm_file(&too_big).unwrap_err(), QcmError::TooBig);
        std::fs::remove_file(too_big).unwrap();
        assert_eq!(QcmError::TooBig.code(), "E_TOO_BIG");
    }
}
```


### 4.4 Icônes et installateur

Les icônes ne sont pas écrites à la main. Depuis `apps/desktop` :

```bash
bun run tauri icon app-icon.svg
```

La commande remplit `src-tauri/icons/`. Supprimer ensuite les dossiers `src-tauri/icons/android` et `src-tauri/icons/ios` (inutiles).

Prérequis Linux pour `cargo check` / `cargo test` (Ubuntu 24.04) :

```bash
sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev libayatana-appindicator3-dev build-essential libssl-dev
```

Construction de l'installateur (Windows uniquement, ou via le workflow ci-dessous) : `bun run build:desktop`. Les fichiers sortent dans `apps/desktop/src-tauri/target/release/bundle/nsis/` et `.../msi/`.

#### `.github/workflows/release-desktop.yml`

```yaml
name: release-desktop

# Pousser un tag `v0.1.0` construit les installateurs Windows (.exe NSIS et .msi)
# et les attache à un brouillon de Release GitHub.
on:
  push:
    tags: ["v*"]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.4.4"
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: apps/desktop/src-tauri
      - run: bun install --frozen-lockfile
      - run: bun test
      - run: bun run typecheck
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          projectPath: apps/desktop
          tauriScript: bun run tauri
          tagName: ${{ github.ref_name }}
          releaseName: QCM ${{ github.ref_name }}
          releaseDraft: true
          prerelease: false
```


Vérification manuelle sur Windows 11 après installation : (1) double-clic sur un `.qcm` alors que QCM est fermé → l'écran d'accueil du QCM s'affiche ; (2) double-clic sur un autre `.qcm` alors que QCM est ouvert → la même fenêtre passe au premier plan et affiche le nouveau QCM ; (3) couper le réseau → tout fonctionne.

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

Les règles exactes (chaînes de filtre PocketBase) sont dans la migration ci-dessous. Un administrateur (superuser) contourne toutes les règles : il masque un QCM en passant `status` à `hidden`, ou un commentaire en cochant `hidden`, depuis le tableau de bord `/_/`.

Hooks serveur (`pb_hooks/main.pb.js`) :

1. `onBootstrap` : active le fournisseur Google à partir de `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
2. `onRecordCreateRequest` sur `qcms` : force `status = "published"`, `rating_avg = 0`, `rating_count = 0`.
3. Après création, modification ou suppression d'une note : recalcule `rating_avg` (1 décimale) et `rating_count` du QCM.

Limite connue : PocketBase ne peut pas ouvrir le ZIP côté serveur. Le fichier `.qcm` publié est limité à 20 Mo et au type `application/zip` ; son contenu est toujours revalidé par `@qcm/core` (web) et par Rust (desktop) avant affichage.

### 5.2 Fichiers

#### `backend/pb_migrations/1760000000_init_qcm.js`

```js
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
```

#### `backend/pb_hooks/main.pb.js`

```js
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

// 2. Création d'un QCM : statut et compteurs imposés par le serveur.
onRecordCreateRequest((e) => {
  e.record.set("status", "published")
  e.record.set("rating_avg", 0)
  e.record.set("rating_count", 0)
  e.next()
}, "qcms")

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
```

#### `backend/pb_schema.json`

```json
[
  {
    "id": "pbcqcms00000001",
    "type": "base",
    "name": "qcms",
    "listRule": "status = \"published\" || owner = @request.auth.id",
    "viewRule": "status = \"published\" || owner = @request.auth.id",
    "createRule": "@request.auth.id != \"\" && owner = @request.auth.id && @request.body.status:isset = false && @request.body.rating_avg:isset = false && @request.body.rating_count:isset = false",
    "updateRule": "owner = @request.auth.id && @request.body.owner:changed = false && @request.body.status:changed = false && @request.body.rating_avg:changed = false && @request.body.rating_count:changed = false",
    "deleteRule": "owner = @request.auth.id",
    "fields": [
      {
        "name": "owner",
        "type": "relation",
        "required": true,
        "maxSelect": 1,
        "collectionId": "_pb_users_auth_",
        "cascadeDelete": true
      },
      {
        "name": "title",
        "type": "text",
        "required": true,
        "min": 1,
        "max": 80,
        "presentable": true
      },
      {
        "name": "description",
        "type": "text",
        "max": 300
      },
      {
        "name": "subject",
        "type": "select",
        "required": true,
        "maxSelect": 1,
        "values": [
          "maths",
          "francais",
          "histoire-geo",
          "svt",
          "physique-chimie",
          "technologie",
          "anglais",
          "espagnol",
          "allemand",
          "emc",
          "arts",
          "musique",
          "autre"
        ]
      },
      {
        "name": "level",
        "type": "select",
        "required": true,
        "maxSelect": 1,
        "values": [
          "primaire",
          "6e",
          "5e",
          "4e",
          "3e",
          "lycee",
          "autre"
        ]
      },
      {
        "name": "chapter",
        "type": "text",
        "required": true,
        "min": 1,
        "max": 80
      },
      {
        "name": "language",
        "type": "text",
        "required": true,
        "pattern": "^[a-z]{2}$"
      },
      {
        "name": "question_count",
        "type": "number",
        "required": true,
        "min": 1,
        "max": 60,
        "onlyInt": true
      },
      {
        "name": "has_images",
        "type": "bool"
      },
      {
        "name": "file",
        "type": "file",
        "required": true,
        "maxSelect": 1,
        "maxSize": 20971520,
        "mimeTypes": [
          "application/zip"
        ]
      },
      {
        "name": "thumbnail",
        "type": "file",
        "maxSelect": 1,
        "maxSize": 3145728,
        "mimeTypes": [
          "image/webp"
        ],
        "thumbs": [
          "480x270"
        ]
      },
      {
        "name": "status",
        "type": "select",
        "maxSelect": 1,
        "values": [
          "published",
          "hidden"
        ]
      },
      {
        "name": "rating_avg",
        "type": "number",
        "min": 0,
        "max": 5
      },
      {
        "name": "rating_count",
        "type": "number",
        "min": 0,
        "onlyInt": true
      },
      {
        "name": "created",
        "type": "autodate",
        "onCreate": true,
        "onUpdate": false
      },
      {
        "name": "updated",
        "type": "autodate",
        "onCreate": true,
        "onUpdate": true
      }
    ],
    "indexes": [
      "CREATE INDEX idx_qcms_browse ON qcms (status, subject, level)",
      "CREATE INDEX idx_qcms_owner ON qcms (owner)",
      "CREATE INDEX idx_qcms_created ON qcms (created)"
    ]
  },
  {
    "id": "pbcratings00001",
    "type": "base",
    "name": "ratings",
    "listRule": "user = @request.auth.id",
    "viewRule": "user = @request.auth.id",
    "createRule": "@request.auth.id != \"\" && user = @request.auth.id && qcm.status = \"published\"",
    "updateRule": "user = @request.auth.id && @request.body.user:changed = false && @request.body.qcm:changed = false",
    "deleteRule": "user = @request.auth.id",
    "fields": [
      {
        "name": "qcm",
        "type": "relation",
        "required": true,
        "maxSelect": 1,
        "collectionId": "pbcqcms00000001",
        "cascadeDelete": true
      },
      {
        "name": "user",
        "type": "relation",
        "required": true,
        "maxSelect": 1,
        "collectionId": "_pb_users_auth_",
        "cascadeDelete": true
      },
      {
        "name": "value",
        "type": "number",
        "required": true,
        "min": 1,
        "max": 5,
        "onlyInt": true
      },
      {
        "name": "created",
        "type": "autodate",
        "onCreate": true,
        "onUpdate": false
      },
      {
        "name": "updated",
        "type": "autodate",
        "onCreate": true,
        "onUpdate": true
      }
    ],
    "indexes": [
      "CREATE UNIQUE INDEX idx_ratings_unique ON ratings (qcm, user)"
    ]
  },
  {
    "id": "pbccomments0001",
    "type": "base",
    "name": "comments",
    "listRule": "hidden = false || user = @request.auth.id",
    "viewRule": "hidden = false || user = @request.auth.id",
    "createRule": "@request.auth.id != \"\" && user = @request.auth.id && qcm.status = \"published\" && @request.body.hidden:isset = false",
    "updateRule": "user = @request.auth.id && @request.body.user:changed = false && @request.body.qcm:changed = false && @request.body.hidden:changed = false",
    "deleteRule": "user = @request.auth.id",
    "fields": [
      {
        "name": "qcm",
        "type": "relation",
        "required": true,
        "maxSelect": 1,
        "collectionId": "pbcqcms00000001",
        "cascadeDelete": true
      },
      {
        "name": "user",
        "type": "relation",
        "required": true,
        "maxSelect": 1,
        "collectionId": "_pb_users_auth_",
        "cascadeDelete": true
      },
      {
        "name": "text",
        "type": "text",
        "required": true,
        "min": 1,
        "max": 500
      },
      {
        "name": "hidden",
        "type": "bool"
      },
      {
        "name": "created",
        "type": "autodate",
        "onCreate": true,
        "onUpdate": false
      },
      {
        "name": "updated",
        "type": "autodate",
        "onCreate": true,
        "onUpdate": true
      }
    ],
    "indexes": [
      "CREATE INDEX idx_comments_qcm ON comments (qcm, created)"
    ]
  }
]
```

#### `backend/Dockerfile`

```dockerfile
FROM alpine:3.22

ARG PB_VERSION=0.42.2

RUN apk add --no-cache ca-certificates unzip wget

ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && rm /tmp/pb.zip

COPY ./pb_migrations /pb/pb_migrations
COPY ./pb_hooks /pb/pb_hooks
COPY ./entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh

EXPOSE 8090
VOLUME /pb/pb_data

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/pb/entrypoint.sh"]
```

#### `backend/entrypoint.sh`

```sh
#!/bin/sh
set -eu

# Crée ou met à jour le compte administrateur à chaque démarrage (idempotent).
if [ -n "${PB_SUPERUSER_EMAIL:-}" ] && [ -n "${PB_SUPERUSER_PASSWORD:-}" ]; then
  /pb/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=/pb/pb_data
fi

exec /pb/pocketbase serve \
  --http=0.0.0.0:8090 \
  --dir=/pb/pb_data \
  --hooksDir=/pb/pb_hooks \
  --migrationsDir=/pb/pb_migrations \
  --encryptionEnv=PB_ENCRYPTION_KEY \
  --origins="${PB_ALLOWED_ORIGINS:-*}"
```

#### `backend/.env.example`

```dotenv
# Copier ces variables dans Dokploy > Compose > Environment.

# URL publique de PocketBase (domaine attribué au service `pocketbase` dans Dokploy).
PUBLIC_PB_URL=https://api.qcm.example.org
# URL publique du site (domaine attribué au service `web` dans Dokploy).
PUBLIC_SITE_URL=https://qcm.example.org
# Dépôt GitHub qui publie les installateurs Windows (page Releases).
PUBLIC_RELEASES_URL=https://github.com/aifedespaix/qcm/releases/latest

# Compte administrateur PocketBase (tableau de bord /_/).
PB_SUPERUSER_EMAIL=admin@example.org
PB_SUPERUSER_PASSWORD=changer-ce-mot-de-passe-long
# Exactement 32 caractères aléatoires : chiffre les réglages (dont le secret Google) en base.
PB_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
# Origines autorisées (CORS), séparées par des virgules.
PB_ALLOWED_ORIGINS=https://qcm.example.org

# Identifiants OAuth2 Google (console.cloud.google.com > APIs & Services > Credentials).
# URI de redirection autorisée à déclarer chez Google : ${PUBLIC_PB_URL}/api/oauth2-redirect
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

#### `backend/scripts/export-schema.sh`

```sh
#!/bin/sh
# Exporte les collections de l'instance locale vers backend/pb_schema.json
# (fichier importable dans Dashboard > Settings > Import collections).
# Usage : PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... sh backend/scripts/export-schema.sh
set -eu
PB_URL="${PB_URL:-http://127.0.0.1:8090}"
TOKEN=$(curl -fsS "$PB_URL/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$PB_SUPERUSER_EMAIL\",\"password\":\"$PB_SUPERUSER_PASSWORD\"}" | bun -e 'console.log(JSON.parse(await Bun.stdin.text()).token)')
curl -fsS "$PB_URL/api/collections?perPage=200&filter=(name='users'||name='qcms'||name='ratings'||name='comments')" \
  -H "Authorization: $TOKEN" | bun -e 'console.log(JSON.stringify(JSON.parse(await Bun.stdin.text()).items, null, 2))' > "$(dirname "$0")/../pb_schema.json"
echo "OK backend/pb_schema.json"
```

#### `docker-compose.yml`

```yaml
# Déploiement Dokploy (type « Compose »). Les domaines et le HTTPS se règlent dans
# Dokploy > Compose > Domains : `pocketbase` sur le port 8090, `web` sur le port 80.
services:
  pocketbase:
    build:
      context: ./backend
      args:
        PB_VERSION: "0.42.2"
    restart: unless-stopped
    environment:
      PB_SUPERUSER_EMAIL: ${PB_SUPERUSER_EMAIL}
      PB_SUPERUSER_PASSWORD: ${PB_SUPERUSER_PASSWORD}
      PB_ENCRYPTION_KEY: ${PB_ENCRYPTION_KEY}
      PB_ALLOWED_ORIGINS: ${PB_ALLOWED_ORIGINS:-*}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
    volumes:
      - pb_data:/pb/pb_data
    expose:
      - "8090"

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        PUBLIC_PB_URL: ${PUBLIC_PB_URL}
        PUBLIC_SITE_URL: ${PUBLIC_SITE_URL}
        PUBLIC_RELEASES_URL: ${PUBLIC_RELEASES_URL}
    restart: unless-stopped
    depends_on:
      - pocketbase
    expose:
      - "80"

volumes:
  pb_data:
```


### 5.3 Déploiement Dokploy

1. Dokploy > Create Service > **Compose** > dépôt Git du projet, fichier `./docker-compose.yml`.
2. Onglet Environment : coller le contenu de `backend/.env.example` avec les vraies valeurs.
3. Onglet Domains : un domaine pour le service `pocketbase` (port `8090`), un domaine pour le service `web` (port `80`), HTTPS Let's Encrypt activé pour les deux.
4. Console Google Cloud > Credentials > OAuth client « Web application » : URI de redirection autorisée = `https://<domaine pocketbase>/api/oauth2-redirect`.
5. Deploy. Tableau de bord : `https://<domaine pocketbase>/_/`.

Si la version de PocketBase épinglée (`PB_VERSION`) refuse une instruction de la migration ou d'un hook, corriger l'instruction d'après le message d'erreur affiché au démarrage : ne pas changer le modèle de données ni les règles du tableau 5.1.

---

## 6. Skill IA d'ingestion de cours

#### `docs/skill-ingestion-cours.md`

````markdown
# Skill : transformer un cours en `data.yaml` QCM

Copier tout le bloc ci-dessous comme **prompt système** du LLM. Le message utilisateur contient le cours brut, puis éventuellement une ligne `Niveau : ...`, `Matière : ...`, `Nombre de questions : ...`.

```text
Tu es un concepteur pédagogique spécialisé dans les élèves de collège autistes (TSA), avec ou sans TDAH.
Tu transformes un cours fourni par l'utilisateur en un questionnaire à choix multiples au format QCM version 1.

# SORTIE
- Tu réponds avec UN SEUL document YAML valide, et rien d'autre.
- Pas de phrase avant, pas de phrase après, pas de bloc de code Markdown, pas de commentaire YAML.
- Le premier caractère de ta réponse est le « v » de « version: 1 ».

# FORMAT EXACT (aucune autre clé n'est autorisée)
version: 1
meta:
  title: texte, 1 à 80 caractères
  subject: une valeur parmi maths, francais, histoire-geo, svt, physique-chimie, technologie, anglais, espagnol, allemand, emc, arts, musique, autre
  level: une valeur parmi primaire, 6e, 5e, 4e, 3e, lycee, autre
  chapter: texte, 1 à 80 caractères
  language: fr
  description: texte facultatif, 300 caractères au plus
questions:            # 1 à 60 questions
  - id: q1            # q1, q2, q3... dans l'ordre, sans trou
    prompt: texte, 1 à 300 caractères
    choices:          # 2 à 4 réponses, textes tous différents, 120 caractères au plus chacun
      - text: "..."
        correct: true # sur exactement UNE réponse par question
      - text: "..."
    hint: texte facultatif, 200 caractères au plus
    explanation: texte obligatoire, 500 caractères au plus

# RÈGLES YAML
- Mets TOUS les textes entre guillemets doubles. Dans un texte, remplace tout guillemet double par « ou ».
- N'écris jamais la clé « image » : tu ne peux pas fournir d'image.
- N'écris « correct: true » que sur la bonne réponse. N'écris jamais « correct: false ».
- Indentation de 2 espaces, jamais de tabulation.

# RÈGLES PÉDAGOGIQUES TSA (obligatoires)
1. Une question vérifie UNE seule idée du cours.
2. Phrases courtes : 20 mots au plus par question, sujet + verbe + complément.
3. Sens littéral uniquement : pas d'ironie, pas de métaphore, pas d'expression imagée, pas de sous-entendu.
4. Jamais de négation dans la question : interdits « ne... pas », « sauf », « excepté », « lequel n'est pas », « faux ». Jamais de double négation.
5. Jamais de piège : pas de réponse « presque juste », pas de jeu sur un mot, pas de question dont la réponse dépend d'une interprétation.
6. Une seule réponse est correcte, sans discussion possible, d'après le cours fourni.
7. Interdits dans les réponses : « Toutes les réponses », « Aucune de ces réponses », « A et B », « Je ne sais pas ».
8. Les réponses d'une même question ont la même forme grammaticale et une longueur proche. La bonne réponse n'est pas la plus longue.
9. Les mauvaises réponses sont plausibles et correspondent à des erreurs réelles d'élèves. Elles ne sont jamais absurdes ni humoristiques.
10. Vocabulaire : uniquement les mots du cours. Un même objet porte toujours le même nom dans tout le questionnaire.
11. Pas de quantificateur flou : interdits « souvent », « parfois », « généralement », « la plupart ». Utilise des faits précis.
12. Chaque question se comprend seule : jamais « comme vu à la question précédente », jamais « dans le texte ci-dessus ».
13. Change la position de la bonne réponse d'une question à l'autre (1re, 2e, 3e ou 4e), sans motif régulier.
14. « hint » : un indice qui oriente SANS donner la réponse (rappel d'une règle, d'une étape, d'une définition). Ton neutre.
15. « explanation » : 1 à 3 phrases courtes qui disent POURQUOI la bonne réponse est correcte. Ton calme et factuel.
16. Jamais de jugement ni de pression : interdits « facile », « évident », « attention », « piège », « erreur classique », « dépêche-toi », les points d'exclamation et les majuscules d'insistance.
17. Tutoiement. Pas d'émoji.
18. Ordre des questions : du plus simple au plus difficile, dans l'ordre du cours.

# CONTENU
- Utilise uniquement les informations présentes dans le cours fourni. N'invente aucun fait.
- Nombre de questions : celui demandé par l'utilisateur. Sinon 10. Si le cours est trop court pour 10 questions fiables, fais-en moins.
- « subject » et « level » : ceux indiqués par l'utilisateur. Sinon déduis-les du cours. En cas de doute, écris « autre ».
- « title » : le thème du cours, sans le mot « QCM ». « chapter » : le titre du chapitre s'il est donné, sinon le thème principal.

# VÉRIFICATION AVANT DE RÉPONDRE (fais-la en silence)
- Chaque question a 2 à 4 réponses et exactement un « correct: true ».
- Aucune clé hors du format. Aucune limite de longueur dépassée.
- Aucune négation dans les questions. Aucune réponse interdite par la règle 7.
- Les identifiants vont de q1 à qN sans trou ni doublon.

# EXEMPLE DE SORTIE VALIDE
version: 1
meta:
  title: "Les fractions égales"
  subject: maths
  level: 6e
  chapter: "Chapitre 4 — Fractions"
  language: fr
  description: "Deux questions pour revoir les fractions égales."
questions:
  - id: q1
    prompt: "Dans la fraction 3/5, comment s'appelle le nombre 5 ?"
    choices:
      - text: "Le numérateur"
      - text: "Le dénominateur"
        correct: true
    hint: "C'est le nombre écrit en bas."
    explanation: "Le nombre du bas s'appelle le dénominateur. Il indique en combien de parts égales on partage."
  - id: q2
    prompt: "Quelle fraction est égale à 1/2 ?"
    choices:
      - text: "2/4"
        correct: true
      - text: "1/3"
      - text: "3/4"
      - text: "2/3"
    hint: "Multiplie le haut et le bas de 1/2 par le même nombre."
    explanation: "1/2 = 2/4, car 1 × 2 = 2 et 2 × 2 = 4."
```

## Vérifier et emballer la sortie

1. Enregistrer la réponse du LLM dans `mon-cours/data.yaml`.
2. Lancer `bun run pack mon-cours`. La commande valide le fichier avec le schéma Zod de `@qcm/core` et crée le fichier `.qcm`.
3. Si la commande affiche `E_SCHEMA` ou `E_YAML`, renvoyer au LLM le message : « Ta sortie est invalide. Corrige uniquement ces points et renvoie le YAML complet : » suivi des lignes d'erreur affichées.
````


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

#### `apps/web/package.json`

```json
{
  "name": "@qcm/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "typecheck": "astro check",
    "seed": "bun scripts/seed.ts"
  },
  "dependencies": {
    "@astrojs/vue": "7.1.6",
    "@qcm/core": "workspace:*",
    "@qcm/ui": "workspace:*",
    "astro": "7.4.12",
    "pocketbase": "0.29.0",
    "vue": "3.5.45"
  },
  "devDependencies": {
    "@astrojs/check": "0.9.12",
    "@tailwindcss/vite": "4.3.5",
    "@types/bun": "1.4.4",
    "tailwindcss": "4.3.5",
    "typescript": "6.0.3"
  }
}
```

#### `apps/web/tsconfig.json`

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "preserve",
    "types": ["bun"]
  },
  "include": [".astro/types.d.ts", "src", "scripts"],
  "exclude": ["dist"]
}
```

#### `apps/web/astro.config.mjs`

```js
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// Site 100 % statique : toutes les données dynamiques (bibliothèque, compte, publication)
// passent par des îlots Vue qui appellent PocketBase depuis le navigateur.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  integrations: [vue()],
  vite: {
    plugins: [tailwindcss()],
  },
})
```

#### `apps/web/Dockerfile`

```dockerfile
# Contexte de build : racine du monorepo (voir docker-compose.yml).
FROM oven/bun:1.4 AS build
WORKDIR /repo
COPY package.json bun.lock tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/desktop/package.json ./apps/desktop/package.json
RUN bun install --frozen-lockfile
ARG PUBLIC_PB_URL
ARG PUBLIC_SITE_URL
ARG PUBLIC_RELEASES_URL
ENV PUBLIC_PB_URL=$PUBLIC_PB_URL PUBLIC_SITE_URL=$PUBLIC_SITE_URL PUBLIC_RELEASES_URL=$PUBLIC_RELEASES_URL
RUN bun run --filter @qcm/web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
```

#### `apps/web/nginx.conf`

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;

  location /_astro/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location / {
    try_files $uri $uri/ $uri.html =404;
  }
}
```

#### `apps/web/src/env.d.ts`

```ts
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_PB_URL: string
  readonly PUBLIC_SITE_URL: string
  readonly PUBLIC_RELEASES_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

#### `apps/web/src/styles/global.css`

```css
@import "tailwindcss";
@import "@qcm/ui/theme.css";
@source "../../../../packages/ui/src";

@layer components {
  /* Champ de formulaire de l'éditeur : mêmes codes visuels que les blocs QCM. */
  .qcm-field {
    width: 100%;
    min-height: 52px;
    padding: 0.625rem 0.875rem;
    background-color: var(--qcm-surface);
    color: var(--qcm-ink);
    border: 2px solid var(--qcm-line);
    border-radius: var(--radius-xl);
    font: inherit;
    font-weight: 600;
  }

  .qcm-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--qcm-ink-soft);
  }
}
```


`apps/web/public/favicon.svg` : copie exacte de `apps/desktop/app-icon.svg`.

### 7.3 Bibliothèques

#### `apps/web/src/lib/pb.ts`

```ts
import PocketBase, { type RecordModel } from 'pocketbase'
import { readonly, ref } from 'vue'
import {
  QCM_MIME,
  qcmFileName,
  readQcmArchive,
  summarizeQcm,
  type Level,
  type QcmArchive,
  type QcmData,
  type Subject,
} from '@qcm/core'

export const pb = new PocketBase(import.meta.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090')
// Les îlots Vue relancent parfois la même requête : on désactive l'annulation automatique.
pb.autoCancellation(false)

export interface UserRecord extends RecordModel {
  name: string
  avatar: string
}

export interface QcmRecord extends RecordModel {
  owner: string
  title: string
  description: string
  subject: Subject
  level: Level
  chapter: string
  language: string
  question_count: number
  has_images: boolean
  file: string
  thumbnail: string
  status: 'published' | 'hidden'
  rating_avg: number
  rating_count: number
  created: string
  updated: string
  expand?: { owner?: UserRecord }
}

export interface RatingRecord extends RecordModel {
  qcm: string
  user: string
  value: number
}

export interface CommentRecord extends RecordModel {
  qcm: string
  user: string
  text: string
  hidden: boolean
  created: string
  expand?: { user?: UserRecord }
}

// ---------------------------------------------------------------- Compte

const currentUser = ref<UserRecord | null>((pb.authStore.record as UserRecord | null) ?? null)
pb.authStore.onChange(() => {
  currentUser.value = (pb.authStore.record as UserRecord | null) ?? null
})

export function useAuth() {
  return {
    user: readonly(currentUser),
    /** Ouvre la fenêtre Google. À appeler directement depuis un clic (sinon le navigateur bloque la fenêtre). */
    loginWithGoogle: async (): Promise<void> => {
      await pb.collection('users').authWithOAuth2({ provider: 'google' })
    },
    logout: (): void => pb.authStore.clear(),
  }
}

// ---------------------------------------------------------------- Bibliothèque

export type QcmSort = 'recent' | 'rating' | 'title'

export interface QcmQuery {
  search?: string
  subject?: Subject | ''
  level?: Level | ''
  sort?: QcmSort
  page?: number
}

const SORTS: Record<QcmSort, string> = {
  recent: '-created',
  rating: '-rating_avg,-rating_count,-created',
  title: 'title',
}

export const PAGE_SIZE = 24

export function listQcms(query: QcmQuery = {}) {
  const parts = ['status = "published"']
  const search = query.search?.trim()
  if (search) parts.push(pb.filter('(title ~ {:q} || chapter ~ {:q} || description ~ {:q})', { q: search }))
  if (query.subject) parts.push(pb.filter('subject = {:subject}', { subject: query.subject }))
  if (query.level) parts.push(pb.filter('level = {:level}', { level: query.level }))
  return pb.collection('qcms').getList<QcmRecord>(query.page ?? 1, PAGE_SIZE, {
    filter: parts.join(' && '),
    sort: SORTS[query.sort ?? 'recent'],
    expand: 'owner',
  })
}

export function listMyQcms(userId: string) {
  return pb.collection('qcms').getFullList<QcmRecord>({
    filter: pb.filter('owner = {:owner}', { owner: userId }),
    sort: '-created',
  })
}

export function getQcm(id: string) {
  return pb.collection('qcms').getOne<QcmRecord>(id, { expand: 'owner' })
}

export function deleteQcm(id: string) {
  return pb.collection('qcms').delete(id)
}

/** URL de téléchargement direct du fichier `.qcm`. */
export function qcmDownloadUrl(record: QcmRecord): string {
  return pb.files.getURL(record, record.file, { download: true })
}

export function qcmThumbnailUrl(record: QcmRecord): string | undefined {
  return record.thumbnail ? pb.files.getURL(record, record.thumbnail, { thumb: '480x270' }) : undefined
}

/** Télécharge et valide l'archive pour la jouer dans le navigateur. */
export async function fetchQcmArchive(record: QcmRecord): Promise<QcmArchive> {
  const response = await fetch(pb.files.getURL(record, record.file))
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status})`)
  return readQcmArchive(new Uint8Array(await response.arrayBuffer()))
}

// ---------------------------------------------------------------- Publication

export interface PublishInput {
  data: QcmData
  /** Octets du fichier `.qcm` produits par `writeQcmArchive`. */
  bytes: Uint8Array
  /** Miniature WebP facultative (première image du QCM). */
  thumbnail?: Uint8Array
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export function publishQcm(input: PublishInput): Promise<QcmRecord> {
  const userId = pb.authStore.record?.id
  if (!userId) throw new Error('Connexion requise pour publier.')
  const summary = summarizeQcm(input.data)
  const meta = input.data.meta
  const form = new FormData()
  form.set('owner', userId)
  form.set('title', meta.title)
  form.set('description', meta.description ?? '')
  form.set('subject', meta.subject)
  form.set('level', meta.level)
  form.set('chapter', meta.chapter)
  form.set('language', meta.language)
  form.set('question_count', String(summary.questionCount))
  form.set('has_images', String(summary.hasImages))
  form.set('file', new File([toBlobPart(input.bytes)], qcmFileName(meta.title), { type: QCM_MIME }))
  if (input.thumbnail) {
    form.set('thumbnail', new File([toBlobPart(input.thumbnail)], 'miniature.webp', { type: 'image/webp' }))
  }
  return pb.collection('qcms').create<QcmRecord>(form)
}

/** Déclenche l'enregistrement local d'un fichier `.qcm` (export sans compte). */
export function saveQcmLocally(bytes: Uint8Array, title: string): void {
  const url = URL.createObjectURL(new Blob([toBlobPart(bytes)], { type: QCM_MIME }))
  const link = document.createElement('a')
  link.href = url
  link.download = qcmFileName(title)
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------- Notes et commentaires

export async function getMyRating(qcmId: string): Promise<RatingRecord | null> {
  const userId = pb.authStore.record?.id
  if (!userId) return null
  const list = await pb.collection('ratings').getList<RatingRecord>(1, 1, {
    filter: pb.filter('qcm = {:qcm} && user = {:user}', { qcm: qcmId, user: userId }),
  })
  return list.items[0] ?? null
}

/** Crée ou remplace la note (1 à 5) de l'utilisateur connecté. */
export async function rateQcm(qcmId: string, value: number): Promise<RatingRecord> {
  const userId = pb.authStore.record?.id
  if (!userId) throw new Error('Connexion requise pour noter.')
  const existing = await getMyRating(qcmId)
  if (existing) return pb.collection('ratings').update<RatingRecord>(existing.id, { value })
  return pb.collection('ratings').create<RatingRecord>({ qcm: qcmId, user: userId, value })
}

export function listComments(qcmId: string) {
  return pb.collection('comments').getList<CommentRecord>(1, 50, {
    filter: pb.filter('qcm = {:qcm}', { qcm: qcmId }),
    sort: '-created',
    expand: 'user',
  })
}

export function addComment(qcmId: string, text: string) {
  const userId = pb.authStore.record?.id
  if (!userId) throw new Error('Connexion requise pour commenter.')
  return pb.collection('comments').create<CommentRecord>({ qcm: qcmId, user: userId, text: text.trim() }, { expand: 'user' })
}

export function deleteComment(id: string) {
  return pb.collection('comments').delete(id)
}
```

#### `apps/web/src/lib/editorDraft.ts`

```ts
import { reactive } from 'vue'
import {
  LIMITS,
  QCM_FORMAT_VERSION,
  correctIndexOf,
  imageToWebp,
  mediaPathFor,
  validateQcm,
  writeQcmArchive,
  type Level,
  type QcmArchive,
  type QcmData,
  type Subject,
} from '@qcm/core'

export interface DraftImage {
  /** Chemin dans l'archive : `media/xxx.webp`. */
  path: string
  bytes: Uint8Array
  /** URL `blob:` pour l'aperçu. */
  url: string
}

export interface DraftQuestion {
  /** Clé stable pour `v-for` (l'identifiant `q1`, `q2`... est attribué à l'export). */
  key: number
  prompt: string
  choices: { text: string }[]
  correctIndex: number
  hint: string
  explanation: string
  image: DraftImage | null
}

export interface Draft {
  title: string
  subject: Subject
  level: Level
  chapter: string
  author: string
  description: string
  questions: DraftQuestion[]
}

let nextKey = 1

function blobUrl(bytes: Uint8Array): string {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return URL.createObjectURL(new Blob([buffer], { type: 'image/webp' }))
}

export function emptyQuestion(): DraftQuestion {
  return {
    key: nextKey++,
    prompt: '',
    choices: [{ text: '' }, { text: '' }],
    correctIndex: 0,
    hint: '',
    explanation: '',
    image: null,
  }
}

export function createDraft(): Draft {
  return reactive<Draft>({
    title: '',
    subject: 'maths',
    level: '6e',
    chapter: '',
    author: '',
    description: '',
    questions: [emptyQuestion()],
  })
}

export function addQuestion(draft: Draft): void {
  if (draft.questions.length < LIMITS.maxQuestions) draft.questions.push(emptyQuestion())
}

export function removeQuestion(draft: Draft, index: number): void {
  if (draft.questions.length <= 1) return
  const [removed] = draft.questions.splice(index, 1)
  if (removed?.image) URL.revokeObjectURL(removed.image.url)
}

/** Déplace une question d'un cran (`-1` vers le haut, `1` vers le bas). */
export function moveQuestion(draft: Draft, index: number, direction: -1 | 1): void {
  const target = index + direction
  const current = draft.questions[index]
  const other = draft.questions[target]
  if (!current || !other) return
  draft.questions[index] = other
  draft.questions[target] = current
}

export function addChoice(question: DraftQuestion): void {
  if (question.choices.length < LIMITS.maxChoices) question.choices.push({ text: '' })
}

export function removeChoice(question: DraftQuestion, index: number): void {
  if (question.choices.length <= LIMITS.minChoices) return
  question.choices.splice(index, 1)
  if (question.correctIndex === index) question.correctIndex = 0
  else if (question.correctIndex > index) question.correctIndex -= 1
}

/** Convertit l'image déposée en WebP (1280 px max) et l'attache à la question. */
export async function setQuestionImage(draft: Draft, question: DraftQuestion, file: Blob, fileName: string): Promise<void> {
  const { bytes } = await imageToWebp(file)
  const taken = draft.questions.flatMap((item) => (item.image && item !== question ? [item.image.path] : []))
  if (question.image) URL.revokeObjectURL(question.image.url)
  question.image = { path: mediaPathFor('img', fileName, taken), bytes, url: blobUrl(bytes) }
}

export function removeQuestionImage(question: DraftQuestion): void {
  if (question.image) URL.revokeObjectURL(question.image.url)
  question.image = null
}

export interface BuiltQcm {
  data: QcmData
  media: Map<string, Uint8Array>
  /** Octets du fichier `.qcm`. */
  bytes: Uint8Array
  /** Première image, utilisée comme miniature à la publication. */
  thumbnail?: Uint8Array
}

/** Brouillon → données validées (lance `QcmFormatError('E_SCHEMA')` avec le détail des champs à corriger). */
export function draftToData(draft: Draft): QcmData {
  return validateQcm({
    version: QCM_FORMAT_VERSION,
    meta: {
      title: draft.title,
      subject: draft.subject,
      level: draft.level,
      chapter: draft.chapter,
      language: 'fr',
      ...(draft.author.trim() ? { author: draft.author } : {}),
      ...(draft.description.trim() ? { description: draft.description } : {}),
    },
    questions: draft.questions.map((question, index) => ({
      id: `q${index + 1}`,
      prompt: question.prompt,
      ...(question.image ? { image: question.image.path } : {}),
      choices: question.choices.map((choice, choiceIndex) => ({
        text: choice.text,
        correct: choiceIndex === question.correctIndex,
      })),
      ...(question.hint.trim() ? { hint: question.hint } : {}),
      explanation: question.explanation,
    })),
  })
}

/** Brouillon → fichier `.qcm` complet. */
export function buildQcm(draft: Draft): BuiltQcm {
  const data = draftToData(draft)
  const media = new Map<string, Uint8Array>()
  for (const question of draft.questions) {
    if (question.image) media.set(question.image.path, question.image.bytes)
  }
  const bytes = writeQcmArchive({ data, media })
  const first = draft.questions.find((question) => question.image)?.image?.bytes
  return { data, media, bytes, ...(first ? { thumbnail: first } : {}) }
}

/** Recharge un `.qcm` existant dans l'éditeur. */
export function loadArchiveIntoDraft(draft: Draft, archive: QcmArchive): void {
  for (const question of draft.questions) {
    if (question.image) URL.revokeObjectURL(question.image.url)
  }
  const { meta, questions } = archive.data
  draft.title = meta.title
  draft.subject = meta.subject
  draft.level = meta.level
  draft.chapter = meta.chapter
  draft.author = meta.author ?? ''
  draft.description = meta.description ?? ''
  draft.questions = questions.map((question) => {
    const bytes = question.image ? archive.media.get(question.image) : undefined
    return {
      key: nextKey++,
      prompt: question.prompt,
      choices: question.choices.map((choice) => ({ text: choice.text })),
      correctIndex: correctIndexOf(question),
      hint: question.hint ?? '',
      explanation: question.explanation,
      image: question.image && bytes ? { path: question.image, bytes, url: blobUrl(bytes) } : null,
    }
  })
}

/** Table `chemin → URL blob:` pour l'aperçu `QcmPlayer` dans l'éditeur. */
export function draftMediaResolver(draft: Draft): (path: string) => string | undefined {
  return (path) => draft.questions.find((question) => question.image?.path === path)?.image?.url
}
```

#### `apps/web/scripts/seed.ts`

```ts
/**
 * Publie le QCM d'exemple dans une instance PocketBase (développement uniquement).
 * Usage : PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... bun run --filter @qcm/web seed
 */
import PocketBase from 'pocketbase'
import { parseQcmYaml, qcmFileName, summarizeQcm, writeQcmArchive } from '@qcm/core'

const url = process.env.PB_URL ?? 'http://127.0.0.1:8090'
const email = process.env.PB_SUPERUSER_EMAIL
const password = process.env.PB_SUPERUSER_PASSWORD
if (!email || !password) {
  console.error('PB_SUPERUSER_EMAIL et PB_SUPERUSER_PASSWORD sont obligatoires.')
  process.exit(2)
}

const pb = new PocketBase(url)
await pb.collection('_superusers').authWithPassword(email, password)

// Utilisateur de démonstration, propriétaire du QCM d'exemple.
const demoEmail = 'demo@qcm.local'
const found = await pb.collection('users').getList(1, 1, { filter: pb.filter('email = {:email}', { email: demoEmail }) })
let ownerId = found.items[0]?.id
if (!ownerId) {
  const secret = crypto.randomUUID()
  const created = await pb.collection('users').create({
    email: demoEmail,
    password: secret,
    passwordConfirm: secret,
    name: 'Équipe QCM',
    verified: true,
  })
  ownerId = created.id
}

const yaml = await Bun.file(new URL('../../../examples/fractions/data.yaml', import.meta.url)).text()
const data = parseQcmYaml(yaml)
const summary = summarizeQcm(data)
const bytes = writeQcmArchive({ data })

const form = new FormData()
form.set('owner', ownerId)
form.set('title', data.meta.title)
form.set('description', data.meta.description ?? '')
form.set('subject', data.meta.subject)
form.set('level', data.meta.level)
form.set('chapter', data.meta.chapter)
form.set('language', data.meta.language)
form.set('question_count', String(summary.questionCount))
form.set('has_images', String(summary.hasImages))
form.set('file', new File([bytes.slice().buffer], qcmFileName(data.meta.title), { type: 'application/zip' }))

const record = await pb.collection('qcms').create(form)
console.log(`OK QCM publié : ${record.id} (${data.meta.title})`)
```


### 7.4 Mise en page et pages

#### `apps/web/src/layouts/Base.astro`

```astro
---
import HeaderControls from '../components/HeaderControls.vue'
import '../styles/global.css'

interface Props {
  title: string
  description?: string
}

const { title, description = 'QCM : des questionnaires calmes, sans publicité, sans chronomètre.' } = Astro.props
const links = [
  { href: '/bibliotheque', label: 'Bibliothèque' },
  { href: '/editeur', label: 'Créer un QCM' },
]
---

<!doctype html>
<html lang="fr" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title} · QCM</title>
    <script is:inline>
      // Applique le thème enregistré avant le premier affichage (pas de flash).
      try {
        const stored = localStorage.getItem('qcm:theme')
        const dark = stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      } catch {}
    </script>
  </head>
  <body class="bg-bg text-ink">
    <a href="#contenu" class="sr-only focus:not-sr-only focus:absolute focus:m-3 focus:rounded-xl focus:bg-surface focus:p-3">
      Aller au contenu
    </a>
    <header class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
      <a href="/" class="flex items-center gap-3 text-2xl font-extrabold no-underline">
        <img src="/favicon.svg" alt="" width="44" height="44" />
        QCM
      </a>
      <nav aria-label="Navigation principale" class="flex flex-wrap items-center gap-3">
        {
          links.map((link) => (
            <a
              href={link.href}
              class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base no-underline"
              aria-current={Astro.url.pathname.startsWith(link.href) ? 'page' : undefined}
            >
              {link.label}
            </a>
          ))
        }
        <HeaderControls client:only="vue" />
      </nav>
    </header>
    <main id="contenu" class="mx-auto w-full max-w-6xl px-5 pb-16">
      <slot />
    </main>
    <footer class="mx-auto w-full max-w-6xl px-5 pb-10 text-sm text-ink-soft">
      QCM est un logiciel libre. Aucune publicité, aucun pistage.
    </footer>
  </body>
</html>
```

#### `apps/web/src/pages/index.astro`

```astro
---
import Base from '../layouts/Base.astro'

const releasesUrl = import.meta.env.PUBLIC_RELEASES_URL || 'https://github.com/aifedespaix/qcm/releases/latest'
const promises = [
  { title: 'Calme', text: 'Pas de publicité, pas de chronomètre, pas de score. Une question à la fois.' },
  { title: 'Hors-ligne', text: 'Le lecteur Windows fonctionne sans Internet. Un double-clic sur un fichier .qcm suffit.' },
  { title: 'Prévisible', text: 'Chaque QCM annonce son titre, sa matière, son chapitre et son nombre de questions avant de commencer.' },
  { title: 'Sans culpabilité', text: 'Une erreur affiche une explication calme. On peut réessayer ou voir la réponse.' },
]
---

<Base title="Réviser au calme">
  <section class="qcm-card flex flex-col gap-6 p-7 sm:p-10">
    <h1 class="max-w-3xl text-4xl leading-tight font-extrabold sm:text-5xl">Réviser au calme, une question à la fois.</h1>
    <p class="max-w-2xl text-xl text-ink-soft">
      QCM est un lecteur de questionnaires pensé pour les élèves qui ont besoin d'un cadre clair : grands boutons, couleurs douces, aucune distraction.
    </p>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <a href={releasesUrl} class="qcm-block qcm-block-primary text-xl no-underline" rel="noopener">Télécharger pour Windows</a>
      <a href="/bibliotheque" class="qcm-block qcm-block-quiet text-xl no-underline">Parcourir la bibliothèque</a>
    </div>
    <p class="text-base text-ink-soft">Windows 10 et 11 · Gratuit · Installateur .exe ou .msi</p>
  </section>

  <section class="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2" aria-label="Les engagements de QCM">
    {
      promises.map((promise) => (
        <article class="qcm-card p-6">
          <h2 class="text-2xl font-extrabold">{promise.title}</h2>
          <p class="mt-2 text-lg text-ink-soft">{promise.text}</p>
        </article>
      ))
    }
  </section>

  <section class="qcm-card mt-10 flex flex-col gap-4 p-7">
    <h2 class="text-2xl font-extrabold">Créer ses propres QCM</h2>
    <p class="text-lg text-ink-soft">L'éditeur en ligne fonctionne sans compte. Tu écris tes questions, tu ajoutes des images, puis tu enregistres le fichier .qcm.</p>
    <a href="/editeur" class="qcm-block qcm-block-primary no-underline sm:w-fit">Ouvrir l'éditeur</a>
  </section>
</Base>
```

#### `apps/web/src/pages/bibliotheque.astro`

```astro
---
import LibraryBrowser from '../components/LibraryBrowser.vue'
import Base from '../layouts/Base.astro'
---

<Base title="Bibliothèque" description="Des QCM partagés par la communauté, à télécharger ou à essayer en ligne.">
  <h1 class="mb-6 text-4xl font-extrabold">Bibliothèque</h1>
  <LibraryBrowser client:only="vue" />
</Base>
```

#### `apps/web/src/pages/qcm.astro`

```astro
---
import QcmDetail from '../components/QcmDetail.vue'
import Base from '../layouts/Base.astro'
---

<Base title="QCM">
  <QcmDetail client:only="vue" />
</Base>
```

#### `apps/web/src/pages/editeur.astro`

```astro
---
import QcmEditor from '../components/QcmEditor.vue'
import Base from '../layouts/Base.astro'
---

<Base title="Créer un QCM" description="Éditeur de QCM sans code : questions, images, export .qcm.">
  <h1 class="mb-6 text-4xl font-extrabold">Créer un QCM</h1>
  <QcmEditor client:only="vue" />
</Base>
```


### 7.5 Îlots Vue

#### `apps/web/src/components/HeaderControls.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { QcmSoundToggle, QcmThemeToggle } from '@qcm/ui'
import { useAuth } from '../lib/pb.ts'

const { user, loginWithGoogle, logout } = useAuth()
const error = ref('')

function login(): void {
  error.value = ''
  // Appel direct dans le clic : la fenêtre Google n'est pas bloquée.
  loginWithGoogle().catch(() => {
    error.value = 'La connexion n\'a pas abouti.'
  })
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <template v-if="user">
      <span class="max-w-40 truncate text-base font-bold">{{ user.name || 'Mon compte' }}</span>
      <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" @click="logout">Se déconnecter</button>
    </template>
    <button v-else type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" @click="login">
      Se connecter avec Google
    </button>
    <QcmSoundToggle />
    <QcmThemeToggle />
    <p v-if="error" role="alert" class="w-full text-sm font-semibold text-retry-ink">{{ error }}</p>
  </div>
</template>
```

#### `apps/web/src/components/LibraryBrowser.vue`

```vue
<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { LEVELS, LEVEL_LABELS, SUBJECTS, SUBJECT_LABELS, type Level, type Subject } from '@qcm/core'
import { listQcms, qcmDownloadUrl, qcmThumbnailUrl, type QcmRecord, type QcmSort } from '../lib/pb.ts'

const filters = reactive<{ search: string; subject: Subject | ''; level: Level | ''; sort: QcmSort }>({
  search: '',
  subject: '',
  level: '',
  sort: 'recent',
})
const items = ref<QcmRecord[]>([])
const page = ref(1)
const totalPages = ref(1)
const totalItems = ref(0)
const state = ref<'loading' | 'ready' | 'error'>('loading')
let debounce: ReturnType<typeof setTimeout> | undefined

async function load(): Promise<void> {
  state.value = 'loading'
  try {
    const result = await listQcms({ ...filters, page: page.value })
    items.value = result.items
    totalPages.value = Math.max(1, result.totalPages)
    totalItems.value = result.totalItems
    state.value = 'ready'
  } catch {
    state.value = 'error'
  }
}

function goTo(target: number): void {
  page.value = Math.min(Math.max(1, target), totalPages.value)
  void load()
}

watch(filters, () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    page.value = 1
    void load()
  }, 300)
})

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-6">
    <form class="qcm-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4" role="search" @submit.prevent="load">
      <div>
        <label class="qcm-label" for="lib-search">Rechercher</label>
        <input id="lib-search" v-model="filters.search" class="qcm-field" type="search" placeholder="Titre ou chapitre" />
      </div>
      <div>
        <label class="qcm-label" for="lib-subject">Matière</label>
        <select id="lib-subject" v-model="filters.subject" class="qcm-field">
          <option value="">Toutes les matières</option>
          <option v-for="subject in SUBJECTS" :key="subject" :value="subject">{{ SUBJECT_LABELS[subject] }}</option>
        </select>
      </div>
      <div>
        <label class="qcm-label" for="lib-level">Niveau</label>
        <select id="lib-level" v-model="filters.level" class="qcm-field">
          <option value="">Tous les niveaux</option>
          <option v-for="level in LEVELS" :key="level" :value="level">{{ LEVEL_LABELS[level] }}</option>
        </select>
      </div>
      <div>
        <label class="qcm-label" for="lib-sort">Trier par</label>
        <select id="lib-sort" v-model="filters.sort" class="qcm-field">
          <option value="recent">Les plus récents</option>
          <option value="rating">Les mieux notés</option>
          <option value="title">Titre (A à Z)</option>
        </select>
      </div>
    </form>

    <p v-if="state === 'loading'" role="status" class="text-lg font-bold text-ink-soft">Chargement de la bibliothèque…</p>
    <p v-else-if="state === 'error'" role="alert" class="rounded-2xl border-2 border-line bg-retry px-5 py-4 text-lg font-medium text-retry-ink">
      La bibliothèque ne répond pas pour le moment. Tu peux réessayer dans un instant.
    </p>
    <p v-else-if="items.length === 0" class="qcm-card p-6 text-lg">Aucun QCM ne correspond à cette recherche.</p>

    <template v-else>
      <p class="text-base font-bold text-ink-soft">{{ totalItems === 1 ? '1 QCM' : `${totalItems} QCM` }}</p>
      <ul class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="item in items" :key="item.id" class="qcm-card flex flex-col gap-3 overflow-hidden p-5">
          <img
            v-if="qcmThumbnailUrl(item)"
            :src="qcmThumbnailUrl(item)"
            alt=""
            loading="lazy"
            class="aspect-video w-full rounded-xl border-2 border-line bg-bg object-cover"
          />
          <h2 class="text-xl leading-snug font-extrabold">
            <a :href="`/qcm?id=${item.id}`" class="no-underline hover:underline">{{ item.title }}</a>
          </h2>
          <p class="text-base font-semibold text-ink-soft">
            {{ SUBJECT_LABELS[item.subject] }} · {{ LEVEL_LABELS[item.level] }} · {{ item.chapter }}
          </p>
          <p class="text-base text-ink-soft">
            {{ item.question_count === 1 ? '1 question' : `${item.question_count} questions` }}
            · {{ item.has_images ? 'Avec images' : 'Sans image' }}
            <template v-if="item.rating_count > 0"> · Note {{ item.rating_avg.toFixed(1) }} sur 5</template>
          </p>
          <div class="mt-auto grid grid-cols-2 gap-3 pt-2">
            <a :href="`/qcm?id=${item.id}`" class="qcm-block qcm-block-quiet min-h-12 px-3 py-2 text-base no-underline">Voir</a>
            <a :href="qcmDownloadUrl(item)" class="qcm-block qcm-block-primary min-h-12 px-3 py-2 text-base no-underline">Télécharger</a>
          </div>
        </li>
      </ul>

      <nav v-if="totalPages > 1" aria-label="Pages de résultats" class="flex items-center justify-center gap-4">
        <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" :disabled="page <= 1" @click="goTo(page - 1)">Page précédente</button>
        <span class="text-base font-bold">Page {{ page }} sur {{ totalPages }}</span>
        <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-4 py-2 text-base" :disabled="page >= totalPages" @click="goTo(page + 1)">Page suivante</button>
      </nav>
    </template>
  </div>
</template>
```

#### `apps/web/src/components/QcmDetail.vue`

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { LEVEL_LABELS, SUBJECT_LABELS, type QcmArchive } from '@qcm/core'
import { QcmPlayer } from '@qcm/ui'
import {
  addComment,
  deleteComment,
  deleteQcm,
  fetchQcmArchive,
  getMyRating,
  getQcm,
  listComments,
  qcmDownloadUrl,
  rateQcm,
  useAuth,
  type CommentRecord,
  type QcmRecord,
} from '../lib/pb.ts'

const { user } = useAuth()
const state = ref<'loading' | 'ready' | 'missing'>('loading')
const record = shallowRef<QcmRecord | null>(null)
const archive = shallowRef<QcmArchive | null>(null)
const playing = ref(false)
const playError = ref('')
const myRating = ref(0)
const comments = ref<CommentRecord[]>([])
const commentText = ref('')
const notice = ref('')
const mediaUrls = new Map<string, string>()

const isOwner = computed(() => !!user.value && record.value?.owner === user.value.id)

function resolveMedia(path: string): string | undefined {
  const cached = mediaUrls.get(path)
  if (cached) return cached
  const bytes = archive.value?.media.get(path)
  if (!bytes) return undefined
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const url = URL.createObjectURL(new Blob([buffer], { type: 'image/webp' }))
  mediaUrls.set(path, url)
  return url
}

async function refresh(id: string): Promise<void> {
  record.value = await getQcm(id)
  comments.value = (await listComments(id)).items
  myRating.value = (await getMyRating(id))?.value ?? 0
}

async function play(): Promise<void> {
  if (!record.value) return
  playError.value = ''
  try {
    archive.value ??= await fetchQcmArchive(record.value)
    playing.value = true
  } catch {
    playError.value = 'Ce QCM ne peut pas être lu en ligne pour le moment. Tu peux le télécharger.'
  }
}

async function rate(value: number): Promise<void> {
  if (!record.value) return
  await rateQcm(record.value.id, value)
  await refresh(record.value.id)
  notice.value = 'Ta note est enregistrée.'
}

async function sendComment(): Promise<void> {
  if (!record.value || !commentText.value.trim()) return
  const created = await addComment(record.value.id, commentText.value)
  comments.value = [created, ...comments.value]
  commentText.value = ''
}

async function removeComment(id: string): Promise<void> {
  await deleteComment(id)
  comments.value = comments.value.filter((comment) => comment.id !== id)
}

async function removeQcm(): Promise<void> {
  if (!record.value || !window.confirm('Supprimer définitivement ce QCM de la bibliothèque ?')) return
  await deleteQcm(record.value.id)
  window.location.href = '/bibliotheque'
}

onMounted(async () => {
  const id = new URLSearchParams(window.location.search).get('id')
  if (!id) {
    state.value = 'missing'
    return
  }
  try {
    await refresh(id)
    document.title = `${record.value?.title ?? 'QCM'} · QCM`
    state.value = 'ready'
  } catch {
    state.value = 'missing'
  }
})

onBeforeUnmount(() => {
  for (const url of mediaUrls.values()) URL.revokeObjectURL(url)
})
</script>

<template>
  <p v-if="state === 'loading'" role="status" class="text-lg font-bold text-ink-soft">Chargement du QCM…</p>

  <section v-else-if="state === 'missing' || !record" class="qcm-card flex flex-col gap-4 p-7">
    <h1 class="text-3xl font-extrabold">Ce QCM est introuvable.</h1>
    <a href="/bibliotheque" class="qcm-block qcm-block-primary no-underline sm:w-fit">Retour à la bibliothèque</a>
  </section>

  <div v-else-if="playing && archive" class="flex flex-col gap-5">
    <button type="button" class="qcm-block qcm-block-quiet min-h-12 self-start px-4 py-2 text-base" @click="playing = false">Quitter le QCM</button>
    <QcmPlayer :qcm="archive.data" :resolve-media="resolveMedia" closable @close="playing = false" />
  </div>

  <div v-else class="flex flex-col gap-8">
    <section class="qcm-card flex flex-col gap-5 p-7">
      <h1 class="text-3xl leading-tight font-extrabold sm:text-4xl">{{ record.title }}</h1>
      <p class="text-lg font-semibold text-ink-soft">
        {{ SUBJECT_LABELS[record.subject] }} · {{ LEVEL_LABELS[record.level] }} · {{ record.chapter }}
      </p>
      <p v-if="record.description" class="text-lg">{{ record.description }}</p>
      <p class="text-base text-ink-soft">
        {{ record.question_count === 1 ? '1 question' : `${record.question_count} questions` }}
        · {{ record.has_images ? 'Avec images' : 'Sans image' }}
        <template v-if="record.expand?.owner?.name"> · Proposé par {{ record.expand.owner.name }}</template>
        <template v-if="record.rating_count > 0"> · Note {{ record.rating_avg.toFixed(1) }} sur 5 ({{ record.rating_count }})</template>
      </p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <a :href="qcmDownloadUrl(record)" class="qcm-block qcm-block-primary text-xl no-underline">Télécharger le fichier .qcm</a>
        <button type="button" class="qcm-block qcm-block-quiet text-xl" @click="play">Essayer en ligne</button>
      </div>
      <p v-if="playError" role="alert" class="rounded-2xl border-2 border-line bg-retry px-5 py-4 font-medium text-retry-ink">{{ playError }}</p>
      <button v-if="isOwner" type="button" class="qcm-block qcm-block-quiet min-h-12 self-start px-4 py-2 text-base" @click="removeQcm">
        Supprimer mon QCM
      </button>
    </section>

    <section class="qcm-card flex flex-col gap-4 p-7" aria-labelledby="rating-title">
      <h2 id="rating-title" class="text-2xl font-extrabold">Noter ce QCM</h2>
      <p v-if="!user" class="text-lg text-ink-soft">Connecte-toi pour donner une note.</p>
      <div v-else class="flex flex-wrap gap-3" role="group" aria-label="Note de 1 à 5">
        <button
          v-for="value in 5"
          :key="value"
          type="button"
          class="qcm-block qcm-block-quiet min-w-16"
          :class="myRating === value ? 'bg-selected' : ''"
          :aria-pressed="myRating === value"
          @click="rate(value)"
        >
          {{ value }}
        </button>
      </div>
      <p v-if="notice" role="status" class="text-base font-semibold text-correct-ink">{{ notice }}</p>
    </section>

    <section class="qcm-card flex flex-col gap-4 p-7" aria-labelledby="comments-title">
      <h2 id="comments-title" class="text-2xl font-extrabold">Commentaires</h2>
      <form v-if="user" class="flex flex-col gap-3" @submit.prevent="sendComment">
        <label class="qcm-label" for="comment-text">Ton commentaire (500 caractères au plus)</label>
        <textarea id="comment-text" v-model="commentText" class="qcm-field" rows="3" maxlength="500" required />
        <button type="submit" class="qcm-block qcm-block-primary sm:w-fit">Envoyer</button>
      </form>
      <p v-else class="text-lg text-ink-soft">Connecte-toi pour écrire un commentaire.</p>
      <p v-if="comments.length === 0" class="text-lg text-ink-soft">Aucun commentaire pour le moment.</p>
      <ul v-else class="flex flex-col gap-3">
        <li v-for="comment in comments" :key="comment.id" class="rounded-2xl border-2 border-line bg-bg px-5 py-4">
          <p class="text-sm font-bold text-ink-soft">
            {{ comment.expand?.user?.name || 'Membre' }} · {{ new Date(comment.created).toLocaleDateString('fr-FR') }}
          </p>
          <p class="mt-1 text-lg whitespace-pre-line">{{ comment.text }}</p>
          <button
            v-if="user && comment.user === user.id"
            type="button"
            class="mt-2 text-sm font-bold underline"
            @click="removeComment(comment.id)"
          >
            Supprimer mon commentaire
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
```

#### `apps/web/src/components/QcmEditor.vue`

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import {
  LEVELS,
  LEVEL_LABELS,
  LIMITS,
  QcmFormatError,
  SUBJECTS,
  SUBJECT_LABELS,
  readQcmArchive,
  type QcmData,
} from '@qcm/core'
import { QcmPlayer } from '@qcm/ui'
import {
  addChoice,
  addQuestion,
  buildQcm,
  createDraft,
  draftMediaResolver,
  draftToData,
  loadArchiveIntoDraft,
  moveQuestion,
  removeChoice,
  removeQuestion,
  removeQuestionImage,
  setQuestionImage,
  type DraftQuestion,
} from '../lib/editorDraft.ts'
import { publishQcm, saveQcmLocally, useAuth } from '../lib/pb.ts'

const LETTERS = ['A', 'B', 'C', 'D'] as const

const { user } = useAuth()
const draft = createDraft()
const resolveMedia = draftMediaResolver(draft)
const preview = shallowRef<QcmData | null>(null)
const problems = ref<string[]>([])
const notice = ref('')
const publishedId = ref('')
const busy = ref(false)

function report(error: unknown): void {
  notice.value = ''
  if (error instanceof QcmFormatError) {
    problems.value = error.details.length > 0 ? error.details : [error.message]
  } else {
    problems.value = ['Une erreur est survenue. Tu peux réessayer.']
  }
}

function attempt<T>(action: () => T): T | undefined {
  problems.value = []
  try {
    return action()
  } catch (error) {
    report(error)
    return undefined
  }
}

function showPreview(): void {
  const data = attempt(() => draftToData(draft))
  if (data) preview.value = data
}

function exportFile(): void {
  const built = attempt(() => buildQcm(draft))
  if (!built) return
  saveQcmLocally(built.bytes, built.data.meta.title)
  notice.value = 'Le fichier .qcm est enregistré dans tes téléchargements.'
}

async function publish(): Promise<void> {
  const built = attempt(() => buildQcm(draft))
  if (!built) return
  busy.value = true
  try {
    const record = await publishQcm(built)
    publishedId.value = record.id
    notice.value = 'Ton QCM est publié dans la bibliothèque.'
  } catch (error) {
    report(error)
  } finally {
    busy.value = false
  }
}

async function attachImage(question: DraftQuestion, file: File | undefined): Promise<void> {
  if (!file) return
  problems.value = []
  try {
    await setQuestionImage(draft, question, file, file.name)
  } catch (error) {
    report(error)
  }
}

function onImageInput(question: DraftQuestion, event: Event): void {
  const input = event.target as HTMLInputElement
  void attachImage(question, input.files?.[0])
  input.value = ''
}

function onImageDrop(question: DraftQuestion, event: DragEvent): void {
  void attachImage(question, event.dataTransfer?.files[0])
}

async function importFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  problems.value = []
  try {
    loadArchiveIntoDraft(draft, readQcmArchive(new Uint8Array(await file.arrayBuffer())))
    notice.value = 'Le fichier est chargé dans l\'éditeur.'
  } catch (error) {
    report(error)
  }
}
</script>

<template>
  <div v-if="preview" class="flex flex-col gap-5">
    <button type="button" class="qcm-block qcm-block-quiet min-h-12 self-start px-4 py-2 text-base" @click="preview = null">
      Revenir à l'éditeur
    </button>
    <QcmPlayer :qcm="preview" :resolve-media="resolveMedia" closable @close="preview = null" />
  </div>

  <form v-else class="flex flex-col gap-8" novalidate @submit.prevent="exportFile">
    <section class="qcm-card grid grid-cols-1 gap-4 p-6 sm:grid-cols-2" aria-labelledby="editor-meta">
      <h2 id="editor-meta" class="text-2xl font-extrabold sm:col-span-2">Informations</h2>
      <div class="sm:col-span-2">
        <label class="qcm-label" for="meta-title">Titre</label>
        <input id="meta-title" v-model="draft.title" class="qcm-field" :maxlength="LIMITS.title" />
      </div>
      <div>
        <label class="qcm-label" for="meta-subject">Matière</label>
        <select id="meta-subject" v-model="draft.subject" class="qcm-field">
          <option v-for="subject in SUBJECTS" :key="subject" :value="subject">{{ SUBJECT_LABELS[subject] }}</option>
        </select>
      </div>
      <div>
        <label class="qcm-label" for="meta-level">Niveau</label>
        <select id="meta-level" v-model="draft.level" class="qcm-field">
          <option v-for="level in LEVELS" :key="level" :value="level">{{ LEVEL_LABELS[level] }}</option>
        </select>
      </div>
      <div>
        <label class="qcm-label" for="meta-chapter">Chapitre</label>
        <input id="meta-chapter" v-model="draft.chapter" class="qcm-field" :maxlength="LIMITS.chapter" />
      </div>
      <div>
        <label class="qcm-label" for="meta-author">Auteur (facultatif)</label>
        <input id="meta-author" v-model="draft.author" class="qcm-field" :maxlength="LIMITS.author" />
      </div>
      <div class="sm:col-span-2">
        <label class="qcm-label" for="meta-description">Description (facultatif)</label>
        <textarea id="meta-description" v-model="draft.description" class="qcm-field" rows="2" :maxlength="LIMITS.description" />
      </div>
      <div class="sm:col-span-2">
        <label class="qcm-label" for="import-file">Reprendre un fichier .qcm existant</label>
        <input id="import-file" class="qcm-field" type="file" accept=".qcm,application/zip" @change="importFile" />
      </div>
    </section>

    <section
      v-for="(question, index) in draft.questions"
      :key="question.key"
      class="qcm-card flex flex-col gap-4 p-6"
      :aria-label="`Question ${index + 1}`"
    >
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-2xl font-extrabold">Question {{ index + 1 }}</h2>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-3 py-2 text-base" :disabled="index === 0" @click="moveQuestion(draft, index, -1)">Monter</button>
          <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-3 py-2 text-base" :disabled="index === draft.questions.length - 1" @click="moveQuestion(draft, index, 1)">Descendre</button>
          <button type="button" class="qcm-block qcm-block-quiet min-h-12 px-3 py-2 text-base" :disabled="draft.questions.length <= 1" @click="removeQuestion(draft, index)">Supprimer</button>
        </div>
      </header>

      <div>
        <label class="qcm-label" :for="`prompt-${question.key}`">Question</label>
        <textarea :id="`prompt-${question.key}`" v-model="question.prompt" class="qcm-field" rows="2" :maxlength="LIMITS.prompt" />
      </div>

      <div
        class="rounded-2xl border-2 border-dashed border-line bg-bg p-4"
        @dragover.prevent
        @drop.prevent="onImageDrop(question, $event)"
      >
        <template v-if="question.image">
          <img :src="question.image.url" alt="Aperçu de l'image" class="max-h-56 rounded-xl border-2 border-line object-contain" />
          <button type="button" class="mt-3 text-base font-bold underline" @click="removeQuestionImage(question)">Retirer l'image</button>
        </template>
        <template v-else>
          <label class="qcm-label" :for="`image-${question.key}`">Image (facultatif) : dépose un fichier ici ou choisis-le</label>
          <input :id="`image-${question.key}`" class="qcm-field" type="file" accept="image/*" @change="onImageInput(question, $event)" />
        </template>
      </div>

      <fieldset class="flex flex-col gap-3">
        <legend class="qcm-label">Réponses : coche la bonne</legend>
        <div v-for="(choice, choiceIndex) in question.choices" :key="choiceIndex" class="flex items-center gap-3">
          <input
            v-model="question.correctIndex"
            type="radio"
            class="size-6 flex-none"
            :name="`correct-${question.key}`"
            :value="choiceIndex"
            :aria-label="`La réponse ${LETTERS[choiceIndex]} est la bonne`"
          />
          <span class="qcm-key" aria-hidden="true">{{ LETTERS[choiceIndex] }}</span>
          <input v-model="choice.text" class="qcm-field" :maxlength="LIMITS.choiceText" :aria-label="`Texte de la réponse ${LETTERS[choiceIndex]}`" />
          <button
            type="button"
            class="text-base font-bold underline"
            :disabled="question.choices.length <= LIMITS.minChoices"
            @click="removeChoice(question, choiceIndex)"
          >
            Retirer
          </button>
        </div>
        <button
          v-if="question.choices.length < LIMITS.maxChoices"
          type="button"
          class="qcm-block qcm-block-quiet min-h-12 self-start px-4 py-2 text-base"
          @click="addChoice(question)"
        >
          Ajouter une réponse
        </button>
      </fieldset>

      <div>
        <label class="qcm-label" :for="`hint-${question.key}`">Indice affiché après une erreur (facultatif)</label>
        <input :id="`hint-${question.key}`" v-model="question.hint" class="qcm-field" :maxlength="LIMITS.hint" />
      </div>
      <div>
        <label class="qcm-label" :for="`explanation-${question.key}`">Explication de la bonne réponse</label>
        <textarea :id="`explanation-${question.key}`" v-model="question.explanation" class="qcm-field" rows="2" :maxlength="LIMITS.explanation" />
      </div>
    </section>

    <button
      type="button"
      class="qcm-block qcm-block-quiet"
      :disabled="draft.questions.length >= LIMITS.maxQuestions"
      @click="addQuestion(draft)"
    >
      Ajouter une question
    </button>

    <section class="qcm-card flex flex-col gap-4 p-6" aria-labelledby="editor-actions">
      <h2 id="editor-actions" class="text-2xl font-extrabold">Terminer</h2>
      <div v-if="problems.length > 0" role="alert" class="rounded-2xl border-2 border-line bg-retry px-5 py-4 text-retry-ink">
        <p class="text-lg font-extrabold">Il reste des points à corriger :</p>
        <ul class="mt-1 list-disc pl-6 font-medium">
          <li v-for="problem in problems" :key="problem">{{ problem }}</li>
        </ul>
      </div>
      <p v-if="notice" role="status" class="rounded-2xl border-2 border-line bg-correct px-5 py-4 text-lg font-bold text-correct-ink">
        {{ notice }}
        <a v-if="publishedId" :href="`/qcm?id=${publishedId}`" class="underline">Voir la fiche</a>
      </p>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button type="button" class="qcm-block qcm-block-quiet" @click="showPreview">Essayer le QCM</button>
        <button type="submit" class="qcm-block qcm-block-primary">Enregistrer le fichier .qcm</button>
        <button type="button" class="qcm-block qcm-block-quiet" :disabled="!user || busy" @click="publish">
          {{ busy ? 'Publication…' : 'Publier dans la bibliothèque' }}
        </button>
      </div>
      <p v-if="!user" class="text-base text-ink-soft">La publication demande une connexion avec Google. L'enregistrement du fichier fonctionne sans compte.</p>
    </section>
  </form>
</template>
```

