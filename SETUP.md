# Guide de Démarrage Rapide - OpenPro Backend Workers

Ce guide vous aide à démarrer rapidement avec le backend OpenPro migré vers Cloudflare Workers.

## ⚡ Démarrage Rapide (5 minutes)

### 1. Installation des dépendances

```bash
cd openpro-backend
npm install
```

### 2. Configuration des secrets locaux

```bash
# Copier l'exemple
cp .dev.vars.example .dev.vars

# Éditer .dev.vars et remplir vos clés API
# OPENPRO_API_KEY=votre_clé_openpro
# OPENAI_API_KEY=votre_clé_openai
```

### 3. Initialiser D1 (base de données locale)

**✅ C'est automatique !** La base de données D1 locale sera créée et initialisée automatiquement au premier démarrage avec `npm run dev`.

Si vous voulez l'initialiser manuellement avant :

```bash
npm run setup:local
```

La base de données locale est stockée dans `.wrangler/state/v3/d1/` et persiste entre les redémarrages.

> **Note pour la production** : Pour déployer en production, vous devrez créer une vraie base D1 avec `npm run d1:create` et mettre le `database_id` dans `wrangler.toml`.

### 4. Démarrer le serveur de développement

```bash
npm run dev
```

Le serveur démarre sur **http://localhost:8787** 🎉

### 5. Tester l'API

```bash
# Health check
curl http://localhost:8787/health

# Si vous avez accès à l'API OpenPro, testez avec un vrai ID fournisseur
curl http://localhost:8787/api/suppliers/YOUR_SUPPLIER_ID/accommodations
```

## 📝 Configuration Détaillée

### Variables d'Environnement

Le fichier `.dev.vars` contient vos secrets pour le développement local :

```env
# Obligatoire
OPENPRO_API_KEY=votre_cle_api_openpro

# Au moins l'un des deux pour l'IA
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optionnel : AI Gateway Cloudflare
CLOUDFLARE_AI_GATEWAY_URL=
```

Le fichier `wrangler.toml` contient la configuration publique :

```toml
[vars]
OPENPRO_BASE_URL = "https://api.open-pro.fr/tarif/multi/v1"
FRONTEND_URL = "http://localhost:4321"
AI_PROVIDER = "openai"  # ou "anthropic"
```

### Base de Données D1

D1 est une base SQLite serverless gérée par Cloudflare.

**En développement local** :
- Base créée automatiquement au premier `npm run dev`
- Base stockée dans `.wrangler/state/v3/d1/`
- Pas besoin de serveur SQL séparé
- Données persistées entre les redémarrages
- Schéma appliqué automatiquement si la base n'existe pas

**Commandes utiles** :

```bash
# Voir les tables
wrangler d1 execute openpro-db --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# Requête de test
wrangler d1 execute openpro-db --local --command="SELECT COUNT(*) FROM local_bookings"

# Reset complet (supprime toutes les données)
wrangler d1 execute openpro-db --local --file=schema.sql
```

## 🔧 Développement

### Structure du Projet

```
openpro-backend/
├── src/
│   ├── index.ts              # Point d'entrée Workers
│   ├── config/
│   │   └── ai.ts             # Configuration AI SDK
│   ├── routes/
│   │   ├── index.ts          # (obsolète, routes inline dans index.ts)
│   │   ├── suppliers.ts      # Routes fournisseurs
│   │   ├── webhooks.ts       # Routes webhooks OpenPro
│   │   └── suggestions.ts    # Routes suggestions IA
│   ├── services/
│   │   ├── openProClient.ts  # Client API OpenPro
│   │   ├── ai/
│   │   │   ├── suggestionEngine.ts    # Génération suggestions IA
│   │   │   ├── suggestionStorage.ts   # Stockage D1
│   │   │   └── analysisPrompts.ts
│   │   └── openpro/
│   │       ├── accommodationService.ts
│   │       ├── rateService.ts
│   │       ├── stockService.ts
│   │       └── ...
│   ├── types/
│   │   ├── api.ts
│   │   └── suggestions.ts
│   └── utils/
│       ├── cors.ts           # Helpers CORS
│       └── dateUtils.ts
├── openpro-api-react/        # Client API OpenPro (submodule)
├── wrangler.toml             # Config Cloudflare Workers
├── schema.sql                # Schéma base de données D1
├── .dev.vars.example         # Exemple secrets locaux
└── package.json
```

### Ajouter une Nouvelle Route

**Exemple : Route pour lister les utilisateurs**

1. Créer la fonction de route dans le fichier approprié (ex: `src/routes/suppliers.ts`)

```typescript
router.get('/api/users', async (request: IRequest) => {
  try {
    const users = await env.DB.prepare('SELECT * FROM users').all();
    return jsonResponse(users.results);
  } catch (error) {
    logger.error('Error fetching users', error);
    return errorResponse('Failed to fetch users', 500);
  }
});
```

2. Enregistrer la route dans `src/index.ts`

```typescript
suppliersRouter(router, env, ctx);
// Votre nouvelle route est déjà incluse si elle est dans suppliersRouter
```

### Utiliser D1 dans une Route

```typescript
// INSERT
await env.DB.prepare(`
  INSERT INTO local_bookings (id_fournisseur, id_hebergement, date_arrivee)
  VALUES (?, ?, ?)
