# PRD - Product Requirements Document
## OpenPro.Backend

**Version:** 2.0.0  
**Date de création:** 2025  
**Dernière mise à jour:** 2025 (Migration Cloudflare Workers)  
**Statut:** Actif  

---

## 1. Vue d'ensemble

### 1.1 Objectif du projet

**OpenPro.Backend** est une API REST backend déployée sur Cloudflare Workers qui sert d'intermédiaire entre le frontend OpenPro.Admin et l'API Open Pro Multi v1. Il gère tous les appels à l'API OpenPro, sécurise la clé API côté serveur, et expose une API REST simplifiée pour le frontend.

**Architecture serverless** : Le backend fonctionne sur Cloudflare Workers, une plateforme edge computing qui permet un déploiement global avec une latence minimale et un scaling automatique.

### 1.2 Contexte

Le backend utilise l'API Open Pro Multi v1 (documentation disponible sur [documentation.open-system.fr](https://documentation.open-system.fr/api-openpro/tarif/multi/v1/)) via le sous-module client `openpro-api-react` pour communiquer avec l'API OpenPro. Il expose ensuite une API REST simplifiée que le frontend consomme.

**Note importante:** `openpro-api-react` est un dépôt Git externe distinct, ajouté au backend comme sous-module Git. Ce dépôt contient le client TypeScript, les types OpenPro, et le stub-server utilisé pour les tests en développement.

### 1.3 Portée

Le backend couvre les domaines fonctionnels suivants :
- Gestion des fournisseurs et hébergements
- Gestion des stocks
- Gestion des tarifs et types de tarifs
- Service de suggestions IA pour les ajustements de tarifs
- Réception et traitement des webhooks OpenPro
- Persistance des données via Cloudflare D1 (SQLite serverless)

---

## 2. Architecture technique

### 2.1 Stack technologique

- **Runtime**: Cloudflare Workers (V8 isolates, edge computing)
- **Framework**: itty-router (router léger et performant pour Workers)
- **Langage**: TypeScript
- **Base de données**: Cloudflare D1 (SQLite serverless)
- **Gestion de paquets**: npm
- **Client API OpenPro**: sous-module Git `openpro-api-react` (dépôt externe, contient client TypeScript, types Open Pro, et stub-server pour tests)
- **AI SDK**: Vercel AI SDK (`ai`) avec support OpenAI et Anthropic
- **Cloudflare AI Gateway**: Support optionnel pour le routage et le monitoring des appels IA
- **Validation**: Zod pour la validation des schémas IA
- **CORS**: Support CORS pour le frontend (headers manuels)
- **Monitoring**: Dashboard Cloudflare natif (Workers Analytics, Workers Logs, D1 Metrics)
- **Configuration**: wrangler.toml + secrets Cloudflare

### 2.2 Structure du projet

Arborescence principale du dépôt :

```
OpenPro.Backend/
├── src/
│   ├── index.ts                 # Point d'entrée Cloudflare Worker
│   ├── config/
│   │   └── ai.ts               # Configuration AI SDK
│   ├── types/
│   │   ├── api.ts              # Types partagés
│   │   ├── apiTypes.ts         # Types pour les réponses API OpenPro
│   │   └── suggestions.ts      # Types pour suggestions IA
│   ├── services/
│   │   ├── openProClient.ts    # Factory du client OpenPro
│   │   ├── openpro/            # Services métier OpenPro
│   │   │   ├── accommodationService.ts
│   │   │   ├── rateService.ts
│   │   │   ├── rateTypeService.ts
│   │   │   ├── stockService.ts
│   │   │   ├── supplierDataService.ts
│   │   │   ├── bulkUpdateService.ts  # Service de transformation bulk
│   │   │   └── utils/
│   │   │       └── rateUtils.ts
│   │   └── ai/                 # Services IA
│   │       ├── suggestionEngine.ts
│   │       ├── analysisPrompts.ts
│   │       └── suggestionStorage.ts  # Stockage D1
│   ├── routes/
│   │   ├── index.ts            # Agrégation des routes
│   │   ├── suppliers.ts        # Routes /api/suppliers/*
│   │   ├── webhooks.ts         # Routes /api/webhooks/*
│   │   └── suggestions.ts      # Routes /ai/suggestions/*
│   └── utils/
│       ├── cors.ts             # Helpers CORS
│       └── dateUtils.ts
├── scripts/
│   └── setup-local-db.js       # Script d'initialisation D1 locale
├── openpro-api-react/          # Sous-module Git (dépôt externe)
├── docs/
│   └── PRD.md                  # Ce document
├── schema.sql                  # Schéma de base de données D1
├── wrangler.toml               # Configuration Cloudflare Workers
├── .dev.vars.example           # Exemple de variables secrètes
├── package.json
├── tsconfig.json
├── MIGRATION.md                # Guide de migration Fastify → Workers
└── README.md
```

