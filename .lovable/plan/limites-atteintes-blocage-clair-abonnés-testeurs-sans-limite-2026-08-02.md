# Limites atteintes : blocage clair + abonnés/testeurs sans limite journalière

## Ce qui se passe aujourd'hui

- Quand une limite est atteinte, l'app Windows et l'app mobile affichent seulement un petit toast (parfois juste "Erreur"), sans explication ni vrai appel à l'action.
- Les liens "Voir les plans" utilisent `window.open`. Dans l'app Windows, aucune gestion d'ouverture externe n'existe côté Electron : le site risque de s'ouvrir dans une fenêtre de l'application au lieu du navigateur.
- Les abonnés et les testeurs subissent encore des plafonds journaliers : 150 opérations/jour (anti-spam), 50 lectures vocales/jour, 350 vocales/mois, 500 traductions mobile/mois.

## Ce qu'on met en place

### 1. Abonnés et testeurs : plus aucune limite

Suppression de tous les plafonds (journaliers ET mensuels) pour un abonnement actif ou un compte testeur, sur les trois usages : traduction texte (F8), lecture vocale (F9), dialogue mobile. Les comptes gratuits gardent leurs limites actuelles (30 texte/jour, 15 vocales/jour, 35 mobile/jour) et leurs crédits achetés.

### 2. Fenêtre bloquante explicite dans les deux applications

Une modale au style natif de chaque app remplace le toast, avec :
- Le motif exact : limite journalière atteinte, ou plus de crédits.
- Ce qu'il reste et l'heure de réinitialisation quand c'est une limite journalière.
- Bouton principal "S'abonner - plus aucune limite" qui ouvre la page Plans dans le navigateur externe.
- Bouton secondaire "Acheter des crédits" quand le blocage vient d'un solde à zéro.
- Bouton "Fermer".

Cas couverts : limite journalière texte, limite journalière vocale, limite journalière mobile, crédits texte épuisés, crédits vocaux épuisés, crédits mobile épuisés.

### 3. Ouverture des liens toujours dans le navigateur

Côté application Windows, tous les liens externes sont forcés vers le navigateur système ; aucune page du site ne peut plus s'afficher dans une fenêtre de l'application. Côté mobile (PWA), la page Plans s'ouvre aussi hors de l'app.

### 4. Page Plans mise à jour

Les descriptions de l'abonnement sont corrigées : traductions texte, lectures vocales et traductions mobile illimitées, sans limite journalière ni mensuelle. Suppression des mentions "150 traductions/jour", "50 lectures/jour", "350/mois", "500/mois" sur la carte Abonnement. Les cartes Gratuit et packs de crédits restent inchangées.

## Détails techniques

- Migration Supabase : `consume_translation_v2`, `consume_voice_read`, `consume_mobile_translation` — sortie anticipée sans aucun contrôle de quota si `is_subscription_active` ou rôle `tester`. `get_user_status` renvoie des limites nulles/illimitées pour ces comptes (le badge crédits affiche déjà "∞").
- Nouveau composant partagé de blocage (`LimitDialog`) rendu dans `src/routes/app.tsx` (skin Windows) et `src/routes/mobile.tsx` (skin natif mobile), piloté par les codes serveur existants : `daily_limit`, `voice_daily_limit`, `mobile_daily_limit`, `no_credits`, `no_voice_credits`, `mobile_no_credits`.
- `src/routes/api/mobile-dialog.ts` : renvoyer un `code` explicite pour tous les cas de refus (actuellement partiellement absent) afin que la modale mobile sache quoi afficher.
- Electron : ajout de `shell.openExternal` via `setWindowOpenHandler` + interception de `will-navigate` dans `electron/main.cjs`, et exposition d'un `openExternal` dans `electron/preload.cjs`. Les apps utilisent ce canal quand il existe, sinon `window.open`.
- Pas de changement sur l'auto-écriture, les hotkeys, ni le pipeline audio.

## Remarque

En rendant les abonnés totalement illimités, il n'y a plus de garde-fou contre un usage massif d'un seul compte (coût IA). On pourra ajouter plus tard une alerte admin si un compte dépasse un seuil de coût, sans bloquer l'utilisateur.
