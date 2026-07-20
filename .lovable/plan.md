## Objectif

Ajouter une option (case à cocher) dans les **Paramètres** de l'app Windows qui, quand elle est activée, change le comportement de **F8** : au lieu de copier la traduction dans le presse-papiers, l'app **tape automatiquement le texte au clavier** dans la fenêtre active (utile pour les jeux qui bloquent le collage : Star Citizen, certains MMO, anti-triche, etc.).

F9 (lecture vocale) et le comportement F8 par défaut (copier-coller) restent **strictement identiques**.

## UX

Dans le modal **Paramètres** (bouton engrenage), sous la section hotkeys, nouvelle case à cocher :

- **Label** : « Mon jeu ne prend pas en compte le copier-coller »
- **Description** (sous le label, en petit gris) :
  > Quand cette option est activée, F8 n'utilise plus le presse-papiers. Après votre phrase, cliquez dans la zone de chat du jeu puis appuyez sur la touche d'écriture (par défaut **F10**, modifiable ci-dessous) : TalKing prendra le contrôle du clavier et tapera la traduction lettre par lettre, comme si vous l'écriviez vous-même. Compatible avec tous les jeux, même ceux qui bloquent le collage.

Sous la case, quand cochée, apparaît :
- Champ **Touche d'écriture automatique** (par défaut `F10`, modifiable via le même sélecteur que les autres hotkeys).
- Petit indicateur d'état : `En attente de traduction` / `Prête à écrire` / `Écriture…`

## Flux utilisateur (mode auto-type activé)

1. F8 pressée → enregistrement (identique).
2. F8 pressée à nouveau → transcription + traduction (identique).
3. Différence : le texte n'est **pas** copié dans le presse-papiers. Il est stocké en mémoire dans l'app avec un état `pending`. Une notification / overlay affiche « Traduction prête · appuyez sur F10 dans le chat ».
4. L'utilisateur bascule vers son jeu, clique dans la zone de chat, appuie sur **F10**.
5. L'app tape le texte caractère par caractère dans la fenêtre active via une simulation clavier bas-niveau, puis vide le buffer.
6. Si aucune traduction n'est en attente au moment du F10 → petit son d'erreur + notification « Aucune traduction prête ».

Détection automatique de « zone de chat » : **non implémentée** (impossible de manière fiable et cross-jeu sans hooks intrusifs qui déclencheraient les anti-triche). On utilise donc uniquement la touche d'action F10 comme demandé en secours.

## Changements techniques

### 1. Electron – simulation clavier

Ajouter la dépendance **`@nut-tree-fork/nut-js`** (ou `robotjs` en fallback) — permet de taper du texte Unicode dans la fenêtre active via l'API Windows `SendInput`, ce qui fonctionne dans la quasi-totalité des jeux (y compris ceux avec Raw Input, comme F8/F9 le font déjà via `uiohook-napi`).

Nouveau module `electron/autotype.cjs` :
- `typeText(text)` : tape le texte avec un petit délai configurable entre les caractères (~5-10 ms) pour éviter que les jeux perdent des touches.
- Gère les caractères accentués via `keyboard.type()` (SendInput unicode).

### 2. Electron – main.cjs

- Nouveaux settings persistés (dans le fichier settings existant) :
  - `autoTypeEnabled: false`
  - `autoTypeAccel: 'F10'`
- Nouvel IPC :
  - `autotype:set-pending` (renderer → main) : stocke `{ text, langName }` en mémoire main.
  - `autotype:clear` (renderer → main).
  - `autotype:get-config` / `autotype:set-config` pour la case à cocher + hotkey.
- Enregistrer un 3ᵉ hotkey global (F10 par défaut) via `hotkeys.cjs` uniquement si `autoTypeEnabled === true`. Sur trigger : lire le buffer, appeler `autotype.typeText`, vider le buffer, notif discrète.
- **Ne pas** modifier le handler `clipboard:write` : le renderer choisit lui-même la voie (clipboard classique OU auto-type) selon l'option.

### 3. Preload + types

Ajouter dans `electron/preload.cjs` et `src/types/vox-electron.d.ts` :
- `getAutoType()` / `setAutoType({ enabled, accel })`
- `setAutoTypePending(text, meta)` / `clearAutoTypePending()`
- Étendre `onHotkey` avec le kind `'auto-type'`.

### 4. Renderer – src/routes/app.tsx

- Charger la config auto-type au démarrage.
- Après une traduction F8 réussie :
  - Si `autoTypeEnabled` → appeler `setAutoTypePending(text, meta)` + toast « Prête à écrire · appuyez sur F10 dans le chat » ; **ne pas** écrire dans le clipboard.
  - Sinon → comportement actuel `writeClipboard`.
- Écouter `onHotkey('auto-type')` pour afficher un feedback visuel (l'écriture réelle est faite côté main).
- Modal Paramètres : ajouter la case à cocher + champ hotkey + description.

### 5. Version & release

- Bump `package.json` → `0.10.2`.
- Modifier `public/talking-version.json` uniquement après build GitHub Actions et upload manuel du nouveau `.exe` (workflow existant).

## Ce qui ne change pas

- F8 comportement par défaut (case décochée) : identique à aujourd'hui.
- F9 lecture vocale : identique.
- UI web / mobile / crédits / plafonds / admin : aucun changement.
- Aucune modification backend, DB, ni API.

## Limites & notes

- La détection automatique « je suis dans un chat » n'est pas fiable cross-jeu → on garde la touche F10 comme demandé.
- `nut-js` embarque un binaire natif : vérifier qu'il est bien packagé par electron-builder (ajouter à `asarUnpack` si besoin). Si l'installation échoue en CI, fallback sur `robotjs` (mais support Unicode moins bon → dans ce cas fallback vers PowerShell `SendKeys` via `child_process` déjà présent).
- Certains anti-triche très stricts (ex. Vanguard) peuvent bloquer même `SendInput`. Ce sera indiqué dans la description sous forme d'avertissement discret.