### 2.3 Architecture actuelle

Vue d'ensemble :
- **Cloudflare Workers** exécute le code sur le réseau edge de Cloudflare (plus de 300 datacenters).
- **itty-router** gère le routage HTTP avec une API simple et performante.
- Les routes sont organisées par domaine fonctionnel (suppliers, webhooks, suggestions).
- Les services métier encapsulent la logique de traitement des données OpenPro.
- Le service IA utilise le Vercel AI SDK pour générer des suggestions basées sur l'analyse des réservations.
- **Cloudflare D1** (SQLite serverless) persiste les suggestions IA et autres données.
- Le client OpenPro est créé via une factory pour chaque requête (compatible Workers).
- La clé API OpenPro est stockée dans les secrets Cloudflare et n'est jamais exposée au frontend.
- Les logs sont gérés via `console.log/error` et visibles dans le dashboard Cloudflare.

---

## 3. Endpoints API REST

### 3.1 Routes fournisseurs (`/api/suppliers`)

#### 3.1.1 Hébergements
- `GET /api/suppliers/:idFournisseur/accommodations` - Liste des hébergements d'un fournisseur

#### 3.1.2 Tarifs
- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rates` - Récupérer les tarifs (query params `debut`, `fin`)

#### 3.1.3 Stock
- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock` - Récupérer le stock (query params `debut`, `fin`)
- `POST /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock` - Mettre à jour le stock
  - **Corps de la requête** :
    ```typescript
    {
      jours: Array<{
        date: string;        // Format: YYYY-MM-DD
        dispo: number;       // Disponibilité (généralement 0 ou 1)
      }>
    }
    ```
  - **Comportement** :
    - Met à jour ou crée les entrées de stock pour les dates spécifiées.
    - Les dates valides peuvent être créées si elles n'existent pas déjà dans OpenPro.
    - Si une date est déjà présente dans OpenPro, sa disponibilité est mise à jour.
    - Retourne une réponse de succès ou une erreur en cas d'échec.
  - **Intégration OpenPro** : Utilise `openProClient.updateStock()` pour propager les changements à l'API OpenPro.

#### 3.1.4 Types de tarifs
- `GET /api/suppliers/:idFournisseur/rate-types` - Liste des types de tarifs disponibles

#### 3.1.5 Données complètes
- `GET /api/suppliers/:idFournisseur/supplier-data` - Toutes les données (stock, tarifs, types, réservations) (query params `debut`, `fin`)
  - Retourne les réservations avec les champs `isPendingSync` et `isObsolete` pour les réservations Direct :
    - `isPendingSync: true` : réservation Direct locale en attente de synchronisation avec OpenPro
    - `isObsolete: true` : réservation Direct présente dans OpenPro mais sans correspondance locale dans la DB (détectée dynamiquement, **non stockée dans la DB**)

#### 3.1.6 Statut de synchronisation des réservations Direct
- `GET /api/suppliers/:idFournisseur/local-bookings-sync-status` - Vérifier l'état de synchronisation et d'obsolescence des réservations Direct
  - **Réponse** :
    ```typescript
    {
      lastSyncCheck: string | null,      // Timestamp de la dernière vérification
      pendingSyncCount: number,          // Nombre de réservations en attente de synchronisation
      syncedCount: number,               // Nombre de réservations synchronisées
      obsoleteCount: number,             // Nombre de réservations obsolètes (détectées dynamiquement, non stockées en DB)
      lastChange: string | null         // Timestamp de la dernière modification d'état
    }
    ```
  - Utilisé par le frontend pour le polling et détecter les changements (synchronisation ET obsolescence)

