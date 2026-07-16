
# Traducteur vocal temps réel — App desktop

## Objectif
Une application desktop (Windows/Mac/Linux) qui, même quand tu joues en plein écran :
1. écoute une **touche globale** pour démarrer l'enregistrement de ta voix,
2. écoute une **autre touche globale** pour arrêter,
3. transcrit ta phrase, la traduit vers la langue cible,
4. **écrit automatiquement la traduction dans ton presse-papier système** — prête à être collée dans le chat du jeu (Ctrl+V).

Aucune synthèse vocale. Optimisé pour latence < 2 s sur phrases courtes.

## Stack technique

- **Interface** : site web (React + TanStack Start, celui déjà en place) qui sert de "fenêtre de configuration".
- **Emballage desktop** : **Electron**. C'est ce qui débloque :
  - les **raccourcis clavier globaux** (`globalShortcut`) qui fonctionnent même quand un jeu a le focus,
  - l'accès **presse-papier système** sans besoin de focus navigateur (`clipboard.writeText`),
  - la capture micro persistante en arrière-plan.
- **Capture audio** : Web Audio API dans le renderer Electron (WAV 16 kHz mono, encodage côté client pour rester décodable).
- **Speech-to-Text** : `openai/gpt-4o-mini-transcribe` via **Lovable AI Gateway** — précis multi-langue (FR/EN/ES/DE/IT natifs), rapide, facturé au token, aucune clé externe à gérer. Fallback `openai/gpt-4o-transcribe` si l'utilisateur veut plus de précision.
- **Traduction** : `google/gemini-3-flash-preview` via **Lovable AI Gateway** — meilleure qualité contextuelle que Google Translate sur phrases parlées / argot / gaming, latence faible, même facturation. Prompt système strict "traduis uniquement, ne commente pas".
- **Backend** : server functions TanStack (`createServerFn`) — deux endpoints :
  - `transcribe` : reçoit un WAV, renvoie le texte + langue détectée,
  - `translate` : reçoit texte + langue cible, renvoie la traduction.
  Clé `LOVABLE_API_KEY` gérée automatiquement, jamais exposée au client.

## Fonctionnalités MVP

### Panneau de configuration (fenêtre Electron)
- Sélecteur **langue source** : Auto-détection / FR / EN / ES / DE / IT.
- Sélecteur **langue cible** : FR / EN / ES / DE / IT.
- Bouton "swap" pour inverser source ↔ cible.
- Configuration des **touches globales** : "Push-to-talk start" et "Push-to-talk stop" (clic → capture la prochaine combinaison). Valeurs par défaut : `F8` pour start, `F9` pour stop. Support d'un mode "toggle" (une seule touche) en option.
- Sélecteur **périphérique micro**.
- Historique des 20 dernières traductions (source → cible) avec bouton "recopier".
- Indicateur d'état visuel : Idle / 🎙 Recording / ⏳ Transcribing / ✅ Copied.
- Notification système native à la copie ("Traduction copiée").
- Case "démarrer avec le système" et "réduire dans la barre des tâches".

### Flux d'un enregistrement
```text
[touche start] → beep court → capture micro
[touche stop]  → beep court → WAV → server fn transcribe
                                  → server fn translate
                                  → clipboard.writeText(traduction)
                                  → notification "✅ Copié"
```
Temps cible : < 1.5 s sur phrase de 5 s.

### Robustesse
- Anti-double-press (debounce touches globales).
- Rejet audio < 300 ms (touche relâchée trop vite) avec toast "Trop court".
- Détection silence : si aucun son détecté, on n'appelle pas l'API.
- Timeout réseau 15 s avec retry automatique 1 fois.
- Erreurs Gateway (402 crédits / 429 rate limit / 500) → notification claire, dernière traduction reste dans le presse-papier.
- Logs locaux (dernières 100 requêtes) pour debug.

## Découpage de livraison

**Phase 1 — Site web fonctionnel (dans Lovable)**
1. Écran de configuration React (langues, historique, statut).
2. Server functions `transcribe` et `translate`.
3. Capture micro + push-to-talk **dans l'onglet** (touches locales, pas globales) — permet de tester tout le pipeline audio/IA/traduction dans le preview.
4. Copie presse-papier via `navigator.clipboard` (fonctionne quand l'onglet a le focus).

**Phase 2 — Emballage Electron desktop**
1. Ajout des fichiers `electron/main.cjs` + preload script.
2. `globalShortcut.register` pour les touches de start/stop → envoi IPC vers le renderer.
3. `clipboard.writeText` côté main process (fonctionne sans focus).
4. Icône dans la barre des tâches (tray), démarrage minimisé.
5. Packaging via `@electron/packager` → livrables Windows / Mac / Linux téléchargeables depuis le site.

Chaque phase est testable indépendamment. La Phase 1 valide qualité IA + UX. La Phase 2 débloque l'usage réel en jeu.

## Points à valider avant de coder
- OK pour démarrer par la **Phase 1** (site web utilisable dans le navigateur) puis livrer l'app Electron en Phase 2 ?
- Touches par défaut `F8` (start) / `F9` (stop) te vont, ou tu préfères une seule touche en toggle (ex. `F8` bascule) ?
- OS prioritaire pour le premier build Electron : Windows, Mac ou Linux ?
