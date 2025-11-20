# Instructions de configuration du sous-module

## Configuration du sous-module openpro-api-react

Le backend utilise le sous-module Git `openpro-api-react` pour accéder au client API OpenPro.

### Initialisation du sous-module

Si le dépôt backend vient d'être cloné, initialiser le sous-module :

```bash
git submodule update --init --recursive
```

### Ajout du sous-module (si nécessaire)

Si le sous-module n'existe pas encore dans le dépôt backend :

```bash
git submodule add <URL_DU_REPO_OPENPRO_API_REACT> openpro-api-react
```

Remplacez `<URL_DU_REPO_OPENPRO_API_REACT>` par l'URL Git du dépôt `openpro-api-react`.

### Mise à jour du sous-module

Pour mettre à jour le sous-module vers la dernière version :

```bash
git submodule update --remote openpro-api-react
```

### Vérification

Vérifier que le sous-module est bien initialisé :

```bash
ls openpro-api-react/src/client/
```

Vous devriez voir les fichiers du client OpenPro.

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

## Notes

- Le sous-module doit être commité dans le dépôt backend (le dossier `openpro-api-react/` doit être présent)
- Les modifications dans le sous-module doivent être commitées dans le dépôt du sous-module, pas dans le dépôt backend
- Pour travailler sur le sous-module, aller dans `openpro-api-react/` et faire les modifications là-bas
