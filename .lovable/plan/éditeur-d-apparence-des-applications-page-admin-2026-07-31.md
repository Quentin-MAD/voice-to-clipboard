# Éditeur d'apparence des applications (page admin)

Objectif : pouvoir modifier l'apparence des applis Windows et Mobile depuis `/admin`, visualiser le résultat en aperçu, puis publier seulement quand tu es satisfait.

Point clé vérifié : l'appli Windows charge directement la page `/app` du site, et l'appli mobile est la page `/mobile`. Les deux peuvent donc être re-stylées sans recompiler ni republier d'installeur `.exe`.

## Ce que tu pourras modifier

Pour chaque appli séparément (Windows et Mobile) :

- **Couleurs et polices** : fond, bleu clair, texte, gris, rayons des coins, taille de police de base, police titres/textes (parmi une liste sûre respectant la charte).
- **Textes et libellés** : titre d'accueil, sous-titre, textes des boutons principaux, message d'aide, bandeau d'information.
- **Logos et images** : remplacer le logo affiché en haut de chaque appli (upload d'image).
- **Options d'affichage** : afficher ou masquer le badge de crédits, le bandeau d'info, le bloc paramètres, le bouton support.

## Fonctionnement brouillon / publication

```text
Admin modifie  ->  Brouillon enregistré  ->  Aperçu en direct dans /admin
                                          ->  Bouton "Publier" -> visible par tous
                                          ->  Bouton "Revenir au publié"
```

- Deux versions stockées : `draft` et `published`.
- Les applis lisent uniquement la version `published`.
- L'aperçu affiche la vraie appli (Windows et Mobile) dans un cadre, en mode brouillon, avec un sélecteur d'appareil (fenêtre PC / téléphone).
- Historique des dernières publications avec possibilité de restaurer une version précédente.

## Détails techniques

1. **Base de données** : nouvelle table `app_appearance` (colonnes : `app` = `windows` | `mobile`, `state` = `draft` | `published`, `config` jsonb, `updated_at`), plus une table `app_appearance_history`. Lecture publique en `SELECT` uniquement pour les lignes `published`, écriture réservée au rôle admin via fonctions serveur.
2. **Bucket de stockage** `app-assets` pour les logos uploadés (lecture publique, écriture admin).
3. **Serveur** : fonctions `getAppearance(app, state)`, `saveDraft`, `publishDraft`, `restoreVersion` dans `src/utils/appearance.functions.ts`, protégées par `requireSupabaseAuth` + vérification du rôle admin.
4. **Client** : hook `useAppearance(app)` qui charge la config publiée (ou brouillon si `?preview=draft`), applique les tokens CSS via variables inline sur le conteneur racine et fournit les textes/visibilités. `src/routes/app.tsx` et `src/routes/mobile.tsx` consomment ce hook ; leurs valeurs actuelles servent de valeurs par défaut, donc rien ne change tant que tu ne modifies rien.
5. **Admin** : nouvel onglet « Apparence » dans `src/routes/admin.tsx` avec, à gauche, les réglages (couleurs, polices, textes, logo, options) et, à droite, l'aperçu en iframe `/app?preview=draft` ou `/mobile?preview=draft`, plus les boutons Enregistrer le brouillon / Publier / Réinitialiser.
6. **Aucune recompilation** de l'appli Windows nécessaire : les changements publiés apparaissent au prochain lancement ou rafraîchissement de l'appli.

## Limites

- Cet éditeur change l'apparence de l'interface, pas la fenêtre native Windows (icône, barre de titre système) ni la logique métier.
- Les changements de structure profonde (nouveaux blocs, nouvelles pages) restent des modifications de code.
