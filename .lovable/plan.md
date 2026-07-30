## Correction de la barre Windows

**Cause vérifiée**
- L'installeur `TalKing-Setup-0.12.2.exe` publié a été généré à **21:36**.
- La vraie correction Electron avec `frame: false` a été enregistrée à **21:53**.
- L'installeur actuel embarque donc encore l'ancienne fenêtre Windows native avec l'icône bugée. La seconde version visible est la barre personnalisée chargée depuis le site.

**Implémentation**
1. Générer un nouveau package Windows à partir du code Electron actuel, avec la fenêtre entièrement sans cadre natif.
2. Vérifier dans le package généré que `electron/main.cjs` contient bien `frame: false` et que les contrôles personnalisés sont embarqués.
3. Compiler un nouvel installeur v0.12.2 en écrasant l'ancien artefact obsolète.
4. Publier ce nouvel installeur et remplacer l'URL dans `talking-version.json` ainsi que tous les boutons de téléchargement.
5. Contrôler les dates et le contenu final de l'artefact pour confirmer que le fichier distribué est bien postérieur à la correction.

**Résultat attendu**
- En haut à gauche : uniquement `v0.12.2`, une seule fois.
- Plus aucune icône native bugée.
- Le logo officiel `TalKing®` situé juste en dessous reste inchangé.