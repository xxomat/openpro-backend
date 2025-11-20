# PRD - Product Requirements Document
## OpenPro.Backend

**Version:** 1.0.0  
**Date de création:** 2025  
**Statut:** Draft  

---

## 1. Vue d'ensemble

### 1.1 Objectif du projet

**OpenPro.Backend** est une API REST backend Node.js/Fastify qui sert d'intermédiaire entre le frontend OpenPro.Admin et l'API Open Pro Multi v1. Il gère tous les appels à l'API OpenPro, sécurise la clé API côté serveur, et expose une API REST simplifiée pour le frontend.

### 1.2 Contexte

Le backend utilise l'API Open Pro Multi v1 (documentation disponible sur [documentation.open-system.fr](https://documentation.open-system.fr/api-openpro/tarif/multi/v1/)) via le sous-module client `openpro-api-react` pour communiquer avec l'API OpenPro. Il expose ensuite une API REST simplifiée que le frontend consomme.

**Note importante:** `openpro-api-react` est un dépôt Git externe distinct, ajouté au backend comme sous-module Git. Ce dépôt contient le client TypeScript, les types OpenPro, et le stub-server utilisé pour les tests en développement.

### 1.3 Portée

Le backend couvre les domaines fonctionnels suivants :
- Gestion des fournisseurs et hébergements
- Gestion des stocks
- Gestion des tarifs et types de tarifs
- Service de suggestions IA pour les ajustements de tarifs (TBD)
- Réception et traitement des webhooks OpenPro (TBD)

Note: TBD = To Be Defined

---

## 2. Architecture technique

### 2.1 Stack technologique

- Backend: Fastify (framework web Node.js)
- Langage: TypeScript
- Runtime: Node.js (ESM)
- Gestion de paquets: npm
- Client API OpenPro: sous-module Git `openpro-api-react` (dépôt externe, contient client TypeScript, types Open Pro, et stub-server pour tests)
- AI SDK: Vercel AI SDK (`ai`) avec support OpenAI et Anthropic
- Cloudflare AI Gateway: Support optionnel pour le routage et le monitoring des appels IA
- Validation: Zod pour la validation des schémas IA
- CORS: Support CORS pour le frontend
- Dashboard: React 18 + Vite + TypeScript pour l'interface de monitoring
- Static Files: `@fastify/static` pour servir le dashboard
- Monitoring: AsyncLocalStorage pour la corrélation des traces

### 2.2 Structure du projet

Arborescence principale du dépôt :

```
OpenPro.Backend/
├── src/
│   ├── index.ts                 # Point d'entrée Fastify
│   ├── config/
│   │   ├── env.ts              # Variables d'environnement
│   │   └── ai.ts               # Configuration AI SDK
│   ├── types/
│   │   ├── api.ts              # Types partagés
│   │   ├── apiTypes.ts         # Types pour les réponses API OpenPro
│   │   ├── suggestions.ts      # Types pour suggestions IA
│   │   └── traffic.ts          # Types pour le monitoring du trafic
│   ├── services/
│   │   ├── openProClient.ts    # Instance du client OpenPro (avec tracing)
│   │   ├── trafficMonitor.ts   # Service de monitoring du trafic
│   │   ├── correlationContext.ts # Contexte de corrélation (AsyncLocalStorage)
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
│   │       ├── suggestionEngine.ts (avec tracing)
│   │       ├── analysisPrompts.ts
│   │       └── suggestionStorage.ts
│   ├── routes/
│   │   ├── index.ts            # Agrégation des routes
│   │   ├── suppliers.ts        # Routes /api/suppliers/*
│   │   ├── webhooks.ts         # Routes /api/webhooks/*
│   │   ├── suggestions.ts      # Routes /ai/suggestions/*
│   │   ├── traffic.ts          # Routes /api/traffic/* (monitoring)
│   │   └── dashboard.ts        # Route / (interface de monitoring)
│   ├── dashboard/              # Interface React de monitoring
│   │   ├── index.html          # Point d'entrée HTML
│   │   ├── main.tsx            # Initialisation React
│   │   ├── App.tsx             # Composant principal
│   │   ├── types.ts            # Types pour l'interface
│   │   ├── api.ts              # Client API pour le dashboard
│   │   └── components/         # Composants React
│   │       ├── StatsBar.tsx
│   │       ├── FilterBar.tsx
│   │       ├── EventCard.tsx
│   │       ├── EventList.tsx
│   │       └── TraceView.tsx
│   └── utils/
│       └── dateUtils.ts
├── vite.config.dashboard.ts    # Configuration Vite pour le dashboard
├── openpro-api-react/           # Sous-module Git (dépôt externe)
├── docs/
│   └── PRD.md                   # Ce document
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### 2.3 Architecture actuelle

Vue d'ensemble :
- Fastify gère le serveur HTTP et le routage.
- Les routes sont organisées par domaine fonctionnel (suppliers, webhooks, suggestions).
- Les services métier encapsulent la logique de traitement des données OpenPro.
- Le service IA utilise le Vercel AI SDK pour générer des suggestions basées sur l'analyse des réservations.
- Le client OpenPro est instancié une seule fois et réutilisé par tous les services.
- La clé API OpenPro est stockée dans les variables d'environnement et n'est jamais exposée au frontend.

---

## 3. Endpoints API REST

### 3.1 Routes fournisseurs (`/api/suppliers`)

#### 3.1.1 Hébergements
- `GET /api/suppliers/:idFournisseur/accommodations` - Liste des hébergements d'un fournisseur

#### 3.1.2 Tarifs
- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rates` - Récupérer les tarifs (query params `debut`, `fin`)

