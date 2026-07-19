## Objectif

Ajouter un système de **crédits vocaux séparés** pour la fonction F9 (lecture de message), avec plafonds journaliers stricts pour garantir la rentabilité, et un nouveau pack payant dédié.

## Règles métier

**Consommation F9 (lecture vocale)** :
- Coûte désormais **1 crédit vocal** (au lieu de 2 crédits mixtes).
- Plafond journalier **strict** appliqué AVANT tout débit :
  - **Compte gratuit** (0 crédit vocal acheté, non abonné) : **5 F9/jour** max.
  - **Compte abonné OU ayant des crédits vocaux** : **10 F9/jour** max.
- Source des crédits :
  - Abonnés : illimité dans la limite du plafond journalier F9 + plafond global 150/jour.
  - Non-abonnés : consomme 1 crédit du solde `voice_balance`.
  - Les crédits gratuits mensuels (20/mois) et le pack Texte **ne financent plus** F9.

**Consommation F8 (traduction texte)** : inchangée (1 crédit, wallet actuel).

## Packs

| Pack | Prix | Contenu |
|---|---|---|
| Pack crédits **Texte** (renommé) | 2,99 € | 50 crédits texte (F8) |
| Pack crédits **Vocale** (nouveau) | 2,99 € | 10 crédits vocaux (F9) |

## Changements techniques

### 1. Base de données (migration)
- `credit_wallets` : ajouter colonne `voice_balance INT NOT NULL DEFAULT 0`.
- Nouvelle RPC `consume_voice_read(_user_id uuid)` :
  - Vérifie plafond global 150/24h.
  - Vérifie plafond F9 journalier (5 pour gratuit, 10 sinon) en comptant `translations_log.operation_type = 'read_message'` sur 24h.
  - Débite `voice_balance` si non-abonné.
  - Log dans `translations_log` avec `source_type = 'voice_purchased' | 'subscription'` et `operation_type = 'read_message'`.
  - Retourne `{ok, reason, remaining_voice, subscribed, voice_daily_used, voice_daily_limit}`.
- Nouvelle RPC `add_voice_credits(_user_id, _amount)`.
- Étendre `get_user_status` pour retourner `voice_balance`, `voice_daily_used`, `voice_daily_limit`.

### 2. Backend
- `src/routes/api/read-message.ts` : remplacer `consume_translation_v2(_amount=2)` par `consume_voice_read`. Gérer les codes `voice_daily_limit_free` (message : "5 F9/jour en gratuit, passez à un pack Vocale") et `voice_daily_limit` (10/j max même en abonné) et `no_voice_credits`.
- `src/routes/api/public/payments/webhook.ts` : détecter `voice_pack_10_onetime` → appeler `add_voice_credits(10)`. Renommer aucun ID existant côté webhook (garder `credits_pack_50_onetime` pour compat).
- Créer produit Paddle `voice_pack_10_onetime` à 299 (EUR).

### 3. Frontend
- `src/routes/pricing.tsx` : renommer le pack existant en "Pack crédits Texte" + ajouter carte "Pack crédits Vocale" 2,99 € / 10 crédits vocaux, avec explication ("crédits vocaux = fonction F9 Lire un message").
- `src/routes/app.tsx` : afficher un 3ᵉ compteur vocal (violet) à côté des crédits texte, format `X crédits vocaux`. Bannière blocante si plafond F9 atteint, distincte du plafond 150/j global.
- Toasts mis à jour selon le code d'erreur reçu.

### 4. Admin
- `src/routes/api/admin.ts` + `admin.tsx` : ajouter ligne "Crédits vocaux" par utilisateur, et bouton admin d'ajout de crédits vocaux (nouvelle RPC `admin_add_voice_credits`).

## Ce qui reste inchangé
- Prix abonnement 29,99 €/an, plafond global 150/j, F8 (1 crédit), UI settings, hotkeys, logs AI.

## Notes rentabilité
- Coût F9 moyen ≈ 0,012 € → pack 2,99 € / 10 = 0,299 €/F9 → **marge ~96 %**.
- Abusif abonné plafonné à 10 F9/j → coût max ≈ 0,12 €/jour = 3,60 €/mois, largement couvert par 29,99 €/an amorti + fenêtre journalière.