#### 3.1.7 Mise à jour en bulk
- `POST /api/suppliers/:idFournisseur/bulk-update` - Sauvegarder les modifications de tarifs et durées minimales en bulk
  - **Body** :
    ```typescript
    {
      accommodations: [
        {
          idHebergement: number,
          dates: [
            {
              date: string,              // YYYY-MM-DD
              rateTypeId?: number,       // présent si tarif modifié
              price?: number,            // présent si tarif modifié
              dureeMin?: number | null   // présent si dureeMin modifiée
            }
          ]
        }
      ]
    }
    ```
  - **Comportement** :
    - Reçoit les modifications groupées par hébergement et par date.
    - Pour chaque hébergement, transforme les modifications en périodes tarifaires au format OpenPro.
    - Appelle l'API OpenPro `setRates` pour chaque hébergement modifié.
    - La transformation regroupe les dates contiguës avec les mêmes valeurs en périodes (`debut`/`fin`).
    - Les périodes sont construites au format `TarifModif[]` avec tous les champs requis (incluant `dureeMin`).
  - **Réponse** :
    - `200 OK` en cas de succès.
    - `400 Bad Request` si les données sont invalides.
    - `500 Internal Server Error` en cas d'erreur lors de l'appel à l'API OpenPro.

### 3.2 Routes webhooks (`/api/webhooks`)

- `POST /api/webhooks/openpro/booking` - Réception des webhooks OpenPro pour nouvelles réservations
  - Traite la réservation
  - Charge les données contextuelles (rates, stock, bookings récents)
  - Déclenche l'analyse IA de façon asynchrone
  - Retourne rapidement au webhook

### 3.3 Routes suggestions (`/ai/suggestions`)

- `GET /ai/suggestions/:idFournisseur` - Liste des suggestions (filtre optionnel `?status=pending`)
- `PATCH /ai/suggestions/:id` - Mettre à jour le statut d'une suggestion (applied/rejected)
- `POST /ai/suggestions/:idFournisseur/generate` - Déclencher manuellement une analyse

### 3.4 Routes cron (`/cron`)

#### 3.4.1 Validation de synchronisation des réservations Direct
- `GET /cron/validate-direct-bookings` - Validation automatique toutes les 15 minutes
  - **Déclenchement** : Automatique via Cloudflare Cron (configuré dans `wrangler.toml`)
  - **Fréquence** : Toutes les 2 minutes (`*/2 * * * *`) en développement, toutes les 15 minutes en production
  - **Rôle** :
    - Vérifie que les réservations locales sont bien synchronisées dans OpenPro
    - Détecte les réservations obsolètes (Direct dans OpenPro sans correspondance locale)
    - Met à jour `synced_at` dans `local_bookings` pour les réservations synchronisées
    - **Important** : Les réservations obsolètes ne sont **PAS stockées dans la DB**. Elles sont détectées dynamiquement en comparant les réservations OpenPro avec les réservations locales.
    - Log les résultats pour monitoring
  - **Réponse** :
    ```typescript
    {
      success: true,
      timestamp: string,
      stats: {
        localBookingsCount: number,      // Nombre de réservations locales en attente de sync
        syncedCount: number,             // Nombre de réservations nouvellement synchronisées
        pendingCount: number,             // Nombre de réservations toujours en attente
        obsoleteCount: number,           // Nombre total de réservations obsolètes détectées
        bookings: Array<{                // Liste de toutes les réservations (locales + obsolètes)
          reference: string | null,
          dateArrivee: string,
          synced: boolean,
          obsolete: boolean
        }>
      }
    }
    ```
  - **Note** : Le champ `bookings` inclut à la fois les réservations locales (depuis la DB) et les réservations obsolètes (détectées dynamiquement depuis OpenPro). Les réservations obsolètes sont identifiables par `obsolete: true`.

#### 3.4.2 Gestion des réservations obsolètes

**Principe** : Les réservations obsolètes sont des réservations Direct présentes dans OpenPro mais sans correspondance locale dans la base de données. Elles ne sont **jamais stockées dans la DB** pour éviter la pollution de données.

**Détection** :
- Les réservations obsolètes sont détectées dynamiquement lors du chargement des réservations
- Comparaison entre les réservations Direct depuis OpenPro et les réservations locales dans la DB
- Si une réservation Direct dans OpenPro n'a pas de correspondance locale (même `idHebergement`, `dateArrivee`, `dateDepart`), elle est marquée comme obsolète

