# Guide de Migration vers Cloudflare Workers

Ce document explique la migration du backend de Node.js/Fastify vers Cloudflare Workers.

## Changements Majeurs

### 1. Runtime et Architecture

**Avant** : Node.js avec Fastify
```typescript
import Fastify from 'fastify';
const fastify = Fastify({ logger: true });
await fastify.listen({ port: 3001 });
```

**Après** : Cloudflare Workers avec itty-router
```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const router = Router();
    return router.handle(request);
  }
}
```

### 2. Variables d'Environnement

**Avant** : `.env` + `dotenv`
```typescript
import { config as loadEnv } from 'dotenv';
loadEnv();
const apiKey = process.env.OPENPRO_API_KEY;
```

**Après** : `wrangler.toml` + `.dev.vars`
```typescript
export interface Env {
  OPENPRO_API_KEY: string;
  DB: D1Database;
}
// Utilisation : env.OPENPRO_API_KEY
```

### 3. Routing

**Avant** : Routes Fastify
```typescript
fastify.get<{ Params: { id: string } }>(
  '/api/suppliers/:id',
  async (request, reply) => {
    return { data: 'value' };
  }
);
```

**Après** : itty-router
```typescript
router.get('/api/suppliers/:id', async (request: IRequest) => {
  return jsonResponse({ data: 'value' });
});
```

### 4. Gestion d'Erreurs

**Avant** : Fastify reply
```typescript
reply.status(400).send({ error: 'Invalid input' });
```

**Après** : Web Response API
```typescript
return errorResponse('Invalid input', 400);
```

### 5. CORS

**Avant** : Plugin Fastify
```typescript
await fastify.register(cors, {
  origin: 'http://localhost:4321'
});
```

**Après** : Headers manuels
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
```

### 6. Persistance des Données

**Avant** : Stockage en mémoire (Map, Array)
```typescript
const suggestions = new Map<string, Suggestion>();
```

**Après** : Cloudflare D1 (SQLite)
```typescript
await env.DB.prepare(`
  INSERT INTO ai_suggestions (id, data) VALUES (?, ?)
`).bind(id, data).run();
```

### 7. Logging

**Avant** : Fastify logger
```typescript
fastify.log.error({ error }, 'Error message');
```

**Après** : Console + Cloudflare Logs
```typescript
console.error('Error message', error);
// Visible dans Cloudflare Workers Logs
```

### 8. Contexte de Requête

**Avant** : AsyncLocalStorage
```typescript
import { AsyncLocalStorage } from 'async_hooks';
const storage = new AsyncLocalStorage<Context>();
```

**Après** : Passage explicite
```typescript
interface RequestContext {
  traceId: string;
  startTime: number;
}
const ctx = createRequestContext();
// Passé explicitement aux fonctions
```

### 9. Génération d'UUID

**Avant** : Node.js crypto
```typescript
import { randomUUID } from 'crypto';
const id = randomUUID();
```

**Après** : Web Crypto API
```typescript
const id = crypto.randomUUID();
```

## Fichiers Supprimés

### Dashboard Custom
- `src/dashboard/**/*` (tous les fichiers)
- `src/routes/dashboard.ts`
- `src/routes/traffic.ts`
- `src/services/trafficMonitor.ts`
- `src/services/correlationContext.ts`
- `src/types/traffic.ts`
- `vite.config.dashboard.ts`

**Raison** : Remplacé par le dashboard Cloudflare natif

### Configuration
- `src/config/env.ts`

**Raison** : Remplacé par `wrangler.toml` et interface `Env`

## Fichiers Modifiés

### Point d'Entrée
- `src/index.ts` : Complètement réécrit pour Workers

### Routes
- `src/routes/suppliers.ts` : Adapté pour itty-router
- `src/routes/webhooks.ts` : Adapté pour itty-router
- `src/routes/suggestions.ts` : Adapté pour itty-router
- `src/routes/index.ts` : Simplifié (plus de dashboard/traffic)

### Services
- `src/services/openProClient.ts` : Simplifié, fonction factory
- `src/services/ai/suggestionEngine.ts` : Accepte `env` en paramètre
- `src/services/ai/suggestionStorage.ts` : Migré vers D1
- `src/services/openpro/**/*.ts` : Tous acceptent `env` en paramètre

### Configuration
- `src/config/ai.ts` : Accepte `env` au lieu de `config`

## Nouveaux Fichiers

### Configuration Workers
- `wrangler.toml` : Configuration Cloudflare Workers
- `.dev.vars.example` : Exemple de variables secrètes
- `schema.sql` : Schéma de base de données D1

### Utilitaires
- `src/utils/cors.ts` : Helpers pour CORS

## Dépendances

### Supprimées
```json
{
  "fastify": "^4.26.0",
  "@fastify/cors": "^9.0.1",
  "@fastify/static": "^7.0.0",
  "dotenv": "^16.4.5",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "vite": "^7.2.4",
  "@vitejs/plugin-react": "^4.2.1"
}
```

### Ajoutées
```json
{
  "itty-router": "^5.0.18",
  "wrangler": "^3.87.0",
  "@cloudflare/workers-types": "^4.20241127.0"
}
```

### Conservées
```json
{
  "@ai-sdk/openai": "^2.0.69",
  "@ai-sdk/anthropic": "^2.0.45",
  "ai": "^5.0.97",
  "zod": "^3.22.4"
}
```

## Tests et Validation

### 1. Tests Locaux

```bash
# Démarrer le serveur local
npm run dev

