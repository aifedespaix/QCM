# Audit : chargement des pages et référencement

Novembre 2026. Symptômes signalés : sur la bibliothèque ou une fiche de QCM, la page reste parfois
vide, affiche « La bibliothèque est encore vide » pendant de longues secondes, ou ne se remplit
qu'après un rechargement.

## Causes trouvées

### 1. Tout le contenu dépendait du JavaScript et d'un aller-retour réseau (cause principale)

Le site était 100 % statique : chaque page utile (`/bibliotheque`, `/qcm`) ne contenait qu'un îlot
`client:only="vue"` vide. Pour voir quelque chose, le navigateur devait, dans l'ordre :

1. télécharger le HTML (vide) ;
2. télécharger Vue, le SDK PocketBase et `@qcm/core` (zod, yaml, fflate) : environ 400 Ko de JS
   avant compression ;
3. exécuter l'îlot ;
4. seulement alors, appeler PocketBase (autre domaine : nouvelle connexion DNS + TLS).

Sur mobile ou réseau moyen, l'écran restait blanc ou en squelette plusieurs secondes. Si une étape
échouait (module JS introuvable, requête bloquée), la page restait vide.

### 2. Faux « La bibliothèque est encore vide »

`LibraryBrowser.vue` gardait la première page dans `localStorage` et l'affichait **comme une réponse
définitive** (`state = 'ready'`) en attendant le réseau. Une copie vide (enregistrée un jour où
PocketBase renvoyait 0 QCM : base neuve, mauvais conteneur sur le réseau partagé de Dokploy…)
affichait donc « La bibliothèque est encore vide » jusqu'à la fin de la vraie requête. Or une requête
bloquée pouvait durer jusqu'à ~26 s (4 essais × 6 s de délai) ; en cas d'échec final, la copie vide
restait affichée **sans message d'erreur**.

### 3. Rechargement nécessaire après un déploiement

Une page HTML gardée en cache (service worker, onglet resté ouvert, retour arrière) référence les
fichiers `/_astro/*.js` de l'ancien déploiement, supprimés par le nouveau. L'import de l'îlot échoue,
mais le script de reprise n'écoutait que `vite:preloadError`, qui ne se déclenche pas dans ce cas :
seul un bandeau « Recharger » apparaissait, au bout de 6 s.

### 4. Aucun contenu pour les moteurs de recherche

- `/bibliotheque` : HTML sans aucun QCM.
- `/qcm?id=…` : une seule adresse pour toutes les fiches, contenu chargé en JS, marquée `noindex`,
  absente du sitemap. **Aucune fiche de QCM n'était indexable.**
- Pas de titre, description, image ni données structurées propres à chaque QCM.

## Ce qui a changé

### Rendu serveur (SSR) des pages dynamiques

- Adaptateur `@astrojs/node` ; `output: 'static'` conservé : accueil, éditeur, suivi, admin restent
  générés au build. La bibliothèque, les fiches et `sitemap.xml` sont rendus à chaque visite
  (`export const prerender = false`).
- Le serveur lit PocketBase par le **réseau interne Docker** (`PB_INTERNAL_URL`, quelques ms), avec
  un délai de 2,5 s et un nouvel essai (`src/lib/server/catalog.ts`).
- La page arrive avec la liste ou la fiche dans le HTML : affichage immédiat, même sans JavaScript.
  Les composants sont ensuite hydratés (`client:load`) avec ces données, sans refaire la requête.
- Si PocketBase ne répond pas, la page part quand même (code 503) et se charge dans le navigateur
  comme avant.

### Bibliothèque

- Cache `localStorage` supprimé : « vide » ne s'affiche qu'après une vraie réponse du serveur.
- Pendant une recherche, la liste reste affichée (atténuée) au lieu de repasser au squelette.
- Les filtres sont dans l'adresse (`/bibliotheque/?matiere=svt&niveau=3e&page=2`) : partageables,
  rendus par le serveur, et la pagination est faite de vrais liens suivis par les moteurs.

### Fiches de QCM

- Nouvelle adresse lisible : `/qcm/les-fractions-comparer-et-simplifier-<id>/`.
- `/qcm?id=<id>` (anciens liens partagés) et un titre modifié redirigent en **301** vers l'adresse à
  jour (`&jouer=1` conservé).
- QCM non publié : 404 `noindex` pour les moteurs, mais l'auteur et la modération le voient toujours
  (chargement dans le navigateur avec leur compte).

### Hébergement (nginx + Node dans `qcm-web`)

- nginx sert les fichiers générés et passe le reste au serveur Node (`@ssr`).
- **Micro-cache** de 20 s des pages rendues : les pics de visites ne sollicitent pas PocketBase.
- **Dernière copie valide** servie si le rendu échoue (PocketBase injoignable, Node redémarré).
- Healthcheck : `/api/health` (trajet vers PocketBase) **et** `/healthz` (serveur de rendu).

### Robustesse côté navigateur

- Rechargement automatique (une fois) quand le code d'un îlot est introuvable.
- Service worker v4 : une navigation qui traîne plus de 6 s affiche la copie en cache de la page si
  elle existe (la version fraîche est rangée dès son arrivée).
- `preconnect` vers le domaine de PocketBase (images et API).
- Compte connecté : affiché juste après l'hydratation, sans écart avec le HTML du serveur.

### Référencement

| Élément | Avant | Après |
|---|---|---|
| Fiches de QCM indexables | 0 | toutes les fiches publiées |
| `sitemap.xml` | 4 pages fixes | pages fixes + chaque QCM avec `lastmod` |
| Titre / description | génériques | propres à chaque QCM et à chaque filtre (matière, niveau) |
| Image de partage | logo du site | miniature du QCM quand elle existe |
| Données structurées | `WebSite`, `SoftwareApplication` | + `Organization`, `CollectionPage`/`ItemList`, `Quiz`, `BreadcrumbList`, note moyenne |
| Canonique | parfois sans la barre finale | toujours la forme servie par nginx (`/…/`) |
| `robots` | `noindex, nofollow` sur les pages exclues | `noindex, follow` (les liens restent suivis) ; recherche libre et tri en `noindex` |
| `robots.txt` | — | exclut aussi `/api/` (sauf `/api/files/`) et `/_/` |

## À faire après le déploiement

1. Vérifier dans Dokploy que `qcm-web` démarre (healthcheck vert) et que `PUBLIC_SITE_URL` est bien
   l'adresse publique (canoniques et sitemap en dépendent).
2. Google Search Console : soumettre `https://<site>/sitemap.xml`, puis inspecter une fiche de QCM.
3. Tester une fiche avec l'outil « Résultats enrichis » de Google et le débogueur de partage d'un
   réseau social.

## Pistes non traitées

- Le JS des pages bibliothèque/fiche embarque tout `@qcm/core` (zod, yaml) alors qu'il ne sert qu'à
  la lecture d'un QCM : un import dynamique allégerait le premier chargement (moins critique
  maintenant que le contenu arrive dans le HTML).
- Pages d'atterrissage par matière (`/bibliotheque/?matiere=…`) dans le sitemap une fois la
  bibliothèque assez fournie.
