# Séparer définitivement l'app mobile et le site web

## Ce que j'ai vérifié dans le projet

- Le manifeste actuel (`public/mobile.webmanifest`) est déjà correct : `start_url` = `/mobile?launch=app`, `scope` = `/mobile`, `id` = `/mobile-app-v2`.
- La page `/mobile` affiche déjà un écran de connexion "type application" (`MobileAuthPanel`) puis l'app de dialogue, et la session reste connectée.
- La racine du site (`src/routes/__root.tsx`) ne contient plus aucune redirection vers `/mobile`.

Autrement dit, le code actuel fait déjà ce que tu demandes **pour une nouvelle installation**.

## Pourquoi ça ne marche toujours pas sur ton téléphone

L'application installée sur ton téléphone est encore **l'ancienne version**. Android et iOS figent le `start_url` et la portée (`scope`) au moment de l'installation : l'ancienne app a été installée avec la portée "tout le site" et le démarrage sur `/` (la landing page). Aucune modification du manifeste, aucune publication, ne peut changer ça sur une app déjà installée.

Conséquences de l'ancienne install :
- l'icône ouvre `/` = le site web,
- l'app capture aussi les liens du site.

La seule action qui règle ça : **désinstaller l'app puis la réinstaller une fois** depuis `/mobile`.

## Ce que je vais faire pour que ça soit imparable

1. Ajouter au démarrage de l'app un garde-fou : si la page est affichée en mode application installée (standalone) sur une page qui n'est pas `/mobile`, elle bascule immédiatement sur l'application `/mobile` **sans jamais afficher le site**. Ce garde-fou ne s'applique qu'en mode application installée, donc le site consulté dans le navigateur reste le site (aucune redirection, aucune boucle).
2. Ajouter sur `/mobile` un écran d'accueil de type application (logo plein écran + connexion) affiché instantanément au lancement, pour ne plus jamais voir de contenu "site web" pendant le chargement.
3. Renommer l'identité de l'app (nouvel `id`/nom court) pour que la réinstallation crée bien une icône propre, distincte de l'ancienne, portée limitée à `/mobile`.
4. Afficher une seule fois, sur `/mobile` ouvert dans le navigateur, une consigne claire : "désinstalle l'ancienne icône TalKing, puis réinstalle depuis cette page" - avec les étapes Android et iPhone.
5. Sur la page d'accueil du site : garder uniquement les téléchargements (app Windows sur PC, lien vers `/mobile` sur téléphone), sans aucune bascule automatique vers l'app.

## Résultat attendu après réinstallation

- Site web ouvert dans le navigateur -> landing page, toujours.
- Icône de l'app -> écran de connexion type app, puis le dialogue traduit, jamais le site.
- Session conservée entre les ouvertures.

## Détails techniques

- Garde-fou standalone dans `src/routes/__root.tsx` : `matchMedia("(display-mode: standalone)")` + `navigator.standalone`, redirection `window.location.replace("/mobile?launch=app")` uniquement si `pathname` n'est pas déjà sous `/mobile`. Aucun changement de domaine, donc pas de boucle.
- `public/mobile.webmanifest` : nouvel `id` (`/talking-mobile-v3`), `scope`/`start_url` maintenus sur `/mobile`; URL du manifeste versionnée dans `head()` de `src/routes/mobile.tsx`.
- Écran de démarrage app : état initial dédié dans `MobilePage` avant hydratation, à la place du `return null` actuel.
- Bloc de réinstallation dans `src/routes/mobile.tsx`, affiché seulement hors mode standalone.
- Aucune modification de la logique de crédits, de paiement ou de traduction.
