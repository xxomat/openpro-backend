---
description: Règles de codage pour le projet OpenPro Backend
globs: []
alwaysApply: true
---

# Règles de codage - OpenPro Backend

## Taille des fichiers

### Limites strictes
- **Routes (.ts)** : Maximum **300 lignes** (code effectif, hors commentaires)
- **Services (.ts)** : Maximum **300 lignes**
- **Utilitaires (.ts)** : Maximum **200 lignes**
- **Types/Interfaces (.ts)** : Maximum **300 lignes**
- **Configuration (.ts)** : Maximum **200 lignes**

### Exceptions
- Les fichiers de configuration (`config.ts`) peuvent dépasser cette limite si nécessaire
- Les fichiers de types complexes peuvent aller jusqu'à 300 lignes

### Action requise
Si un fichier dépasse la limite :
1. Identifier les responsabilités distinctes
2. Extraire des services séparés
3. Créer des fichiers utilitaires pour les fonctions réutilisables
4. Diviser les routes en plusieurs fichiers si nécessaire

## Conventions de nommage

### Fonctions et méthodes
- **Format** : camelCase en anglais
- **Exemples** : `getAccommodations`, `loadRateTypes`, `generatePricingSuggestions`, `formatDate`
- **Verbes d'action** : utiliser des verbes clairs (`get`, `load`, `generate`, `format`, `save`, `update`)

### Types et interfaces TypeScript
- **Format** : PascalCase
- **Exemples** : `Accommodation`, `RateType`, `SupplierData`, `PricingSuggestion`
- **Interfaces** : préférer `interface` pour les objets extensibles, `type` pour les unions/intersections

### Variables et constantes
- **Variables locales** : camelCase (`idFournisseur`, `accommodationsList`, `discoveredRateTypes`)
- **Constantes** : camelCase pour les constantes simples, UPPER_SNAKE_CASE pour les constantes globales
- **Exemples** : `config`, `openProClient`, `BACKEND_BASE_URL` (si constante globale)

### Services
- **Format** : camelCase avec suffixe `Service` ou descriptif
- **Exemples** : `accommodationService`, `rateService`, `suggestionEngine`
- **Un fichier = une responsabilité** : chaque service doit avoir une responsabilité claire

## Structure des fichiers

### Organisation des dossiers
```
src/
  config/          # Configuration (env, ai)
  types/           # Types partagés
  services/        # Services métier
    openpro/       # Services OpenPro
    ai/            # Services IA
  routes/          # Routes Fastify
  utils/           # Utilitaires
```

### Structure d'un fichier TypeScript
1. **En-tête JSDoc** : description du fichier et de son rôle
2. **Imports** : groupés par type (types, bibliothèques externes, relatifs)
3. **Types/Interfaces** : définitions de types locaux
4. **Constantes** : constantes du module
5. **Fonctions** : code principal
6. **Exports** : exports nommés uniquement

## Documentation

### JSDoc obligatoire
- **Toutes les fonctions publiques** doivent avoir une documentation JSDoc
- **Toutes les routes** doivent documenter leurs paramètres et réponses
- **Tous les services** doivent documenter leur comportement

### Format JSDoc
```typescript
/**
 * Description courte de la fonction
 * 
 * Description détaillée si nécessaire, expliquant le comportement,
 * les cas d'usage, ou les détails d'implémentation importants.
 * 
 * @param paramName - Description du paramètre (type et contraintes)
 * @param optionalParam - Description du paramètre optionnel
 * @returns Description de la valeur de retour
 * @throws {Error} Description des erreurs possibles
 */
```

### Commentaires dans le code
- **Éviter les commentaires évidents** : le code doit être auto-documenté
- **Commenter la logique complexe** : expliquer le "pourquoi", pas le "comment"
- **Commentaires TODO** : utiliser `// TODO: description` pour les améliorations futures

## TypeScript

### Typage strict
- **Toujours typer explicitement** les paramètres de fonction
- **Éviter `any`** : utiliser `unknown` si le type est vraiment inconnu, puis faire une vérification
- **Utiliser les types fournis** : préférer les types de `@openpro-api-react/client/types`
- **Types génériques** : utiliser les génériques pour la réutilisabilité

### Interfaces vs Types
- **Interfaces** : pour les objets extensibles et les contrats
- **Types** : pour les unions, intersections, et types complexes

### Gestion des erreurs
- **Typage des erreurs** : utiliser `Error` ou des classes d'erreur personnalisées
- **Gestion explicite** : toujours gérer les erreurs dans les fonctions async
- **Messages d'erreur** : messages clairs et actionnables
- **Codes HTTP** : utiliser les codes HTTP appropriés (400, 404, 500, etc.)

## Fastify

### Routes
- **Typage des routes** : utiliser les types génériques de Fastify pour typer les params, query, body
- **Gestion d'erreurs** : utiliser `reply.status().send()` pour les erreurs HTTP
- **Logging** : utiliser `fastify.log` au lieu de `console.log`

