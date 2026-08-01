# Réparer l'app Windows en jeu (F8, presse-papiers, Backspace)

## Ce que j'ai vérifié dans le code

- Le raccourci F8 passe par le hook clavier bas niveau `uiohook-napi` (`electron/hotkeys.cjs`), avec repli sur `globalShortcut` d'Electron si le module natif ne se charge pas. Ce repli ne fonctionne pas dans les jeux : c'est exactement le symptôme décrit (F8 OK sur le bureau, muet en jeu).
- Le module natif est bien déclaré en `asarUnpack` dans `package.json`, mais rien dans l'app n'indique aujourd'hui quel moteur est réellement actif à l'exécution. Impossible de confirmer sans une remontée depuis l'app installée : à ce stade c'est une piste, pas une certitude.
- Bug confirmé dans `electron/hotkeys.cjs` : `unregisterAll()` fait `registered.length = 0` alors que la même liste est parcourue pendant un `keydown`. Comme l'auto-écriture ré-enregistre les touches à chaque traduction en attente (`registerHotkeys()` appelé depuis `fireAutoType` et `autotype:set-pending`), une touche peut se retrouver « bloquée en position basse » et ne plus jamais redéclencher.
- Bug confirmé dans `src/routes/app.tsx` (`startRecording`) : l'`AudioContext` est créé sans jamais appeler `resume()`. Quand la fenêtre TalKing est cachée derrière le jeu et n'a jamais reçu de clic, Chromium laisse le contexte audio suspendu : l'enregistrement « démarre » mais aucun son n'est capté, donc aucune traduction n'arrive. La version mobile, elle, fait bien ce `resume()`.

## Ce que je vais faire

1. **Diagnostic visible** : afficher dans le menu Paramètres de l'app Windows le moteur clavier réellement utilisé (« hook bas niveau — compatible jeux » ou « raccourci système — ne marche pas en jeu ») et écrire cette info dans le fichier de log. On saura immédiatement, sur ta machine, si le module natif se charge dans la version installée.
2. **Chargement fiable du module natif** : tenter le chargement depuis le dossier décompressé de l'installation si le chargement standard échoue, et notifier clairement si le hook est indisponible au lieu de retomber silencieusement sur un mode incompatible avec les jeux.
3. **Correction du latch de touche** : ne plus vider la liste des raccourcis pendant le traitement d'un événement clavier, et réinitialiser proprement l'état « touche enfoncée » à chaque ré-enregistrement, pour que F8 reste déclenchable indéfiniment.
4. **Correction audio en arrière-plan** : reprendre l'`AudioContext` (`resume()`) au démarrage de l'enregistrement, et abandonner l'enregistrement avec un message clair si aucun échantillon audio n'est capté, au lieu d'échouer en silence.
5. **Chaîne complète revérifiée** : F8 → enregistrement → traduction → écriture dans le presse-papiers quand l'option auto-écriture est décochée ; et F8 → traduction mise en attente → Backspace tape le texte dans le chat quand l'option est cochée, la touche Backspace redevenant normale dès que le texte est tapé.
6. **Publication** : nouvelle version Windows (v1.0.3) livrée par la mise à jour intégrée habituelle, plus republication du site (l'app charge l'interface en ligne).

## Détails techniques

- `electron/hotkeys.cjs` : remplacer l'itération directe par une copie de la liste dans les handlers `keydown`/`keyup`, exposer `getBackend()`, et ajouter un `require` de secours vers `app.asar.unpacked/node_modules/uiohook-napi`.
- `electron/main.cjs` : inclure `hotkeyBackend` dans `hotkey-status` et dans `info()`, log au démarrage.
- `src/types/vox-electron.d.ts` : ajout du champ `hotkeyBackend`.
- `src/routes/app.tsx` : `await ctx.resume()` si `ctx.state === "suspended"` dans `startRecording` et dans le flux F9 ; garde sur `chunksRef` vide au `stop`.
- `package.json` : version 1.0.3, puis mise à jour de `public/talking-version.json` avec le nouvel installeur.