# Le serveur devrait démarrer sur http://localhost:8787
# Tester les endpoints avec curl ou Postman
```

### 2. Vérifier D1

```bash
# Créer et initialiser D1
npm run d1:create
npm run d1:migrate:local

# Vérifier les tables
wrangler d1 execute openpro-db --local --command="SELECT name FROM sqlite_master WHERE type='table'"
```

### 3. Tester les Routes

```bash
# Health check
curl http://localhost:8787/health

# Accommodations (remplacer 12345 par un vrai ID)
curl http://localhost:8787/api/suppliers/12345/accommodations

# Suggestions
curl http://localhost:8787/ai/suggestions/12345
```

## Déploiement en Production

### 1. Configuration Initiale

```bash
# Créer la base D1
npm run d1:create

# Mettre à jour wrangler.toml avec le database_id

# Configurer les secrets
wrangler secret put OPENPRO_API_KEY
wrangler secret put OPENAI_API_KEY
```

### 2. Déploiement

```bash
# Compiler et déployer
npm run build
npm run deploy

# Appliquer le schéma D1
npm run d1:migrate
```

### 3. Vérification

```bash
# Tester le worker déployé
curl https://your-worker.workers.dev/health

# Vérifier les logs
wrangler tail
```

## Monitoring en Production

### Dashboard Cloudflare

1. **Workers Analytics**
   - Requêtes par seconde
   - Latence P50/P99
   - Taux d'erreur
   - CPU time

2. **Workers Logs**
   - Logs en temps réel
   - Filtres par statut/path
   - Stack traces d'erreurs

3. **D1 Analytics**
   - Requêtes SQL exécutées
   - Latence des requêtes
   - Stockage utilisé

### Alertes Recommandées

- Taux d'erreur > 5%
- Latence P99 > 500ms
- Échecs D1 > 1%

## Rollback en Cas de Problème

```bash
# Lister les déploiements
wrangler deployments list

# Rollback vers une version précédente
wrangler rollback [deployment-id]
```

## Performance Attendue

### Avant (Fastify)
- Cold start : ~200ms
- Latence moyenne : 50-100ms
- Scaling : Manuel
- Coût : Serveur dédié

### Après (Workers)
- Cold start : ~10ms
- Latence moyenne : 20-50ms (+ proche de l'utilisateur)
- Scaling : Automatique
- Coût : Pay-per-use (gratuit jusqu'à 100k req/jour)

## FAQ

### Q: Puis-je encore utiliser le dashboard custom en local ?
**R:** Non, il a été supprimé. Utilisez les logs console avec `wrangler dev`.

### Q: Comment débugger les erreurs ?
**R:** Utilisez `console.log/error` dans le code. Les logs apparaissent dans la console avec `wrangler dev` (local) ou dans Cloudflare Dashboard (production).

### Q: Puis-je utiliser npm packages Node.js ?
**R:** Seulement ceux compatibles avec Web APIs. Vérifiez sur [workers.cloudflare.com/built-with](https://workers.cloudflare.com/built-with).

### Q: Comment gérer les fichiers statiques ?
**R:** Utilisez Cloudflare Workers Assets ou hébergez sur Cloudflare Pages.

### Q: D1 est-il suffisant pour la production ?
**R:** Oui, D1 est conçu pour la production. Limites : 10 GB de stockage (gratuit), latence ~10ms.

## Prochaines Étapes

1. ✅ Migration complète vers Workers
2. 🔄 Tests d'intégration
3. 🚀 Déploiement en staging
4. 📊 Validation des performances
5. 🎯 Déploiement en production
6. 📈 Monitoring et optimisations

