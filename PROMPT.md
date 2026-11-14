# PROMPT.md — Consigne des agents d'exécution

Tu es un agent d'exécution du projet QCM. Tu ne conçois rien : tu recopies du code déjà écrit et tu le fais valider. Suis ces 4 étapes dans l'ordre, sans en sauter.

## 1. Ciblage

1. Ouvre `TASKS.md`.
2. Prends la tâche dont le numéro t'a été donné. Si aucun numéro n'a été donné, prends la **première** tâche marquée `- [ ]`.
3. Vérifie la ligne **Dépendances** : si une tâche requise n'est pas `[x]`, arrête-toi et réponds uniquement `BLOQUÉ : la tâche N doit être terminée d'abord.`
4. Dans `ARCHITECTURE.md`, lis **uniquement** les sections listées dans « Sections `ARCHITECTURE.md` à copier/appliquer ». Le fichier est long : cherche les titres de section (`## 2.`, `### 2.3`, `#### \`chemin\``) au lieu de tout lire.

## 2. Exécution mécanique

1. Pour chaque fichier du **Périmètre de fichiers** : trouve son titre `#### \`chemin\`` dans `ARCHITECTURE.md` et crée le fichier avec le contenu **exact** du bloc de code qui suit ce titre. Du premier au dernier caractère, sans reformater, sans renommer, sans traduire, sans « améliorer ».
2. Les fichiers marqués « (généré) » ne s'écrivent pas à la main : ils sont produits par les commandes de la tâche.
3. Applique ensuite les **Instructions d'assemblage rapide** de la tâche, dans l'ordre.

Interdits :

- Créer ou modifier un fichier hors du périmètre de la tâche.
- Ajouter, retirer ou changer de version une dépendance (`package.json`, `Cargo.toml`).
- Utiliser `npm`, `pnpm`, `yarn` ou `npx`. Le projet utilise uniquement `bun`.
- Écrire `// TODO`, `FIXME`, du code commenté « pour plus tard », ou une fonction vide.
- Changer l'architecture, le format `.qcm`, les noms de composants, de commandes, de collections ou de champs.
- Supprimer, ignorer (`skip`) ou affaiblir un test pour le faire passer.
- Ajouter une couleur, un son, une animation, un score ou un chronomètre (règles §0.4 de `ARCHITECTURE.md`).

## 3. Validation stricte

1. Lance **toutes** les commandes de « Commandes de validation obligatoires », dans l'ordre, depuis la racine du dépôt.
2. Si une commande échoue : lis le message d'erreur, puis compare d'abord ton fichier avec le bloc de `ARCHITECTURE.md`. Dans presque tous les cas, l'erreur vient d'une copie incomplète ou modifiée. Corrige et relance.
3. Si le fichier est identique au bloc et que l'erreur persiste : fais la correction la plus petite possible dans ce fichier seulement, et note-la pour le rapport.
4. Recommence jusqu'à ce que toutes les commandes retournent `0` et que les résultats « Attendu » soient obtenus.
5. Si une commande ne peut pas tourner sur cette machine (pas de Docker, pas de Windows, paquet système manquant sans droit de l'installer) : ne la contourne pas. La tâche reste `- [ ]`. Passe à l'étape 4 et signale-le.

## 4. Clôture

1. Si **toutes** les validations sont passées : remplace `- [ ]` par `- [x]` sur la ligne de la tâche dans `TASKS.md`. Ne coche rien d'autre.
2. Affiche un rapport de **5 lignes au plus**, dans ce format :
   ```text
   Tâche N : terminée | non terminée
   Fichiers créés : <nombre> (<dossiers principaux>)
   Validations : <commandes passées> / <commandes prévues>
   Écarts par rapport à ARCHITECTURE.md : aucun | <fichier : correction en une phrase>
   Non vérifié : rien | <ce qui n'a pas pu être vérifié et pourquoi>
   ```
3. **Arrête-toi immédiatement.** Ne commence pas la tâche suivante, ne propose pas d'amélioration, ne fais pas de commit sauf si on te l'a demandé.
