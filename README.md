# QCM

Des questionnaires calmes, sans publicité, sans chronomètre et sans score : un lecteur Windows hors-ligne pour les fichiers `.qcm`, une bibliothèque communautaire et un éditeur en ligne.

- `packages/core` : format `.qcm` (schéma, archive ZIP, conversion WebP)
- `packages/ui` : composants du lecteur, thème et sons
- `apps/desktop` : lecteur Windows (Tauri 2)
- `apps/web` : site, bibliothèque et éditeur (Astro)
- `backend` : PocketBase

```bash
bun install
```

```bash
bun test
```

```bash
bun run dev:web
```

```bash
bun run dev:desktop
```

Le fonctionnement est décrit dans `ARCHITECTURE.md`. Ce qui reste à faire est dans `TASKS.md`.
