# Accélérer la traduction de l'app mobile

Objectif : réduire nettement le temps entre la fin de l'enregistrement et le début de la voix traduite, sans casser l'app mobile ni l'app Windows, et sans hausse notable des coûts.

## Ce qui prend du temps aujourd'hui

Le serveur enchaîne 3 appels IA complets l'un après l'autre, puis attend d'avoir 100 % de l'audio avant de renvoyer quoi que ce soit :

```text
[upload WAV] -> [transcription] -> [traduction] -> [synthèse vocale complète] -> [encodage base64] -> [lecture]
```

Rien ne s'affiche ni ne se joue tant que la dernière étape n'est pas finie. L'audio est aussi renvoyé en base64 (+33 % de poids inutile).

## Les changements prévus

1. **Fusionner transcription + traduction en un seul appel**
   Un seul modèle multimodal reçoit l'audio et renvoie directement le texte source et la traduction. Un aller-retour réseau et une facturation en moins (coût globalement égal ou inférieur).

2. **Diffuser la voix en streaming au lieu d'attendre le fichier complet**
   Le texte traduit s'affiche dès qu'il est prêt, et la voix démarre dès les premiers octets reçus au lieu d'attendre la fin de la synthèse. C'est le gain le plus visible en dialogue.

3. **Supprimer le base64**
   L'audio est transmis en binaire : moins de données, moins de traitement sur le téléphone.

4. **Alléger le travail sur le téléphone**
   Le nettoyage du son et l'encodage sont simplifiés/allégés sur les courts enregistrements, et l'upload démarre plus tôt.

5. **Petits réglages de confort**
   Connexion au service IA préchauffée (préconnexion) et légère accélération de la voix.

## Ce qui ne change pas

- Le décompte des crédits (1 crédit = 1 dialogue = 2 phrases) et les limites restent identiques.
- L'app Windows (F8/F9, presse-papiers, auto-écriture) n'est pas touchée.
- Le rendu visuel de l'app mobile et l'éditeur d'apparence restent inchangés.

## Détails techniques

- `src/routes/api/mobile-dialog.ts` : remplacement de `transcribe()` + `translate()` par un appel unique audio->JSON (`{transcript, translation}`) sur `google/gemini-2.5-flash-lite` ; conservation du logging `ai_usage_log` avec les mêmes formules de coût adaptées.
- Nouvelle route `src/routes/api/mobile-tts.ts` (authentifiée, sans consommation de crédit supplémentaire) renvoyant un flux `audio/mpeg` piloté par le token de dialogue, pour que `<audio>` lise en streaming.
- `src/routes/mobile.tsx` : affichage immédiat du texte, lecture via URL de flux plutôt que `playAudioBase64`, `playAgain` conservé grâce à la mise en cache du blob une fois téléchargé.
- `src/hooks/useMobileRecorder.ts` / `src/lib/audio-cleanup.ts` : court-circuit du gate offline sous ~1,5 s d'audio, encodage 16 kHz conservé.
- Vérification finale : dialogue complet FR->EN et EN->FR, crédit décompté une seule fois, message "plus de crédit" toujours fonctionnel.
