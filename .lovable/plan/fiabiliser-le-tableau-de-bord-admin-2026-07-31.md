# Fiabiliser le tableau de bord admin

## Ce que disent réellement les données

Vérifications faites dans la base :

- **5 comptes** au total, dont **5 marqués "Testeur"**.
- **Abonnements** : aucun abonnement payant. Les 2 comptes comptés comme "abonnés" sont deux accès offerts manuellement depuis l'admin (fin de validité en 2126), l'un en environnement `admin`, l'autre en environnement `sandbox`. Un 3e est `canceled`, deux sont `inactive`.
- **Paiements** : 3 transactions, **toutes en mode test** (2 achats de crédits + 1 abonnement). Zéro paiement réel. Le tableau ne compte que le mode réel, d'où des revenus à 0.
- **Coûts IA** : 131 lignes de consommation, mais **114 n'ont aucun utilisateur associé**. L'attribution par membre est donc largement fausse, et le code compense avec une estimation (`Math.max` entre réel et estimé) qui gonfle les chiffres.

Conclusion : le chiffre "2 abonnés" n'est pas un bug d'affichage, c'est un mélange entre accès offerts, comptes de test et abonnements réels. Le reste de la page souffre du même problème : tout est agrégé sans distinguer réel / test / offert.

## Ce que je propose de changer

### 1. Séparer clairement les catégories de membres
Remplacer le compteur unique "abonnés" par trois compteurs distincts :
- Abonnés payants (paiement réel confirmé)
- Accès offerts (lifetime / année accordés depuis l'admin)
- Comptes testeurs

Le badge "abonné" dans la liste des membres indiquera aussi l'origine (payant / offert / testeur).

### 2. Filtre global "Mode réel / Mode test / Tout"
Un sélecteur en haut de page qui filtre de façon cohérente les revenus, les abonnements, les membres et les coûts. Par défaut sur **Mode réel**, pour que la page reflète l'activité commerciale véritable.

### 3. Arrêter d'inventer des coûts
Supprimer l'estimation qui prend le maximum entre le coût réel et un coût reconstitué. À la place :
- afficher le coût réellement enregistré,
- afficher à côté une ligne "coût non attribué" pour les consommations sans utilisateur,
- indiquer le taux de couverture (part des opérations avec coût réel) pour que tu saches à quel point le chiffre est fiable.

### 4. Corriger l'attribution des coûts à la source
Les enregistrements de consommation IA écrits sans identifiant d'utilisateur seront corrigés côté serveur pour que les futurs coûts soient rattachés au bon membre. Cela n'efface rien de l'historique, mais stoppe l'accumulation de données inexploitables.

### 5. Bandeau d'état des données
Un encart en haut de la page qui résume : nombre de comptes réels, comptes de test, paiements réels, et couverture des coûts. Objectif : ne plus jamais lire un chiffre sans savoir ce qu'il contient.

## Détails techniques

- `admin_list_users()` : ajouter les colonnes `access_origin` (`paid` / `granted` / `none`), `sub_environment`, et un `is_paid_subscriber` basé sur la présence d'une transaction `environment = 'live'`.
- `src/routes/api/admin.ts` :
  - retirer les blocs `estimatedUserCostUsd` / `estimatedTotalEur` / `estimatedTesterEur` et les `Math.max(...)`,
  - ajouter `unattributed_cost_eur` et `cost_coverage_ratio`,
  - paramétrer les agrégats par environnement (`live` / `sandbox` / `all`) via un paramètre de requête,
  - compter séparément `paid_subs`, `granted_subs`, `testers`.
- `src/routes/admin.tsx` : sélecteur d'environnement, nouvelles cartes de compteurs, bandeau d'état, badges d'origine dans le tableau des membres.
- Points d'écriture de `ai_usage_log` (routes `translate-audio`, `read-message`, `mobile-dialog`) : garantir l'`user_id` et attendre l'écriture avant de répondre.

## Hors périmètre

Aucun changement sur les quotas, les prix, les paiements Paddle ou l'apparence des applications.