`).bind(idFournisseur, idHebergement, dateArrivee).run();

// SELECT
const result = await env.DB.prepare(`
  SELECT * FROM local_bookings WHERE id_fournisseur = ?
`).bind(idFournisseur).all();

const bookings = result.results;

// UPDATE
await env.DB.prepare(`
  UPDATE local_bookings SET date_modification = ? WHERE id = ?
`).bind(new Date().toISOString(), id).run();

// DELETE
await env.DB.prepare(`
  DELETE FROM local_bookings WHERE id = ?
`).bind(id).run();
```

### Logs et Debugging

```typescript
// Logs simples
console.log('Info message', { data: 'value' });
console.error('Error message', error);
console.warn('Warning message');

// Les logs apparaissent dans la console avec `wrangler dev`
```

**Astuce** : Utilisez un format structuré pour les logs :

```typescript
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  message: 'Request processed',
  duration: 42,
  path: '/api/suppliers/123'
}));
```

## 🚀 Déploiement en Production

### 1. Connexion à Cloudflare

```bash
# Se connecter avec votre compte Cloudflare
wrangler login
```

### 2. Créer la Base D1 en Production

```bash
# Créer la base
npm run d1:create

# Copier le database_id dans wrangler.toml

# Appliquer le schéma
npm run d1:migrate
```

### 3. Configurer les Secrets

```bash
wrangler secret put OPENPRO_API_KEY
# Entrer la valeur quand demandé

wrangler secret put OPENAI_API_KEY
# ou
wrangler secret put ANTHROPIC_API_KEY
```

### 4. Compiler et Déployer

```bash
# Compiler TypeScript
npm run build

# Déployer sur Cloudflare
npm run deploy
```

Votre Worker sera disponible sur :
`https://openpro-backend.YOUR_ACCOUNT.workers.dev`

### 5. Configurer un Domaine Custom (Optionnel)

Dans le dashboard Cloudflare Workers :
1. Aller dans Settings → Triggers
2. Ajouter une Custom Domain (ex: `api.votre-domaine.com`)
3. Le certificat SSL est automatique

## 📊 Monitoring

### En Développement

Avec `wrangler dev`, tous les logs apparaissent dans votre terminal.

### En Production

1. **Dashboard Cloudflare** : https://dash.cloudflare.com
   - Workers & Pages → Votre worker
   - Onglet "Logs" pour les logs en temps réel
   - Onglet "Metrics" pour les analytics

2. **Logs en temps réel** (CLI) :
```bash
wrangler tail
```

3. **Requêtes récentes** :
```bash
wrangler tail --format json | jq
```

## 🐛 Dépannage

### Erreur : "database_id is empty"

**Solution** : Créez la base D1 et mettez à jour `wrangler.toml` :
```bash
npm run d1:create
# Copier le database_id retourné dans wrangler.toml
```

### Erreur : "OPENPRO_API_KEY is not defined"

**Solution** : Vérifiez que `.dev.vars` existe et contient la clé :
```bash
cat .dev.vars
# Doit afficher : OPENPRO_API_KEY=...
```

### Erreur : "Table not found"

**Solution** : Appliquez le schéma D1 :
```bash
npm run d1:migrate:local
```

### Port 8787 déjà utilisé

**Solution** : Changez le port dans `wrangler.toml` :
```toml
[dev]
port = 8788
```

### Logs ne s'affichent pas

**Solution** : Utilisez `console.log` au lieu de `logger.info`. Vérifiez que `wrangler dev` est bien lancé.

## 📚 Ressources Utiles

### Documentation Officielle
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [itty-router](https://itty.dev/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### Exemples de Code
- [Workers Examples](https://developers.cloudflare.com/workers/examples/)
- [D1 Examples](https://developers.cloudflare.com/d1/examples/)

### Tutoriels
- [Getting Started with Workers](https://developers.cloudflare.com/workers/get-started/)
- [D1 Tutorial](https://developers.cloudflare.com/d1/get-started/)

## 💡 Bonnes Pratiques

### 1. Gestion des Erreurs

Toujours wrapper les appels API/DB dans try-catch :

```typescript
try {
  const data = await env.DB.prepare('SELECT * FROM table').all();
  return jsonResponse(data.results);
} catch (error) {
  logger.error('Database error', error);
  return errorResponse('Internal error', 500);
}
```

### 2. Validation des Entrées

Utilisez Zod pour valider les données :

```typescript
import { z } from 'zod';

const schema = z.object({
  idFournisseur: z.number(),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const parsed = schema.safeParse(data);
if (!parsed.success) {
  return errorResponse('Invalid input', 400);
}
```

### 3. Performance

- Utilisez `env.DB.batch()` pour les insertions multiples
- Mettez en cache les résultats fréquents avec KV (optionnel)
- Évitez les boucles synchrones, préférez `Promise.all()`

### 4. Sécurité

- Ne loggez jamais les clés API ou tokens
- Validez tous les paramètres d'entrée
- Utilisez CORS restrictif en production

## 🎯 Prochaines Étapes

1. ✅ Terminer le setup local
2. 📝 Tester toutes les routes API
3. 🧪 Écrire des tests (optionnel)
4. 🚀 Déployer en staging
5. ✅ Valider en staging
6. 🎉 Déployer en production

---

**Besoin d'aide ?** Consultez `MIGRATION.md` pour plus de détails sur les changements, ou `README.md` pour la documentation complète.
