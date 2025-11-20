# Instructions de configuration du sous-module

## Configuration du module openpro-api-react

Le backend nécessite le module `openpro-api-react` pour :
- Accéder au client API OpenPro
- Utiliser le stub server en développement
- Accéder aux données de test (`stub-data.json`)

### Approche recommandée : Lien symbolique/Junction

Cette approche permet de partager un seul dépôt `openpro-api-react` entre le backend et d'autres projets.

**Sous Windows (PowerShell) :**

```powershell
cd C:\Users\<USER>\Repositories\OpenPro.Backend
New-Item -ItemType Junction -Path openpro-api-react -Target ..\openpro-api-react
```

**Sous Linux/macOS (Bash) :**

```bash
cd /path/to/OpenPro.Backend
ln -s ../openpro-api-react openpro-api-react
```

### Approche alternative : Sous-module Git

Si vous préférez utiliser un sous-module Git pur :

**Ajout du sous-module (première fois) :**

```bash
cd OpenPro.Backend
git submodule add ../openpro-api-react openpro-api-react
git commit -m "Ajout du sous-module openpro-api-react"
```

**Initialisation du sous-module (après clonage) :**

```bash
cd OpenPro.Backend
git submodule update --init --recursive
```

**Mise à jour du sous-module :**

```bash
cd OpenPro.Backend
git submodule update --remote openpro-api-react
```

### Vérification

Vérifier que le module est bien accessible :

**Windows (PowerShell) :**
```powershell
Test-Path openpro-api-react\src\client\index.ts
```

**Linux/macOS (Bash) :**
```bash
ls openpro-api-react/src/client/index.ts
```

Si la commande retourne `True` (Windows) ou affiche le fichier (Linux/macOS), le module est correctement configuré.

## Configuration TypeScript

Le `tsconfig.json` du backend inclut déjà le path mapping pour le sous-module :

```json
{
  "compilerOptions": {
    "paths": {
      "@openpro-api-react/*": ["./openpro-api-react/src/*"]
    }
  }
}
```

Les imports dans le code utilisent cet alias :

```typescript
import { createOpenProClient } from '../../openpro-api-react/src/client/index.js';
```

## Structure du projet

Le projet OpenPro utilise 3 dépôts Git séparés :

```
Repositories/
├── openpro-api-react/           # Dépôt Git indépendant
│   ├── .git/
│   ├── stub-server/             # Stub server et données
│   │   ├── server.js
│   │   └── stub-data.json
│   └── src/client/              # Client API OpenPro
│
├── OpenPro.Backend/             # Dépôt Git backend
│   ├── .git/
│   ├── openpro-api-react/  →   # Lien/Junction vers ../openpro-api-react
│   └── src/
│
└── OpenPro.Admin/               # Dépôt Git frontend
    ├── .git/
    └── src/
```

## Notes importantes

### Avec lien symbolique/Junction :

- Le dossier `openpro-api-react/` dans le backend est **ignoré** par Git (`.gitignore`)
- Le lien pointe vers le dépôt `openpro-api-react` local (dépôt parent)
- Les modifications dans `openpro-api-react/` doivent être commitées dans son propre dépôt
- Si vous supprimez le lien, vous devrez le recréer

### Avec sous-module Git :

- Le dossier `openpro-api-react/` est géré par Git comme un sous-module
- Le fichier `.gitmodules` contient la référence au dépôt `openpro-api-react`
- Les modifications dans le sous-module doivent être commitées dans le dépôt du sous-module
- Pour travailler sur le sous-module, aller dans `openpro-api-react/` et faire les modifications là-bas

### Stub server

- Le stub server (`stub-server/server.js`) et ses données (`stub-data.json`) résident **uniquement** dans le dépôt `openpro-api-react`
- Ils ne sont pas dupliqués dans les autres dépôts
- Pour lancer le stub : `cd ../openpro-api-react && npm run stub`
