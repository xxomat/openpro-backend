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
│   │   └── suggestions.ts      # Types pour suggestions IA
│   ├── services/
│   │   ├── openProClient.ts    # Instance du client OpenPro
│   │   ├── openpro/            # Services métier OpenPro
│   │   │   ├── accommodationService.ts
│   │   │   ├── rateService.ts
│   │   │   ├── rateTypeService.ts
│   │   │   ├── stockService.ts
│   │   │   ├── supplierDataService.ts
│   │   │   └── utils/
│   │   │       └── rateUtils.ts
│   │   └── ai/                 # Services IA
│   │       ├── suggestionEngine.ts
│   │       ├── analysisPrompts.ts
│   │       └── suggestionStorage.ts
│   ├── routes/
│   │   ├── index.ts            # Agrégation des routes
│   │   ├── suppliers.ts        # Routes /api/suppliers/*
│   │   ├── webhooks.ts         # Routes /api/webhooks/*
│   │   └── suggestions.ts      # Routes /api/suggestions/*
│   └── utils/
│       └── dateUtils.ts
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

### 3.2 Routes webhooks (`/api/webhooks`)

- `POST /api/webhooks/openpro/booking` - Réception des webhooks OpenPro pour nouvelles réservations
  - Traite la réservation
  - Charge les données contextuelles (rates, stock, bookings récents)
  - Déclenche l'analyse IA de façon asynchrone
  - Retourne rapidement au webhook

### 3.3 Routes suggestions (`/api/suggestions`)

- `GET /api/suggestions/:idFournisseur` - Liste des suggestions (filtre optionnel `?status=pending`)
- `PATCH /api/suggestions/:id` - Mettre à jour le statut d'une suggestion (applied/rejected)
- `POST /api/suggestions/:idFournisseur/generate` - Déclencher manuellement une analyse

### 3.4 Health check

- `GET /health` - Vérification de l'état du serveur

---

## 4. Service de suggestions IA

### 4.1 Fonctionnement

Le service de suggestions utilise le Vercel AI SDK pour analyser les réservations récentes et générer des suggestions d'ajustements de tarifs et durées minimales.

**Déclenchement automatique :**
- Lors de la réception d'un webhook de nouvelle réservation
- Analyse asynchrone pour ne pas bloquer le webhook

**Déclenchement manuel :**
- Via l'endpoint `POST /api/suggestions/:idFournisseur/generate`

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

- Logging structuré avec Winston ou Pino
- Métriques avec Prometheus
- Alertes sur les erreurs critiques

---

## 10. Références

- Documentation API Open Pro : https://documentation.open-system.fr/api-openpro/tarif/multi/v1/
- Vercel AI SDK : https://ai-sdk.dev/
- Fastify : https://www.fastify.io/
- Cloudflare AI Gateway : https://developers.cloudflare.com/ai-gateway/

