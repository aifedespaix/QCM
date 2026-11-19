# Publier des QCM avec un agent

Un membre crée un jeton sur le site (page `/agent`), le donne à un agent avec l'adresse du site, et l'agent publie des QCM à son nom. L'agent ne connaît ni le compte Google ni le mot de passe de quiconque.

## Ce que l'agent reçoit

- l'adresse du site, par exemple `https://qcm.example.org` (`QCM_SITE_URL`) ;
- un jeton `qcm_…` (`QCM_AGENT_TOKEN`), valable 7, 30 ou 90 jours, révocable par le membre à tout moment.

Le jeton ne s'écrit dans aucun fichier du dépôt, ni dans un message de commit, ni dans une réponse.

## Procédure

1. **Rédiger `data.yaml`** dans un nouveau dossier (par exemple `examples/<sujet>/`), en suivant le format et les règles pédagogiques de `docs/skill-ingestion-cours.md` (`QCM_AI_PROMPT`). Pour illustrer, ajouter `image: media/<nom>.webp` à une question : le nom est en minuscules, chiffres, `_` et `-`.
2. **Produire les images** dans `media/`, au format WebP, 1280 px au plus sur le grand côté. Pour un schéma scientifique, dessiner un SVG par code puis le convertir (voir `examples/atome/build-media.mjs`) : les nombres de particules, les liaisons et les couleurs restent exacts. Un modèle de génération d'images se trompe sur ces détails.
3. **Regarder chaque image** avant de continuer : lisible sur fond clair, rien qui dépasse, aucun texte coupé.
4. **Valider** : `bun run pack examples/<sujet>` doit afficher `OK` (questions et images comptées). Corriger jusqu'à ce que ce soit le cas.
5. **Publier** : `QCM_SITE_URL=… QCM_AGENT_TOKEN=… bun run --filter @qcm/web publish-qcm examples/<sujet>` (dossier relatif à la racine du dépôt).

## Résultat

- Pour un membre ordinaire, le QCM est **en attente de relecture** : il devient public après validation sur `/admin`.
- Pour un administrateur, il est **publié directement**.
- Relancer la commande avec le même titre **met à jour** le QCM au lieu d'en créer un second (il repasse en relecture, sauf pour un administrateur).

## Erreurs

| Message | Cause |
|---|---|
| `401 Jeton manquant ou invalide` | Jeton mal copié, ou révoqué. |
| `401 Ce jeton a expiré` | Demander un nouveau jeton au membre. |
| `400 QCM refusé : …` | Un champ ne respecte pas les limites (matière, niveau, taille du fichier 20 Mo…). Le message dit lequel. |
| `E_…` avec une liste de points | `data.yaml` ou une image est invalide : corriger ce qui est listé. |

## Appel direct (sans le script)

`POST {site}/api/qcm/agent-publish`, en-tête `Authorization: Bearer qcm_…`, corps `multipart/form-data` : `title`, `description`, `subject`, `level`, `chapter`, `language`, `question_count`, `has_images`, `fingerprint` (`qcmFingerprint` de `@qcm/core`), `file` (le `.qcm`), et `thumbnail` en option (WebP). Le serveur ne peut pas ouvrir le ZIP : le contenu est revalidé par les lecteurs. Le script s'occupe de tout cela.
