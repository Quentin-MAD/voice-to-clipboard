# Corriger l'achat de l'abonnement et fiabiliser la livraison des achats

## Ce qui cloche exactement

Le problème ne vient pas du code : il vient du catalogue Paddle en environnement **live**.

Vérifié via l'API Paddle à l'instant :

- En live, le seul tarif portant l'identifiant `vox_subscription_yearly` est **archivé** (et encore à 29,99 €).
- Les 4 autres tarifs live (pack Texte, pack Vocaux, pack Mobile, année supplémentaire) sont bien **actifs** à 2,99 € / 24,99 €.
- Le code (`resolveActivePaddlePrice`) ne cherche que des tarifs `status=active` : ne trouvant rien pour l'abonnement, il renvoie "Ce tarif est momentanément indisponible". C'est le comportement attendu, pas un bug.

Pourquoi la réactivation précédente n'a pas tenu : en **sandbox** il existe **deux** tarifs actifs avec le même identifiant `vox_subscription_yearly` (créés le 31/07 et le 02/08). La synchronisation test → live au moment de la publication utilise cet identifiant comme clé unique ; avec un doublon, elle a re-écrasé/ré-archivé le tarif live (horodatage de modification 02/08 21:36 sur les 5 tarifs live).

## Correctifs

1. **Nettoyer le doublon en sandbox** : archiver le tarif annuel en trop (`pri_01kytt10...`), garder un seul tarif annuel actif à 24,99 €/an pour `vox_subscription_yearly`.
2. **Réparer le tarif live** : repasser le tarif annuel live en `active` avec le montant 24,99 € et le cycle annuel, pour qu'il corresponde exactement au tarif sandbox conservé.
3. **Revérifier après coup** les 5 tarifs live (Gratuit exclu) : abonnement annuel, année supplémentaire, pack Texte, pack Vocaux, pack Mobile - tous doivent être actifs, uniques et au bon montant.
4. **Message d'erreur plus utile** côté app : si un tarif reste introuvable, afficher clairement lequel et proposer de contacter le support, au lieu d'un message générique.

## Vérification de la livraison après achat

Le webhook (`/api/public/payments/webhook`) est déjà correct sur le principe : garde d'idempotence par transaction, attribution via `customData.userId`, packs de crédits (75 texte / 45 vocaux / 75 mobile), extension d'année, révocation en cas de remboursement.

Points à contrôler et corriger si nécessaire :

- Vérifier que l'endpoint webhook **live** est bien enregistré avec `?env=live` et abonné aux événements : `transaction.completed`, `subscription.created/activated/updated/canceled`, `adjustment.created/updated`.
- Vérifier que chaque achat passe bien `customData.userId` (déjà fait côté site, app Windows et app mobile) : sans lui, aucun crédit n'est attribué.
- Ajouter un **filet de sécurité** : si un `transaction.completed` arrive sans `userId`, retrouver le membre par l'email du client Paddle avant d'abandonner, et journaliser l'incident.
- Ajouter dans la page admin une trace lisible des transactions Paddle reçues (montant, membre, type, crédits accordés) afin de pouvoir vérifier d'un coup d'œil qu'un achat a bien été crédité.

## Détails techniques

- Sandbox : `PATCH /prices/pri_01kytt10gxdyqg6n6f8z5fn592` → `status: archived`.
- Live : `PATCH /prices/pri_01kxr9nq22x1ke8rgfte2p12j0` → `status: active`, `unit_price.amount: "2499"`.
- `src/utils/payments.server.ts` : conserver le filtre `status=active`, préciser le message d'erreur avec l'identifiant du tarif.
- `src/routes/api/public/payments/webhook.ts` : repli par email client dans `handleTransactionCompleted` + log explicite.
- Admin : nouvelle vue lecture seule alimentée par `payment_transactions`.
