## Objectif

Rendre le site 100% en français par défaut et permettre à l'outil de traduction intégré du navigateur (Chrome/Edge, icône Google Translate en haut à droite de la barre d'URL) de proposer et exécuter correctement la traduction vers l'anglais (ou toute autre langue).

## Pourquoi ça ne marche pas aujourd'hui

Le shell HTML dans `src/routes/__root.tsx` déclare `<html lang="en">`. Chrome se base sur cet attribut pour décider s'il propose la traduction. Comme le contenu mélange français et anglais alors que la balise dit "en", le navigateur ne propose pas de traduction (ou propose une mauvaise langue source).

De plus, plusieurs zones d'interface sont encore en anglais (métadonnées SEO, footer, menu utilisateur, page auth, admin, légales partielles, boutons "Try again / Go home / Sign in / Sign out", modale support, modale settings hotkey, page pricing, page /app, toasts).

## Ce que je vais faire

### 1. Déclarer le français comme langue du document
- Dans `src/routes/__root.tsx` : `<html lang="fr">` au lieu de `"en"`.
- Mettre à jour les balises `<meta>` (`title`, `description`, `og:title`, `og:description`) en français.
- Ajouter `<meta name="google" content="notranslate" />` **retiré** (au contraire on veut la traduction) et ajouter `translate="yes"` implicitement (défaut). S'assurer qu'aucune balise `notranslate` ne bloque Google Translate.

### 2. Traduire toutes les chaînes visibles restantes en français
Fichiers à passer en revue et traduire (textes UI uniquement, aucune logique métier modifiée) :
- `src/routes/__root.tsx` (404, ErrorComponent : "Page not found", "Try again", "Go home", etc.)
- `src/routes/index.tsx` (landing - vérifier qu'aucun résidu anglais ne subsiste)
- `src/routes/app.tsx` (interface principale, boutons, tooltips, toasts)
- `src/routes/auth.tsx` (connexion / inscription)
- `src/routes/admin.tsx` (tableau de bord admin)
- `src/routes/pricing.tsx`
- `src/routes/legal.*.tsx` (vérifier - déjà largement en FR mais compléter)
- `src/components/Footer.tsx`
- `src/components/UserMenu.tsx` (menu profil + modale support)
- Modale settings/hotkey dans `src/routes/app.tsx`
- Messages `toast.*` et erreurs affichées à l'utilisateur

### 3. Meta SEO en français
- Title : "TalKing - Traducteur vocal en temps réel"
- Description en français
- `og:*` et `twitter:*` alignés

### 4. Vérification manuelle du widget de traduction du navigateur
Après déploiement :
- Ouvrir la landing en Chrome
- Vérifier que l'icône Google Translate apparaît à droite de la barre d'URL et propose "Français → Anglais"
- Cliquer et vérifier que tout le contenu (titres, boutons, footer, modales) est traduit

## Hors périmètre

- Pas de i18n applicatif (react-i18next) : on ne bascule pas dynamiquement les langues côté app. On s'appuie uniquement sur le traducteur natif du navigateur, comme demandé.
- Pas de changement de logique métier ni de base de données.
- Les textes techniques internes (logs, noms de variables, commentaires) restent tels quels.

## Détails techniques

- Le seul changement structurel est `lang="en"` → `lang="fr"` dans `RootShell`.
- Aucun élément ne doit porter `translate="no"` ou la classe `notranslate` sauf les vraies marques ("TalKing", codes, emails) - je vérifierai qu'on ne bloque pas la traduction globalement.
- Le composant `UserMenu` et la modale Support restent fonctionnels, seul le texte change.