### Exemple de route
```typescript
fastify.get<{
  Params: { idFournisseur: string };
  Querystring: { debut: string; fin: string }
}>('/:idFournisseur/accommodations', async (request, reply) => {
  const idFournisseur = parseInt(request.params.idFournisseur, 10);
  
  if (isNaN(idFournisseur)) {
    return reply.status(400).send({ 
      error: 'Invalid idFournisseur',
      message: 'idFournisseur must be a number'
    });
  }
  
  try {
    const data = await getData(idFournisseur);
    return data;
  } catch (error) {
    fastify.log.error('Error:', error);
    reply.status(500).send({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

## Services et API

### Structure des services
- **Un service par ressource** : `accommodationService.ts`, `rateService.ts`, `rateTypeService.ts`
- **Fonctions exportées** : fonctions pures ou async pour le chargement
- **Gestion des erreurs** : toujours gérer les erreurs et les signaler

### Client API OpenPro
- **Utiliser le client typé** : `openProClient` depuis `services/openProClient.ts`
- **AbortSignal** : supporter `AbortSignal` pour l'annulation des requêtes
- **Gestion des réponses** : vérifier la structure des réponses API

## Imports

### Ordre des imports
1. **Imports de types** : `import type { ... } from '...'`
2. **Imports de bibliothèques externes** : triés alphabétiquement
3. **Imports internes** : relatifs, triés par profondeur (moins profond d'abord)

### Exemple
```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAccommodations } from '../services/openpro/accommodationService.js';
import { config } from '../config/env.js';
```

### Règles
- **Imports de types** : toujours utiliser `import type` pour les types
- **Imports relatifs** : utiliser des chemins relatifs cohérents
- **Alias pour sous-modules** : utiliser `@openpro-api-react/*` pour tous les imports depuis le sous-module
- **Extensions .js** : utiliser `.js` dans les imports ESM même pour les fichiers `.ts`
- **Pas d'imports circulaires** : éviter les dépendances circulaires entre modules

## Gestion des erreurs et logging

### Logging
- **Utiliser fastify.log** : préférer `fastify.log.info()`, `fastify.log.error()` au lieu de `console.log`
- **Format des logs** : inclure le contexte (nom de fonction, paramètres pertinents)
- **Exemple** : `fastify.log.error('Error fetching rate types:', error)` avec contexte

### Gestion des erreurs async
- **Toujours utiliser try/catch** dans les fonctions async
- **Propager les erreurs** : laisser remonter les erreurs critiques, gérer les erreurs non-critiques localement
- **Messages d'erreur** : messages clairs et actionnables
- **Codes HTTP** : utiliser les codes appropriés (400 pour erreurs client, 500 pour erreurs serveur)

### Exemple de gestion d'erreur
```typescript
try {
  const data = await loadData();
  return data;
} catch (error) {
  fastify.log.error('Error loading data:', error);
  reply.status(500).send({ 
    error: 'Failed to load data',
    message: error instanceof Error ? error.message : 'Unknown error'
  });
}
```

## Gestion des valeurs par défaut

### Opérateurs
- **`??` (nullish coalescing)** : pour les valeurs `null` ou `undefined`
- **`||` (OR logique)** : uniquement si on veut aussi gérer les valeurs falsy (`0`, `''`, `false`)
- **Préférer `??`** : dans la plupart des cas pour les valeurs par défaut

### Exemple
```typescript
// ✅ Bon : utilise ?? pour null/undefined uniquement
const value = input ?? defaultValue;

// ⚠️ Attention : || gère aussi 0, '', false
const value = input || defaultValue; // peut masquer des valeurs valides
```

## Validation et sécurité

### Validation des entrées
- **Valider les données** : avant de les utiliser dans les services
- **Types** : utiliser TypeScript pour la validation à la compilation
- **Runtime** : valider les données à l'exécution pour les entrées externes (params, query, body)

### Variables d'environnement
- **Ne pas exposer de secrets** : jamais de clés API ou secrets dans le code
- **Validation** : valider les variables d'environnement au démarrage
- **Valeurs par défaut** : fournir des valeurs par défaut pour le développement

### Exemple
```typescript
if (!config.OPENPRO_API_KEY) {
  throw new Error('OPENPRO_API_KEY is required in .env');
}
```

## Code mort et nettoyage

### À éviter
- **Code commenté** : supprimer le code commenté, utiliser Git pour l'historique
- **console.log de debug** : utiliser `fastify.log` ou supprimer avant le commit
- **Imports inutilisés** : supprimer les imports non utilisés
- **Variables inutilisées** : supprimer les variables non utilisées

### TODO et FIXME
- **TODO** : marquer les améliorations futures avec `// TODO: description`
- **FIXME** : marquer les bugs connus avec `// FIXME: description`
- **Limiter les TODO** : résoudre les TODO avant qu'ils ne s'accumulent

## Format ESM

### Modules ES
- **Type module** : le projet utilise `"type": "module"` dans `package.json`
- **Extensions .js** : utiliser `.js` dans les imports même pour les fichiers `.ts`
- **Exemple** : `import { config } from '../config/env.js';`

## Vérifications avant commit

Avant de commiter du code, vérifier :
1. ✅ Tous les fichiers respectent les limites de lignes
2. ✅ Toutes les fonctions publiques ont une documentation JSDoc
3. ✅ Les types sont correctement définis (pas d'`any` non justifié)
4. ✅ Les noms de variables/fonctions suivent les conventions
5. ✅ La structure des dossiers est respectée
6. ✅ Les erreurs sont gérées correctement avec codes HTTP appropriés
7. ✅ Les logs utilisent `fastify.log` au lieu de `console.log`
8. ✅ Les imports inutilisés sont supprimés
9. ✅ Le code commenté est supprimé
10. ✅ Les requêtes async utilisent `AbortSignal` si nécessaire
11. ✅ Les imports utilisent `.js` pour les fichiers TypeScript en ESM

## Références

- PRD : `OpenPro.Backend/docs/PRD.md`
- Client API : `openpro-api-react/src/client/`
- Documentation API Open Pro : https://documentation.open-system.fr/api-openpro/tarif/multi/v1/
- Fastify : https://www.fastify.io/
- Vercel AI SDK : https://ai-sdk.dev/
