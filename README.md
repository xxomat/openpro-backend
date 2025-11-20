# OpenPro.Backend

Backend API Node.js/TypeScript pour l'application OpenPro.Admin. Gère tous les appels à l'API OpenPro et expose une API REST simplifiée pour le frontend.

## Stack

- **Fastify** - Framework web Node.js
- **TypeScript** - Langage de programmation
- **Vercel AI SDK** - SDK pour l'intégration IA (OpenAI, Anthropic)
- **Zod** - Validation de schémas
- **openpro-api-react** - Sous-module Git pour le client API OpenPro

## Prérequis

- Node.js LTS (v20 ou supérieur)
- npm
- Sous-module Git `openpro-api-react` initialisé

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/xxomat/openpro-backend.git OpenPro.Backend
cd OpenPro.Backend
```

### 2. Configurer le sous-module openpro-api-react

Le backend nécessite le module `openpro-api-react` pour accéder au client API OpenPro et au stub server.

**Sous Windows (PowerShell) :**
```powershell
# Depuis le répertoire parent contenant openpro-api-react
cd OpenPro.Backend
New-Item -ItemType Junction -Path openpro-api-react -Target ..\openpro-api-react
```

**Sous Linux/macOS :**
```bash
cd OpenPro.Backend
ln -s ../openpro-api-react openpro-api-react
```

**Alternative - Sous-module Git :**
Si `openpro-api-react` n'est pas encore cloné localement :
```bash
git submodule update --init --recursive
```

### 3. Installer les dépendances

```bash
npm install
```

### 4. Configurer les variables d'environnement

Copier `.env.example` vers `.env` :

```bash
cp .env.example .env
```

Modifier `.env` avec vos valeurs :

```ini
# Port du serveur backend
PORT=3001

# API OpenPro (utiliser stub en dev, prod en production)
OPENPRO_BASE_URL=http://localhost:3000
OPENPRO_API_KEY=fake-key-for-testing

# Frontend URL (pour CORS)
FRONTEND_URL=http://localhost:4321

# AI Provider
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## Développement

### Workflow complet (3 terminaux)

Le développement nécessite de lancer 3 serveurs dans l'ordre :

**Terminal 1 : Stub server** (depuis le dépôt openpro-api-react)
```bash
cd ../openpro-api-react
npm install  # Si pas encore fait
npm run stub
```
Le stub écoute sur http://localhost:3000

**Terminal 2 : Backend** (depuis le dépôt OpenPro.Backend)
```bash
cd ../OpenPro.Backend
npm install  # Si pas encore fait
npm run dev
```
Le backend écoute sur http://localhost:3001

**Terminal 3 : Frontend** (depuis le dépôt OpenPro.Admin)
```bash
cd ../OpenPro.Admin
npm install  # Si pas encore fait
npm run dev
```
Le frontend écoute sur http://localhost:4321

### Structure des dépôts

Le projet utilise 3 dépôts Git séparés :

```
Repositories/
├── openpro-api-react/           # Client API + Stub server
│   ├── stub-server/
│   │   ├── server.js
│   │   └── stub-data.json
│   └── src/client/
│
├── OpenPro.Backend/             # Backend Node.js/Fastify
│   ├── openpro-api-react/  →   # Lien/Junction vers ../openpro-api-react
│   └── src/
│
└── OpenPro.Admin/               # Frontend Astro/React
    └── src/
```

### Scripts disponibles

- `npm run dev` - Démarre le serveur en mode développement avec hot-reload
- `npm run dev:with-stub` - Vérifie que le stub server tourne avant de démarrer
- `npm run build` - Compile TypeScript vers JavaScript
- `npm start` - Démarre le serveur en production depuis `dist/`

## Structure du projet

```
OpenPro.Backend/
├── src/
│   ├── index.ts                 # Point d'entrée Fastify
│   ├── config/                  # Configuration
│   ├── types/                   # Types TypeScript
│   ├── services/                 # Services métier
│   │   ├── openpro/            # Services OpenPro
│   │   └── ai/                 # Services IA
│   ├── routes/                  # Routes Fastify
│   └── utils/                   # Utilitaires
├── openpro-api-react/           # Sous-module Git
├── docs/                        # Documentation
└── package.json
```

## Endpoints API

### Fournisseurs

- `GET /api/suppliers/:idFournisseur/accommodations` - Liste des hébergements
- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rates` - Tarifs
- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock` - Stock
- `GET /api/suppliers/:idFournisseur/rate-types` - Types de tarifs
- `GET /api/suppliers/:idFournisseur/supplier-data` - Toutes les données

### Webhooks

- `POST /api/webhooks/openpro/booking` - Réception des webhooks OpenPro

### Suggestions IA

- `GET /api/suggestions/:idFournisseur` - Liste des suggestions
- `PATCH /api/suggestions/:id` - Mettre à jour le statut d'une suggestion
- `POST /api/suggestions/:idFournisseur/generate` - Générer des suggestions

### Health check

- `GET /health` - Vérification de l'état du serveur

## Configuration

### Variables d'environnement

Voir `.env.example` pour la liste complète des variables.

**Variables requises :**
- `OPENPRO_BASE_URL` - URL de l'API OpenPro (stub en dev: http://localhost:3000)
- `OPENPRO_API_KEY` - Clé API OpenPro

**Variables optionnelles :**
- `PORT` - Port du serveur (défaut: 3001)
- `FRONTEND_URL` - URL du frontend pour CORS (défaut: http://localhost:4321)
- `AI_PROVIDER` - Provider IA (openai ou anthropic, défaut: openai)
- `CLOUDFLARE_AI_GATEWAY_URL` - URL optionnelle du Cloudflare AI Gateway

## Service de suggestions IA

Le backend inclut un service de suggestions utilisant le Vercel AI SDK pour analyser les réservations et générer des suggestions d'ajustements de tarifs.

**Déclenchement automatique :**
- Lors de la réception d'un webhook de nouvelle réservation

**Déclenchement manuel :**
- Via `POST /api/suggestions/:idFournisseur/generate`

## Production

### Build

```bash
npm run build
```

### Démarrage

```bash
npm start
```

### Variables d'environnement

S'assurer que toutes les variables d'environnement sont configurées dans l'environnement de production :

```ini
OPENPRO_BASE_URL=https://api.open-pro.fr/tarif/multi/v1
OPENPRO_API_KEY=votre_vraie_cle_api
```

## Tests

Le backend utilise le stub server (du module `openpro-api-react`) pour les tests en développement. 

### Démarrer le stub server

```bash
cd ../openpro-api-react
npm run stub
```

Le stub server écoute sur http://localhost:3000 et simule l'API OpenPro avec des données de test depuis `stub-data.json`.

**Note :** Le stub-server et ses données (`stub-data.json`) sont uniquement dans le dépôt `openpro-api-react`, pas dans le backend.

## Documentation

- **PRD** : `docs/PRD.md`
- **Règles de codage** : `.cursor/rules/openpro-backend.md`

## Références

- [Documentation API Open Pro](https://documentation.open-system.fr/api-openpro/tarif/multi/v1/)
- [Vercel AI SDK](https://ai-sdk.dev/)
- [Fastify](https://www.fastify.io/)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
