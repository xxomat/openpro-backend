# OpenPro Backend - Cloudflare Workers

Backend API pour OpenPro.Admin, déployé sur Cloudflare Workers avec D1 (SQLite) pour la persistance.

## 🚀 Stack Technique

- **Runtime**: Cloudflare Workers (V8 isolates, edge computing)
- **Base de données**: Cloudflare D1 (SQLite serverless)
- **Router**: itty-router (léger et performant)
- **IA**: Vercel AI SDK (OpenAI ou Anthropic)
- **Language**: TypeScript

## 📦 Installation

```bash
npm install
```

## 🔧 Configuration

### 1. Variables d'environnement locales

Créez un fichier `.dev.vars` à partir de l'exemple :

```bash
cp .dev.vars.example .dev.vars
```

Puis remplissez les valeurs :

```env
# OpenPro API
OPENPRO_API_KEY=your_openpro_api_key_here

# AI Providers (au moins l'un des deux)
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optionnel: Cloudflare AI Gateway
CLOUDFLARE_AI_GATEWAY_URL=
```

### 2. Base de données D1

**En développement local** : La base D1 est créée et initialisée automatiquement au premier `npm run dev`. Aucune action manuelle requise !

**Pour la production** : Créez la base de données D1 :

```bash
npm run d1:create
```

Notez le `database_id` retourné et mettez-le à jour dans `wrangler.toml` :

```toml
[[d1_databases]]
binding = "DB"
database_name = "openpro-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

Ensuite, appliquez le schéma :

```bash
npm run d1:migrate
```

## 🏃 Développement Local

```bash
# Démarrer le serveur de développement
npm run dev

# Le serveur démarrera sur http://localhost:8787
```

Le mode développement utilise :
- `.dev.vars` pour les secrets
- D1 en mode local (base SQLite créée automatiquement dans `.wrangler/state/`)
- Schéma appliqué automatiquement si la base n'existe pas
- Logs console pour le debugging

## 🚢 Déploiement

### 1. Configurer les secrets en production

```bash
wrangler secret put OPENPRO_API_KEY
wrangler secret put OPENAI_API_KEY
# ou
wrangler secret put ANTHROPIC_API_KEY
```

### 2. Déployer

```bash
npm run deploy
```

### 3. Appliquer le schéma D1 en production

```bash
npm run d1:migrate
```

## 📋 API Endpoints

### Fournisseurs (Suppliers)

- `GET /api/suppliers/:idFournisseur/accommodations` - Liste des hébergements
- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rates` - Tarifs
- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock` - Stock
- `GET /api/suppliers/:idFournisseur/rate-types` - Types de tarifs
- `GET /api/suppliers/:idFournisseur/supplier-data` - Données complètes
- `POST /api/suppliers/:idFournisseur/bulk-update` - Mise à jour en masse

### Webhooks

- `POST /api/webhooks/openpro/booking` - Webhook réservation OpenPro

### Suggestions IA

- `GET /ai/suggestions/:idFournisseur` - Liste des suggestions
- `PATCH /ai/suggestions/:id` - Mettre à jour une suggestion
- `POST /ai/suggestions/:idFournisseur/generate` - Générer des suggestions

### Health Check

- `GET /health` - Statut du service

## 🔍 Monitoring

### En développement local

Les logs sont affichés directement dans la console avec `wrangler dev`.

### En production

Utilisez le dashboard Cloudflare :

1. **Workers Logs** : Logs en temps réel et historique
2. **Workers Analytics** : Métriques de performance (requêtes, latence, erreurs)
3. **D1 Metrics** : Métriques de la base de données

## 🗃️ Base de données D1

### Tables principales

- `local_bookings` : Réservations créées via l'interface admin
- `ai_suggestions` : Suggestions générées par l'IA

### Commandes utiles

```bash
# Exécuter une requête SQL en local
wrangler d1 execute openpro-db --local --command="SELECT * FROM local_bookings LIMIT 10"

# Exécuter une requête SQL en production
wrangler d1 execute openpro-db --command="SELECT * FROM local_bookings LIMIT 10"

# Backup de la base de données
wrangler d1 export openpro-db --output=backup.sql
```

## 🔄 Migration depuis Fastify

Cette version a migré de Node.js/Fastify vers Cloudflare Workers. Principaux changements :

### ✅ Conservé

- Logique métier des routes
- Client OpenPro API
- Vercel AI SDK pour les suggestions
- Structure des données

### ⚠️ Modifié

- Runtime : Node.js → Cloudflare Workers
- Framework : Fastify → itty-router
- Stockage : En mémoire → D1 (SQLite)
- Config : dotenv → wrangler.toml + secrets
- Monitoring : Dashboard custom → Cloudflare Dashboard

### ❌ Supprimé

- Dashboard React custom pour monitoring
- `AsyncLocalStorage` pour le contexte de requête
- Stockage en mémoire (Map/Array)

## 📚 Ressources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [itty-router Documentation](https://itty.dev/)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/)

## 🤝 Support

Pour toute question ou problème, consultez :
- Le fichier `docs/PRD.md` pour la documentation fonctionnelle
- Le fichier `SETUP.md` pour l'installation détaillée
- Les logs Cloudflare Workers en production
