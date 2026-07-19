
## Fonctionnement (côté utilisateur)

1. L'utilisateur appuie sur **F9** (modifiable dans Paramètres, comme F8).
2. Bruitage de démarrage → le micro s'enregistre.
3. L'utilisateur dit oralement : *"Lis-moi le message de Xstarlord"* (ou n'importe quelle formulation avec un pseudo).
4. L'utilisateur ré-appuie sur **F9** pour arrêter l'enregistrement.
5. En arrière-plan, TalKing :
   - Capture un **screenshot plein écran** (écran principal actif).
   - Envoie audio + screenshot au serveur.
6. Bruitage "processing" pendant l'analyse.
7. Une voix féminine (**OpenAI nova**) lit à voix haute la traduction du message trouvé.
8. Bruitage "success" à la fin.
9. Si aucun message trouvé → toast d'erreur explicite, **aucun crédit débité**.

## Pipeline serveur (nouveau endpoint `/api/read-message`)

```text
audio (webm) ─┐
              ├─► [1] STT (gpt-4o-mini-transcribe)
              │      → extrait la requête utilisateur
              │      → parse le pseudo cible (regex + LLM fallback)
              │
screenshot ───┤
              ├─► [2] Vision (google/gemini-2.5-flash, multimodal)
              │      Prompt: "Trouve dans ce screenshot de jeu le dernier
              │      message envoyé par le joueur '<pseudo>'. Renvoie UNIQUEMENT
              │      le texte brut du message, ou 'NOT_FOUND'."
              │
              ├─► [3] Translate vers langue cible (gemini-2.5-flash-lite)
              │
              └─► [4] TTS (openai/gpt-4o-mini-tts, voix "nova", MP3 stream)
                     → renvoyé au client, joué via <audio>
```

Ordre important : STT + Vision en **parallèle** pour gagner ~1s de latence.

## Coûts réels (par lecture)

| Étape | Modèle | Coût estimé |
|---|---|---|
| STT (~5s audio) | gpt-4o-mini-transcribe | ~0.0005 € |
| Vision screenshot | gemini-2.5-flash | ~0.003 € |
| Traduction | gemini-2.5-flash-lite | ~0.0002 € |
| TTS (~100 caractères, voix nova) | gpt-4o-mini-tts | ~0.0015 € |
| **Total** | | **~0.005 €** |

Prix client : **2 crédits** = 2 × (2.99€/50) = **0.12 €** payé si pack → marge ~96 %.
Abonné 29.99€/an : coût absorbé, reste rentable jusqu'à ~5 000 lectures/an/abonné.

## Modifications nécessaires

### Base de données (migration)
- Nouvelle fonction RPC `consume_translation_v2(_user_id uuid, _amount int)` qui débite N crédits d'un coup (pour supporter les 2 crédits de la lecture).
- Le champ `source_type` dans `translations_log` reste 'subscription'/'free_monthly'/'purchased_credit', mais on ajoute une colonne `operation_type` (`translate` | `read_message`) pour la ventilation admin.
- Ajout de `ai_usage_log` entries avec `operation='vision'` et `operation='tts'`.

### Electron (`electron/main.cjs` + `preload.cjs`)
- Nouveau hotkey global `readMessage` (défaut F9).
- Nouveau IPC `screenshot:capture` utilisant `desktopCapturer.getSources` → renvoie PNG base64 de l'écran actif.
- Store `readMessageAccel` en plus de `toggleAccel` dans electron-store.
- Vérification que F8 ≠ F9 (validation UI).

### Frontend
- `src/routes/app.tsx` : nouveau bouton "Lire un message (F9)" à côté du bouton principal, avec sa propre logique d'enregistrement.
- `src/components/SettingsModal.tsx` : deuxième champ de rebind pour F9.
- Lecture audio via `new Audio(URL.createObjectURL(mp3Blob))`.
- Sur mobile : deuxième bouton tactile "Lire un message" (mais **screenshot indisponible sur web** → afficher tooltip "Fonction PC uniquement").

### Server (`src/routes/api/read-message.ts`)
- Nouveau endpoint POST multipart : `audio` + `screenshot` + `targetLang`.
- Auth via bearer token.
- Débite 2 crédits **avant** traitement (rollback impossible côté DB, donc on gère les 402/erreurs Vision en amont : si Vision renvoie NOT_FOUND on rembourse via `add_purchased_credits` ou on ne débite qu'à la fin — on ne débitera qu'après succès Vision pour être fair).
- Streaming MP3 en retour.

### Admin (`src/routes/api/admin.ts` + `admin.tsx`)
- Nouveau bloc "Répartition des opérations" : # traductions vs # lectures de messages sur jour/semaine/mois.
- Coûts recalculés incluent Vision + TTS.
- Colonne "type" dans la liste des logs récents.

### Bruitages
- Réutilise `playProcessingLoop` et `playSuccessChime` existants.

### App Windows
- Nouvelle version **v0.9.7** avec ces changements + auto-update.

## Points de vigilance

- **Screenshot = données sensibles** : le screenshot est envoyé au serveur, traité par Vision, **jamais stocké**. À mentionner dans la politique de confidentialité (mise à jour `/legal/privacy`).
- **Multi-écrans** : on capture l'écran principal par défaut. Si l'utilisateur joue sur écran secondaire → prévoir un sélecteur d'écran dans Paramètres (v0.9.8, pas maintenant).
- **Latence totale attendue** : ~2-4 secondes du "stop record" au début de la voix. Acceptable pour du in-game.
- **Web/mobile** : bouton grisé avec tooltip "Disponible uniquement sur l'app Windows" (pas de screenshot dans le navigateur en arrière-plan).
- **Rate limit** : la lecture compte comme 1 traduction dans le compteur 150/jour (pas 2, sinon un abusif tape le mur trop vite).

## Livraison

1. Migration DB + RPC v2
2. Endpoint `/api/read-message`
3. Electron hotkey + IPC screenshot
4. UI (bouton + Settings)
5. Admin panel mis à jour
6. Build & publish **TalKing v0.9.7**
7. Mise à jour de `/legal/privacy` avec mention screenshot
