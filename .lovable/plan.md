## Objectif

Ajouter une **app mobile PWA installable** (Android + iOS) dédiée uniquement au dialogue vocal traduit : j'appuie → je parle → l'IA transcrit, traduit et lit la traduction à voix haute dans la langue cible. Aucun impact sur l'app Windows ni sur la page web actuelle.

## UX

### Nouvelle route `/mobile`
- Détection auto : si l'utilisateur charge le site depuis un ordinateur (desktop non-tactile), afficher un écran « Cette application est réservée aux téléphones » avec bouton retour vers l'accueil. Si mobile, afficher directement l'app.
- Interface qui reprend le style dark de l'app Windows (même Tk logo, mêmes couleurs, même typo) mais pensée tactile plein écran.
- Header compact : logo TalKing®, badge d'abonnement (Gratuit / Abonné / Testeur), compteur « X/50 traductions aujourd'hui ».
- Sélecteur unique **langue cible** (19 langues déjà répertoriées). Langue source = auto-détectée par le STT.
- Gros **bouton central circulaire** (style Push-to-talk) :
  - État repos : « Appuyer pour parler »
  - État enregistrement : anneau rouge pulsant + timer + « Relâcher pour traduire » (tap toggle : 1er tap start, 2ᵉ tap stop, plus fiable que hold sur mobile).
  - État traitement : spinner « Traduction… »
  - État lecture : icône haut-parleur animée « Lecture en cours… »
- Sous le bouton : dernière transcription (source) + dernière traduction (cible), avec bouton « Rejouer 🔊 » pour réécouter sans reconsommer de crédit.
- Bouton discret « Bloquer / Débloquer l'audio » (iOS exige un tap utilisateur pour autoriser l'audio, on gère ça au 1er tap).

### Téléchargement / Installation
- Sur la landing page (`/`), ajouter une section **« TalKing Mobile »** avec bouton **« Installer sur mobile »**.
- Bouton visible uniquement si l'appareil est détecté comme mobile (user-agent + touch + largeur). Sur desktop : bouton grisé avec message « Scanne le QR code depuis ton téléphone » + QR code vers l'URL `/mobile`.
- Sur mobile, le bouton déclenche l'installation PWA (event `beforeinstallprompt` sur Android ; sur iOS, ouvre un mini-tuto « Partager → Sur l'écran d'accueil »).

## Flux utilisateur

1. Ouvre `talking-translator.com/mobile` sur son téléphone → invité à installer la PWA (icône home screen).
2. Ouvre l'app depuis l'icône → page login si non connecté (même auth Supabase que le reste).
3. Choisit la langue cible (ex : Anglais).
4. Tape le gros bouton → parle → retape → l'IA transcrit + traduit + lit à voix haute la traduction.
5. Peut réécouter la dernière traduction gratuitement.

## Crédits & limites

Nouveau système dédié mobile (indépendant du texte/vocal Windows) :

- **50 traductions gratuites/jour** pour tous (gratuits, gratuit+, abonnés, testeurs).
- Chaque traduction = 1 appel STT + 1 appel traduction + 1 appel TTS. Consomme **1 « crédit mobile »** comptabilisé côté serveur via un nouveau compteur journalier.
- Reset quotidien Europe/Paris.
- Au-delà de 50/jour → message « Limite quotidienne atteinte, revenez demain » (pas de vente de crédits supplémentaires pour cette v1).
- Testeurs = **également plafonnés à 50/jour** (compromis assumé car le coût unitaire mobile est plus élevé à cause du TTS).
- Réécoute de la dernière traduction en cache local → gratuite.

## Changements techniques

### 1. Base de données (migration)
- Nouvelle fonction `consume_mobile_translation(_user_id uuid)` : vérifie < 50 usages `operation_type = 'mobile_dialog'` dans les dernières 24h Europe/Paris, insère un log, retourne `{ ok, remaining, reason }`.
- Étendre `get_user_status` pour renvoyer `mobile_daily_used` et `mobile_daily_limit` (=50).
- Réutilise `translations_log` (colonne `operation_type` existante).
- Réutilise `ai_usage_log` pour tracer coûts STT + traduction + TTS.

### 2. Nouveau endpoint serveur
- `src/routes/api/mobile-dialog.ts` (server route POST, auth bearer obligatoire).
- Reçoit : `audio` (Blob WAV/webm), `targetLang`.
- Étapes : auth → `consume_mobile_translation` → STT (`openai/gpt-4o-mini-transcribe`, langue auto) → traduction (`google/gemini-2.5-flash-lite`) → TTS (`openai/gpt-4o-mini-tts`, voix `nova`, streaming SSE `pcm`).
- Réponse : SSE stream mixant `{ type: "transcript" }`, `{ type: "translation", text, sourceLang }`, puis les événements `speech.audio.delta` / `speech.audio.done` de la TTS.
- Log dans `ai_usage_log` en fin de requête (fire-and-forget).

### 3. Front mobile
- `src/routes/mobile.tsx` : nouvelle route, `head()` SEO propre + `apple-mobile-web-app-*` meta.
- `src/hooks/useMobilePushToTalk.ts` : gère `MediaRecorder`, encodage WAV via `wav-encoder.ts` existant, appel fetch vers `/api/mobile-dialog`, lecture PCM 24 kHz via `AudioContext` (réutilise pattern déjà présent pour F9).
- `src/components/MobileGate.tsx` : détecte desktop → écran « Réservé mobile ».
- `src/lib/pwa.ts` : manifest + registration guardée (Lovable preview safe).
- Ajouts landing page : section download avec QR code (généré client via `qrcode` npm) + bouton install.

### 4. PWA installable
- Suivre la skill PWA (option **manifest-only**, pas d'offline) :
  - `public/manifest.webmanifest` : name « TalKing Mobile », short_name « TalKing », `display: standalone`, theme dark, icons 192 + 512.
  - Icônes générées via imagegen (fond dark, « Tk » blanc).
  - Meta tags dans `__root.tsx` : `manifest`, `theme-color`, `apple-touch-icon`.
  - Pas de service worker (respect de la règle « no SW en preview »).

### 5. Landing & navigation
- Section download sur `/` : « TalKing Mobile - dialoguez en 19 langues à voix haute » + bouton conditionnel install/QR.
- Ajout d'un lien discret dans le footer.
- Pas de bouton dans l'app Windows (Electron reste inchangé).

## Ce qui ne change pas

- App Windows Electron (F8 / F9 / auto-type / Backspace) : strictement identique.
- Système de crédits texte + vocal Windows : identique.
- Système d'abonnement Paddle : identique.
- Page admin : inchangée (les logs mobile apparaîtront naturellement dans `ai_usage_log` et l'activité).
- Aucune modif du webhook paiement.

## Limites & notes

- iOS Safari impose un tap utilisateur pour démarrer l'audio → géré au 1er appui du bouton.
- iOS n'a pas de `beforeinstallprompt` → on affiche un mini-tuto « Partager → Ajouter à l'écran d'accueil ».
- 50 traductions/jour est un compromis anti-abus : le coût mobile ≈ 3× le coût texte à cause du TTS. À réévaluer selon usage réel.
- La détection desktop est faite en frontend (user-agent + `pointer: coarse`) : contournable, mais bloque 99 % des cas.
