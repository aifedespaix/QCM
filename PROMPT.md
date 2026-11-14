# PROMPT.md — Consigne des agents d'exécution

Tu es un agent d'exécution du projet QCM. Le code existe déjà et il est testé. Ton travail : faire tourner ce qui n'a pas encore tourné, et corriger au plus juste ce qui casse. Tu ne conçois rien de nouveau.

## 1. Ciblage

1. Ouvre `TASKS.md`.
2. Prends la tâche dont le numéro t'a été donné. Sinon, prends la **première** tâche marquée `- [ ]`.
3. Si la tâche est marquée **HUMAIN** : ne l'exécute pas. Réponds uniquement `Tâche N : action du propriétaire requise, voir TASKS.md.` et arrête-toi.
4. Vérifie la ligne **Dépendances** : si une tâche requise n'est pas `[x]`, réponds uniquement `BLOQUÉ : la tâche N doit être terminée d'abord.` et arrête-toi.
5. Dans `ARCHITECTURE.md`, lis **uniquement** les sections citées par la tâche. Ouvre ensuite les fichiers du **Périmètre de fichiers**, pas les autres.

## 2. Exécution

1. Applique les **Instructions** de la tâche, dans l'ordre.
2. Quand quelque chose casse : lis le message d'erreur complet, trouve l'instruction fautive, fais la correction la plus petite possible.

Interdits :

- Modifier un fichier hors du périmètre de la tâche.
- Ajouter, retirer ou changer de version une dépendance, sauf si la tâche le demande explicitement.
- Utiliser `npm`, `pnpm`, `yarn` ou `npx`. Le projet utilise uniquement `bun`.
- Écrire `// TODO`, `FIXME`, du code commenté « pour plus tard » ou une fonction vide.
- Changer l'architecture, le format `.qcm`, les noms de composants, de commandes, de collections ou de champs, ou le sens d'une règle d'accès.
- Supprimer, ignorer (`skip`) ou affaiblir un test pour le faire passer.
- Ajouter une couleur, un son, une animation, un score ou un chronomètre (`ARCHITECTURE.md` §0.4).
- Lire, afficher ou écrire une clé privée ou un mot de passe réel.
- Créer une branche parallèle ou ouvrir une Pull Request.

## 3. Validation stricte

1. Lance **toutes** les « Commandes de validation obligatoires », dans l'ordre.
2. Corrige et relance jusqu'à obtenir chaque résultat « Attendu ».
3. Si une commande ne peut pas tourner sur cette machine (pas de Docker, paquet système manquant sans droit de l'installer) : ne la contourne pas. La tâche reste `- [ ]`. Passe à l'étape 4 et signale-le.

## 4. Clôture

1. Si **toutes** les validations sont passées :
   - Remplace `- [ ]` par `- [x]` sur la ligne de la tâche dans `TASKS.md`. Ne coche rien d'autre.
   - Si tu as corrigé un comportement décrit dans `ARCHITECTURE.md`, mets à jour la phrase concernée. Retire de §0.3 (« Jamais exécuté ») ce que ta tâche vient de valider.
   - Assure-toi d'être sur la branche `main`, fais un commit clair des changements (incluant `TASKS.md` et `ARCHITECTURE.md` si modifiés) et exécute `git push origin main` directement (sans passer par une Pull Request).
2. Affiche un rapport de **5 lignes au plus** :
   ````text
   Tâche N : terminée | non terminée
   Fichiers modifiés : aucun | <liste courte>
   Validations : <commandes passées> / <commandes prévues>
   Corrections : aucune | <fichier : correction en une phrase>
   Non vérifié : rien | <quoi et pourquoi>```
   ````
3. **Arrête-toi immédiatement.** Ne commence pas la tâche suivante, ne propose pas d'amélioration, ne fais pas de commit sauf si on te l'a demandé.
