## Objectif

Améliorer la reconnaissance vocale en environnement bruyant (rue, ventilateur, souffle) sans augmenter les coûts d'IA. Tout le traitement se fait dans l'appareil (navigateur / Electron), avant l'envoi : aucun appel IA supplémentaire, et le fichier envoyé devient plus court/léger (donc plutôt moins cher et plus rapide).

## Ce qui existe aujourd'hui

- Le micro est ouvert avec `echoCancellation`, `noiseSuppression`, `autoGainControl` (PC dans `src/routes/app.tsx`, mobile dans `useMobileRecorder`) - ces options natives du navigateur sont conçues pour la visio et laissent passer beaucoup de bruit continu.
- Le son brut est capté puis converti en WAV 16 kHz (`src/lib/wav-encoder.ts`) et envoyé tel quel à la transcription.
- Aucun filtrage, aucune suppression des silences, aucune normalisation du volume.

## Traitement proposé

Un nouveau module partagé de nettoyage audio appliqué avant l'encodage WAV, en deux étages.

**1. Étage temps réel (graphe Web Audio, à l'enregistrement)**
- Filtre passe-haut ~85 Hz : supprime le grondement du ventilateur, de la climatisation, du vent et du trafic.
- Filtre passe-bas ~7,5 kHz : coupe les sifflements/souffles au-dessus de la bande utile de la parole.
- Léger relèvement de présence (2-4 kHz) pour la clarté des consonnes.
- Compresseur doux pour égaliser une voix trop éloignée ou irrégulière.

**2. Étage hors ligne (au moment du stop, avant l'encodage)**
- Estimation du bruit de fond sur les premières fractions de seconde et sur les passages les plus calmes.
- Porte de bruit adaptative avec attaque/relâche progressifs (pas de coupure brutale qui hache les mots) : les passages sous le seuil de bruit sont fortement atténués plutôt que supprimés.
- Détection d'activité vocale : suppression des blancs longs en début/fin, ce qui raccourcit le fichier envoyé.
- Normalisation de crête (~-1 dBFS) pour que la voix arrive toujours à un niveau optimal pour la transcription.
- Garde-fou : si après nettoyage il ne reste quasiment rien (silence total), on renvoie l'audio d'origine plutôt qu'un fichier vide, pour ne jamais dégrader un cas limite.

## Réglages utilisateur

Dans les paramètres de l'app PC et de l'app mobile, un bloc "Réduction de bruit" :
- Interrupteur activé par défaut.
- Trois niveaux : Léger / Normal (défaut) / Fort (rue, ventilateur). Le niveau ajuste l'agressivité de la porte de bruit et des filtres.
- Préférence mémorisée localement sur l'appareil.

## Portée des modifications

- Nouveau fichier de traitement audio (filtres, porte de bruit, VAD, normalisation).
- Branchement de la chaîne dans les trois points de capture existants : traduction PC (F8), lecture de message PC (F9), enregistrement mobile.
- Ajout du réglage dans les écrans de paramètres PC et mobile.
- Aucun changement côté serveur, base de données, crédits ou facturation.

## Détails techniques

- Étage temps réel via `BiquadFilterNode` (highpass/lowpass/peaking) + `DynamicsCompressorNode` insérés entre `MediaStreamAudioSourceNode` et le `ScriptProcessorNode` déjà en place.
- Étage hors ligne en JavaScript pur sur les `Float32Array` accumulés, exécuté juste avant `encodeWav`, donc compatible Electron comme navigateur mobile sans dépendance native.
- Porte de bruit basée sur l'énergie RMS par fenêtre de ~20 ms, seuil = bruit de fond estimé x facteur selon le niveau choisi, lissage attaque 10 ms / relâche 120 ms.
- Aucune bibliothèque tierce ajoutée (pas de RNNoise WASM) afin de ne pas alourdir l'installeur Windows de plusieurs Mo ; on pourra l'envisager plus tard si le rendu ne suffit pas.

## Vérification

Test manuel avec une phrase enregistrée avec bruit de fond : comparaison de la transcription avant/après, et contrôle qu'une phrase enregistrée au calme reste identique (pas de mots coupés).