**Comportement** :
- Le flag `isObsolete: true` est défini dynamiquement dans les réponses API
- Les réservations obsolètes apparaissent dans l'interface admin avec un style hachuré
- Le compte des obsolètes est disponible via l'endpoint `/cron/validate-direct-bookings`
- Les réservations obsolètes sont incluses dans le champ `bookings` de la réponse du cron job

**Avantages** :
- Pas de pollution de la base de données avec des réservations qui n'existent plus localement
- Détection en temps réel lors du chargement des données
- Visibilité immédiate dans l'interface admin

### 3.5 Health check

- `GET /health` - Vérification de l'état du serveur

### 3.6 Debug (développement)

- `GET /debug` - Informations de debug sur la requête et l'environnement (utile pour le développement)

---

## 4. Service de suggestions IA

### 4.1 Fonctionnement

Le service de suggestions utilise le Vercel AI SDK pour analyser les réservations récentes et générer des suggestions d'ajustements de tarifs et durées minimales.

**Déclenchement automatique :**
- Lors de la réception d'un webhook de nouvelle réservation
- Analyse asynchrone pour ne pas bloquer le webhook

**Déclenchement manuel :**
- Via l'endpoint `POST /ai/suggestions/:idFournisseur/generate`

### 4.2 Types de suggestions

- `rate_increase` - Augmentation de tarif suggérée
- `rate_decrease` - Baisse de tarif suggérée
- `min_stay_increase` - Augmentation de durée minimale suggérée
- `min_stay_decrease` - Réduction de durée minimale suggérée
- TBD

### 4.3 Données analysées

Pour chaque suggestion, l'IA analyse :
- Réservations récentes (nombre, dates, montants)
- Tarifs actuels
- Stock disponible
- Saisonnalité

### 4.4 Stockage

Les suggestions sont stockées dans **Cloudflare D1** (SQLite serverless) via la table `ai_suggestions`. La persistance est garantie et les données sont répliquées automatiquement sur le réseau Cloudflare.

### 4.5 Configuration AI

- Provider par défaut : OpenAI (configurable via `AI_PROVIDER`)
- Support Cloudflare AI Gateway pour le monitoring et le caching
- Validation des réponses avec schémas Zod

---

## 5. Configuration et variables d'environnement

### 5.1 Configuration Cloudflare Workers

La configuration se fait via `wrangler.toml` et les secrets Cloudflare.

