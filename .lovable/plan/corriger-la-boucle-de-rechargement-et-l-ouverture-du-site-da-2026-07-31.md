# Corriger la boucle de rechargement et l'ouverture du site dans l'app mobile

## Ce qui se passe aujourd'hui

Le code du site contient une redirection automatique : si la page est ouverte en mode "application installée" et que ce n'est pas une page `/mobile`, il renvoie vers l'autre domaine (`talking-translator.com` <-> `www.talking-translator.com`).

Comme l'application installée capture les liens des deux domaines, chaque redirection est de nouveau interceptée par l'app, qui redirige à son tour vers l'autre domaine : c'est un aller-retour sans fin, d'où le site qui "refresh à l'infini" sans jamais afficher le contenu.

L'app continue par ailleurs d'ouvrir le site parce que l'installation existante sur le téléphone garde en mémoire l'ancienne portée (scope) du temps où l'app couvrait tout le site. Une mise à jour du fichier de manifeste ne change pas la portée d'une app déjà installée.

## Ce que je vais faire

1. Supprimer complètement la redirection entre domaines dans la racine du site. C'est elle qui provoque la boucle. Le site s'affichera normalement, même s'il a été ouvert depuis l'app.
2. Remplacer ce comportement par un bandeau discret : quand une page du site (hors `/mobile`) est affichée dans l'app installée, un message propose "Ouvrir dans le navigateur" - aucune redirection automatique, donc aucune boucle possible.
3. Donner une nouvelle identité à l'application mobile (nouveau fichier de manifeste dédié, avec un identifiant et une portée strictement limités à `/mobile`). Les nouvelles installations n'intercepteront plus jamais les liens du site.
4. Ajouter, sur la page `/mobile`, une note courte expliquant qu'une réinstallation unique de l'app est nécessaire pour les téléphones où l'ancienne version est déjà installée (limitation d'Android/iOS : la portée est figée à l'installation).

## Détails techniques

- `src/routes/__root.tsx` : retrait du bloc `useEffect` de redirection `standalone` (lignes ~138-161), conservation du suivi de visites.
- Nouveau composant client léger (bandeau "Ouvrir dans le navigateur") monté dans le layout racine, affiché uniquement si `display-mode: standalone` et route hors `/mobile`.
- Nouveau `public/mobile.webmanifest` avec `id`, `start_url` et `scope` sur `/mobile/`; l'ancien `public/manifest.webmanifest` est conservé mais réduit à la même portée pour compatibilité.
- `src/routes/mobile.tsx` : `link rel="manifest"` pointé vers `/mobile.webmanifest`.
- Aucun changement de logique métier, de crédits ou de paiement.