#### 3.1.3 Stock
- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock` - Récupérer le stock (query params `debut`, `fin`)

#### 3.1.4 Types de tarifs
- `GET /api/suppliers/:idFournisseur/rate-types` - Liste des types de tarifs disponibles

#### 3.1.5 Données complètes
- `GET /api/suppliers/:idFournisseur/supplier-data` - Toutes les données (stock, tarifs, types) (query params `debut`, `fin`)

#### 3.1.6 Mise à jour en bulk
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

### 3.4 Health check

- `GET /health` - Vérification de l'état du serveur

### 3.5 Routes monitoring (`/api/traffic`)

- `GET /api/traffic/events` - Liste des événements de trafic récents
  - Query params : `limit`, `type`, `traceId`, `minDuration`, `hasError`
- `GET /api/traffic/stats` - Statistiques agrégées du trafic
- `GET /api/traffic/trace/:traceId` - Tous les événements d'une trace corrélée

### 3.6 Dashboard

- `GET /` - Interface de monitoring du trafic (redirige vers `/dashboard/index.html`)
- `GET /dashboard/*` - Fichiers statiques du dashboard React

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

Les suggestions sont stockées en mémoire (Map) pour l'instant. En production, migrer vers une base de données.

### 4.5 Configuration AI

- Provider par défaut : OpenAI (configurable via `AI_PROVIDER`)
- Support Cloudflare AI Gateway pour le monitoring et le caching
- Validation des réponses avec schémas Zod

---

## 5. Configuration et variables d'environnement

### 5.1 Variables requises

- `PORT` - Port du serveur backend (défaut: 3001)
- `OPENPRO_BASE_URL` - URL de l'API OpenPro (stub en dev: http://localhost:3000)
- `OPENPRO_API_KEY` - Clé API OpenPro (gardée secrète côté serveur)
- `FRONTEND_URL` - URL du frontend (pour CORS, défaut: http://localhost:4321)

### 5.2 Variables AI

- `AI_PROVIDER` - Provider IA (openai ou anthropic, défaut: openai)
- `OPENAI_API_KEY` - Clé API OpenAI (si AI_PROVIDER=openai)
- `ANTHROPIC_API_KEY` - Clé API Anthropic (si AI_PROVIDER=anthropic)
- `CLOUDFLARE_AI_GATEWAY_URL` - URL optionnelle du Cloudflare AI Gateway

---

## 6. Sécurité

### 6.1 Clé API OpenPro

- Stockée uniquement dans les variables d'environnement côté serveur
- Jamais exposée au frontend
- Non versionnée dans Git (fichier `.env` dans `.gitignore`)

### 6.2 CORS

- Configuration CORS pour autoriser uniquement le frontend configuré
- URL du frontend configurée via `FRONTEND_URL`

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
2. Terminal 2 : Démarrer le backend `cd OpenPro.Backend && npm run dev` (port 3001)
3. Terminal 3 : Démarrer le frontend `cd OpenPro.Admin && npm run dev` (port 4321)

**Note:** En développement dans un monorepo, le stub-server peut être lancé depuis `openpro-api-react/` à la racine. Le backend référence ce même dépôt via son sous-module.

### 7.3 Production

En production, pointer vers l'API réelle :
```ini
OPENPRO_BASE_URL=https://api.open-pro.fr/tarif/multi/v1
OPENPRO_API_KEY=votre_vraie_cle_api
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

Génère les fichiers JavaScript dans `dist/`.

### 8.2 Démarrage

```bash
npm start
```

Démarre le serveur avec Node.js depuis `dist/index.js`.

### 8.3 Variables d'environnement

S'assurer que toutes les variables d'environnement requises sont configurées dans l'environnement de production.

---

## 6. Traffic Monitoring Dashboard

### 6.1 Vue d'ensemble

Le backend intègre un système complet de monitoring du trafic HTTP qui capture automatiquement toutes les requêtes entrantes et sortantes (API OpenPro et appels IA). Une interface web React accessible sur `http://localhost:3001/` permet de visualiser en temps réel le trafic et d'analyser les performances.

### 6.2 Architecture du monitoring

**Composants principaux :**

1. **Traffic Monitor Service** (`trafficMonitor.ts`)
   - Ring buffer en mémoire (1000 événements max)
   - Stockage des événements de trafic avec métadonnées
   - Calcul des statistiques agrégées

2. **Correlation Context** (`correlationContext.ts`)
   - Utilise Node.js `AsyncLocalStorage`
   - Génère et propage un `traceId` unique par requête
   - Permet de corréler les appels parents/enfants

3. **Hooks Fastify** (dans `index.ts`)
   - Hook `onRequest` : génère le traceId et timestamp de début
   - Hook `onResponse` : calcule la durée et enregistre l'événement
   - Capture automatique de toutes les requêtes entrantes

4. **Wrappers pour appels sortants**
   - Client OpenPro wrappé avec Proxy JavaScript
   - Appels IA tracés dans `suggestionEngine.ts`
   - Capture automatique des durées, statuts, et erreurs

### 6.3 Types d'événements capturés

- **`incoming`** : Requêtes HTTP entrantes vers le backend
  - Métadonnées : User-Agent, Origin, durée, status code
  
- **`outgoing-openpro`** : Appels sortants vers l'API OpenPro
  - Métadonnées : idFournisseur, idHebergement, endpoint, durée, status code
  
- **`outgoing-ai`** : Appels vers les API IA (OpenAI/Anthropic)
  - Métadonnées : provider, model, tokens utilisés, durée, status code

### 6.4 Système de corrélation

Chaque requête entrante génère un `traceId` unique propagé automatiquement à tous les appels enfants (OpenPro, IA) grâce à `AsyncLocalStorage`. Cela permet de :

- Visualiser la cascade complète d'une requête
- Identifier les goulots d'étranglement
- Tracer les erreurs à leur origine
- Calculer les durées totales par trace

**Exemple de trace :**
```
📥 POST /ai/suggestions/123/generate (traceId: abc-123)
  ↳ 📤 GET /fournisseur/123/hebergements/456/tarif (450ms)
  ↳ 📤 GET /fournisseur/123/hebergements/456/stock (380ms)
  ↳ 🤖 AI OpenAI/gpt-4 (320ms, 1250 tokens)
Total: 1.2s
```

### 6.5 Interface utilisateur

**Technologie :** React 18 + Vite + TypeScript

**Fonctionnalités :**

1. **Barre de statistiques**
   - Total d'événements
   - Compteurs par type (incoming, OpenPro, AI)
   - Taux d'erreur
   - Durée moyenne
   - Requêtes lentes (>1s)

2. **Filtres**
   - Par type d'événement
   - Erreurs seulement
   - Par traceId (via clic sur événement)

3. **Liste des événements**
   - Affichage en temps réel (polling 2s)
   - Color coding : succès (vert), erreur (rouge), lent (orange)
   - Détails expandables : métadonnées, erreurs, User-Agent, etc.

4. **Vue de trace (modal)**
   - Arbre hiérarchique des événements corrélés
   - Durée totale de la trace
   - Durées individuelles par sous-requête
   - Visualisation des cascades d'appels

5. **Auto-refresh**
   - Mise à jour automatique toutes les 2 secondes (activable/désactivable)
   - Bouton de rafraîchissement manuel

### 6.6 Développement et build

**Développement :**
- Dashboard : `npm run dev:dashboard` (port 5174 avec proxy vers backend)
- Backend : `npm run dev` (port 3001)

**Production :**
- Build : `npm run build` (compile backend + dashboard)
- Le dashboard est servi depuis `dist/dashboard/` par Fastify Static

### 6.7 Limitations actuelles

- Stockage en mémoire uniquement (pas de persistance)
- Maximum 1000 événements dans le ring buffer
- Pas d'authentification pour accéder au dashboard
- Pas d'export des logs (JSON/CSV)

---

## 9. Évolutions futures

### 9.1 Base de données (TBD, voire à ne pas faire)

- Migrer le stockage des suggestions vers une base de données (PostgreSQL, MongoDB, etc.)
- Stocker l'historique des réservations pour améliorer l'analyse IA

### 9.2 Cache

- Implémenter un cache pour les données fréquemment demandées (hébergements, types de tarifs)
- Réduire les appels à l'API OpenPro

### 9.3 Authentification

- Ajouter un système d'authentification pour sécuriser l'API backend
- Tokens JWT ou API keys pour le frontend

### 9.4 Monitoring

✅ **Implémenté** : Dashboard de monitoring du trafic HTTP avec interface React en temps réel

**Améliorations futures :**
- Persistance des événements en base de données
- Export des logs (JSON, CSV)
- Authentification pour l'accès au dashboard
- WebSocket pour streaming en temps réel (au lieu de polling)
- Alertes configurables (emails, Slack, etc.)
- Intégration avec Prometheus/Grafana
- Logging structuré avec Winston ou Pino
- Métriques avancées et graphiques de tendances

---

## 10. Références

- Documentation API Open Pro : https://documentation.open-system.fr/api-openpro/tarif/multi/v1/
- Vercel AI SDK : https://ai-sdk.dev/
- Fastify : https://www.fastify.io/
- Cloudflare AI Gateway : https://developers.cloudflare.com/ai-gateway/