**Variables dans `wrangler.toml`** (non sensibles) :
- `OPENPRO_BASE_URL` - URL de l'API OpenPro (défaut: https://api.open-pro.fr/tarif/multi/v1)
- `FRONTEND_URL` - URL du frontend (pour CORS, défaut: http://localhost:4321)
- `AI_PROVIDER` - Provider IA (openai ou anthropic, défaut: openai)

**Secrets Cloudflare** (sensibles, définis via `wrangler secret put`) :
- `OPENPRO_API_KEY` - Clé API OpenPro (gardée secrète côté serveur)
- `OPENAI_API_KEY` - Clé API OpenAI (si AI_PROVIDER=openai)
- `ANTHROPIC_API_KEY` - Clé API Anthropic (si AI_PROVIDER=anthropic)
- `CLOUDFLARE_AI_GATEWAY_URL` - URL optionnelle du Cloudflare AI Gateway

**En développement local** :
- Les secrets sont définis dans `.dev.vars` (non versionné, copier depuis `.dev.vars.example`)
- La base D1 locale est créée automatiquement dans `.wrangler/state/`

### 5.2 Base de données D1

**En développement** :
- La base D1 locale est créée automatiquement au premier `npm run dev`
- Le schéma est appliqué automatiquement si la base n'existe pas

**En production** :
- Créer la base : `npm run d1:create`
- Mettre à jour `database_id` dans `wrangler.toml`
- Appliquer le schéma : `npm run d1:migrate`

---

## 6. Sécurité

### 6.1 Clé API OpenPro

- Stockée dans les secrets Cloudflare (production) ou `.dev.vars` (développement local)
- Jamais exposée au frontend
- Non versionnée dans Git (fichier `.dev.vars` dans `.gitignore`)
- Gestion sécurisée via `wrangler secret put` en production

### 6.2 CORS

- Configuration CORS via headers manuels dans `src/utils/cors.ts`
- URL du frontend configurée via `FRONTEND_URL` dans `wrangler.toml`
- Support des requêtes preflight (OPTIONS)

### 6.3 Secrets Cloudflare

- Les secrets sont stockés de manière sécurisée dans Cloudflare
- Jamais exposés dans le code ou les logs
- Gestion via `wrangler secret put` ou le dashboard Cloudflare

---

## 7. Tests et développement

### 7.1 Utilisation du stub server

En développement, le backend peut pointer vers le stub server fourni par le sous-module `openpro-api-react` au lieu de l'API OpenPro réelle.

**Note:** Le stub-server n'est pas dans le dépôt du backend. Il fait partie du sous-module `openpro-api-react`.

Configuration :
```ini
OPENPRO_BASE_URL=http://localhost:3000
OPENPRO_API_KEY=fake-key-for-testing
```

### 7.2 Workflow de développement

1. Terminal 1 : Démarrer le stub server depuis la racine du monorepo `cd openpro-api-react && npm run stub` (port 3000)
2. Terminal 2 : Démarrer le backend `cd openpro-backend && npm run dev` (port 8787)
   - Le backend démarre automatiquement avec Wrangler
   - La base D1 locale est créée automatiquement si nécessaire
   - Les logs apparaissent dans la console
3. Terminal 3 : Démarrer le frontend `cd openpro-admin-react && npm run dev` (port 4321)

**Note:** En développement dans un monorepo, le stub-server peut être lancé depuis `openpro-api-react/` à la racine. Le backend référence ce même dépôt via son sous-module.

**Configuration locale** :
- Créer `.dev.vars` à partir de `.dev.vars.example`
- Remplir les secrets nécessaires
- Le backend utilisera automatiquement ces variables en local

### 7.3 Production

**Configuration** :
- Les variables non sensibles sont dans `wrangler.toml`
- Les secrets sont configurés via `wrangler secret put` ou le dashboard Cloudflare
- La base D1 de production doit être créée et migrée

**Déploiement** :
```bash
# Configurer les secrets
wrangler secret put OPENPRO_API_KEY
wrangler secret put OPENAI_API_KEY

# Déployer
npm run deploy

# Appliquer le schéma D1
npm run d1:migrate
```

### 7.4 Configuration du sous-module openpro-api-react

Le backend référence `openpro-api-react` comme sous-module Git. Pour l'initialiser:

```bash
git submodule update --init --recursive
```

Le sous-module pointe vers le dépôt externe `openpro-api-react`. Voir `SETUP.md` pour les détails.

**Important:** Le sous-module inclut le stub-server. En développement, il est recommandé de lancer le stub-server depuis une instance séparée d'`openpro-api-react` (à la racine du monorepo ou checkout séparé) plutôt que depuis le sous-module du backend, pour éviter les conflits de versions.

---

## 8. Déploiement

### 8.1 Build

```bash
npm run build
```

Compile TypeScript vers JavaScript (vérification de types uniquement, Workers utilise directement TypeScript).

### 8.2 Déploiement Cloudflare

```bash
npm run deploy
```

Déploie le Worker sur Cloudflare. Le Worker est automatiquement distribué sur le réseau edge de Cloudflare (300+ datacenters).

### 8.3 Configuration de production

**Avant le premier déploiement** :
1. Créer la base D1 : `npm run d1:create`
2. Mettre à jour `database_id` dans `wrangler.toml`
3. Configurer les secrets : `wrangler secret put <NAME>`
4. Appliquer le schéma D1 : `npm run d1:migrate`

**Avantages Cloudflare Workers** :
- Scaling automatique (0 à millions de requêtes)
- Latence minimale (edge computing)
- Coût pay-per-use (gratuit jusqu'à 100k requêtes/jour)
- Cold start < 10ms
- Distribution globale automatique

---

## 6. Monitoring et Observabilité

### 6.1 Vue d'ensemble

Le backend utilise les outils natifs de Cloudflare pour le monitoring et l'observabilité. Plus besoin de dashboard custom, tous les outils sont intégrés dans le dashboard Cloudflare.

### 6.2 Workers Analytics

**Métriques disponibles** :
- Requêtes par seconde (RPS)
- Latence P50, P75, P95, P99
- Taux d'erreur (%)
- CPU time (temps d'exécution)
- Requêtes par statut HTTP (200, 400, 500, etc.)
- Distribution géographique des requêtes

**Accès** : Dashboard Cloudflare → Workers → Analytics

### 6.3 Workers Logs

**Fonctionnalités** :
- Logs en temps réel (streaming)
- Historique des logs (rétention configurable)
- Filtres par :
  - Statut HTTP
  - Path/endpoint
  - Erreurs uniquement
  - Date/heure
- Stack traces complètes pour les erreurs
- Métadonnées de requête (headers, query params, body)

**Accès** : Dashboard Cloudflare → Workers → Logs

**En développement local** :
- Les logs apparaissent directement dans la console avec `wrangler dev`
- Format : `[traceId] message data`

### 6.4 D1 Analytics

**Métriques disponibles** :
- Nombre de requêtes SQL exécutées
- Latence des requêtes (P50, P99)
- Stockage utilisé
- Requêtes par type (SELECT, INSERT, UPDATE, DELETE)
- Erreurs SQL

**Accès** : Dashboard Cloudflare → D1 → Analytics

### 6.5 Traçage des requêtes

Chaque requête génère un `traceId` unique (UUID) qui est :
- Loggé dans tous les appels console
- Inclus dans les réponses d'erreur
- Utilisable pour corréler les logs dans le dashboard Cloudflare

**Exemple de log** :
```
[abc-123] GET /api/suppliers/12345/accommodations
[abc-123] GET /api/suppliers/12345/accommodations 200 (45ms)
```

### 6.6 Alertes recommandées

Configurer dans Cloudflare Dashboard :
- Taux d'erreur > 5%
- Latence P99 > 500ms
- Échecs D1 > 1%
- CPU time > 50ms (moyenne)

---

## 9. Évolutions futures

### 9.1 Cache

- Implémenter Cloudflare Cache API ou KV pour les données fréquemment demandées (hébergements, types de tarifs)
- Réduire les appels à l'API OpenPro
- TTL configurable par type de données

### 9.2 Authentification

- Ajouter un système d'authentification pour sécuriser l'API backend
- Tokens JWT ou API keys pour le frontend
- Utiliser Cloudflare Access ou Workers KV pour la gestion des sessions

### 9.3 Rate Limiting

- Implémenter Cloudflare Rate Limiting pour protéger l'API
- Limites par endpoint et par IP
- Protection contre les abus

### 9.4 Monitoring avancé

✅ **Implémenté** : Monitoring via dashboard Cloudflare natif

**Améliorations futures :**
- Intégration avec Sentry pour le tracking d'erreurs
- Métriques custom via Workers Analytics Engine
- Alertes avancées (emails, Slack, PagerDuty)
- Dashboards Grafana avec données Cloudflare
- Logging structuré JSON pour meilleure analyse

### 9.5 Performance

- Optimisation des requêtes D1 (indexes, requêtes préparées)
- Mise en cache des résultats IA fréquents
- Compression des réponses (gzip/brotli)
- Utilisation de Cloudflare R2 pour le stockage de fichiers volumineux si nécessaire

---

## 11. Migration depuis Fastify

Cette version a migré de Node.js/Fastify vers Cloudflare Workers. Voir `MIGRATION.md` pour les détails techniques complets.

**Principaux changements** :
- ✅ Runtime : Node.js → Cloudflare Workers (edge computing)
- ✅ Framework : Fastify → itty-router
- ✅ Base de données : Stockage en mémoire → Cloudflare D1 (SQLite serverless)
- ✅ Configuration : dotenv → wrangler.toml + secrets Cloudflare
- ✅ Monitoring : Dashboard custom React → Dashboard Cloudflare natif
- ✅ Logging : Fastify logger → console.log/error (Cloudflare Logs)
- ✅ Contexte : AsyncLocalStorage → Passage explicite du contexte

**Avantages** :
- Latence réduite (edge computing, < 10ms cold start)
- Scaling automatique (0 à millions de requêtes)
- Coût optimisé (pay-per-use, gratuit jusqu'à 100k req/jour)
- Distribution globale automatique (300+ datacenters)
- Monitoring intégré (Workers Analytics, Logs, D1 Metrics)

## 12. Références

- Documentation API Open Pro : https://documentation.open-system.fr/api-openpro/tarif/multi/v1/
- Vercel AI SDK : https://ai-sdk.dev/
- Cloudflare Workers : https://developers.cloudflare.com/workers/
- Cloudflare D1 : https://developers.cloudflare.com/d1/
- itty-router : https://itty.dev/
- Cloudflare AI Gateway : https://developers.cloudflare.com/ai-gateway/
- Guide de migration : Voir `MIGRATION.md` dans ce dépôt

