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

### 1.4 Paradigme de données - Backend DB comme source de vérité

**Changement majeur :** OpenPro devient un système satellite utilisé uniquement comme source de réservations et comme destination d'export pour la diffusion des hébergements sur les sites institutionnels.

**Source de vérité :** La base de données D1 du backend est désormais la source de vérité pour :
- Les hébergements disponibles (liste, noms, identifiants externes)
- Les plans tarifaires (types de tarifs, descriptions, ordre)
- Les liaisons plans tarifaires/hébergements
- Les données de tarifs (prix, durées min/max, arrivée/départ autorisés) par date et plan tarifaire
- Le stock par date
- Toutes les réservations (Directes, OpenPro, plateformes externes)

**Rôle d'OpenPro :**
- **Source de réservations :** OpenPro envoie des notifications de réservations via webhook GET
- **Destination d'export :** Les données d'hébergements, tarifs et stock sont exportées vers OpenPro au démarrage du backend et après chaque modification
- **Diffusion :** OpenPro utilise les données exportées pour mettre en ligne les hébergements sur les sites institutionnels

**Synchronisation :**
- **Au démarrage :** 
  - Synchronisation des réservations OpenPro (import depuis OpenPro vers DB)
  - Export des données d'hébergements vers OpenPro
- **Après modifications :** Export automatique des données modifiées vers OpenPro
- **Webhooks :** Réception en temps réel des nouvelles réservations OpenPro
- **iCal :** Synchronisation bidirectionnelle avec les plateformes externes (Booking.com, etc.)

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

### 2.4 Configuration du fournisseur

Le système gère un seul fournisseur, configuré via la variable d'environnement `SUPPLIER_ID`.

**Configuration :**
- **Variable d'environnement :** `SUPPLIER_ID` (string, convertie en number)
- **Fichier de configuration :** `wrangler.toml` (développement) ou secrets Cloudflare (production)
- **Fonction helper :** `getSupplierId(env)` dans `src/config/supplier.ts` pour récupérer et valider la valeur
- **Validation :** La fonction `getSupplierId()` valide que la variable est définie et est un nombre valide

**Validation dans les routes :** Toutes les routes qui acceptent un `idFournisseur` en paramètre valident que celui-ci correspond à `SUPPLIER_ID`. Les requêtes avec un `idFournisseur` différent sont rejetées avec une erreur 400.

**Avantages :**
- Configuration flexible via variables d'environnement
- Pas besoin de modifier le code pour changer le fournisseur
- Sécurité renforcée (pas de manipulation d'ID)
- Performance améliorée (pas de requêtes multi-fournisseurs)
- Compatible avec les secrets Cloudflare pour la production

### 2.2 Structure du projet

Arborescence principale du dépôt :

```
OpenPro.Backend/
├── src/
│   ├── index.ts                 # Point d'entrée Cloudflare Worker
│   ├── config/
│   │   ├── ai.ts               # Configuration AI SDK
│   │   └── supplier.ts         # Configuration du fournisseur unique
│   ├── types/
│   │   ├── api.ts              # Types partagés
│   │   ├── apiTypes.ts         # Types pour les réponses API OpenPro
│   │   └── suggestions.ts      # Types pour suggestions IA
│   ├── services/
│   │   ├── openProClient.ts    # Factory du client OpenPro
│   │   ├── openpro/            # Services métier OpenPro
│   │   │   ├── accommodationService.ts
│   │   │   ├── accommodationDataService.ts
│   │   │   ├── rateTypeDbService.ts
│   │   │   ├── openProBookingService.ts
│   │   │   ├── startupSyncService.ts
│   │   │   ├── rateService.ts
│   │   │   ├── rateTypeService.ts
│   │   │   ├── stockService.ts
│   │   │   ├── localBookingService.ts
│   │   │   ├── supplierDataService.ts
│   │   │   ├── bulkUpdateService.ts  # Service de transformation bulk
│   │   │   └── utils/
│   │   │       └── rateUtils.ts
│   │   └── ical/               # Services iCal
│   │       ├── icalParser.ts
│   │       ├── icalGenerator.ts
│   │       └── icalSyncService.ts
│   │   └── ai/                 # Services IA
│   │       ├── suggestionEngine.ts
│   │       ├── analysisPrompts.ts
│   │       └── suggestionStorage.ts  # Stockage D1
│   ├── routes/
│   │   ├── suppliers.ts        # Routes /api/suppliers/*
│   │   ├── webhooks.ts         # Routes /api/webhooks/*
│   │   ├── suggestions.ts      # Routes /ai/suggestions/*
│   │   ├── accommodations.ts  # Routes /api/accommodations/*
│   │   ├── ical.ts             # Routes /api/ical-* et /api/ical/*
│   │   └── cron.ts             # Routes /cron/*
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

#### 3.1.0 Hébergements (nouveau)

Les hébergements sont désormais gérés directement dans la DB backend et peuvent être créés/modifiés via l'interface admin.

**Routes :**
- `GET /api/accommodations` - Liste tous les hébergements
- `POST /api/accommodations` - Créer un hébergement
  - **Corps :**
    ```typescript
    {
      nom: string;
      ids: {
        Directe: string;        // OBLIGATOIRE - ID interne dans la DB
        OpenPro: string;        // OBLIGATOIRE - ID OpenPro
        'Booking.com'?: string; // Optionnel - ID Booking.com
        Xotelia?: string;       // Optionnel - ID Xotelia
      }
    }
    ```
  - **Validation :** L'ID `Directe` et l'ID `OpenPro` sont obligatoires et doivent être fournis par l'admin
- `PUT /api/accommodations/:id` - Modifier un hébergement
- `DELETE /api/accommodations/:id` - Supprimer un hébergement
- `POST /api/accommodations/:id/external-ids` - Ajouter/modifier un identifiant externe
- `GET /api/accommodations/:id/external-ids` - Récupérer les identifiants externes

**Structure de données :**
- Chaque hébergement a un ID interne (string) qui correspond à l'ID `Directe`
- Les identifiants externes (OpenPro, Booking.com, etc.) sont stockés dans la table `accommodation_external_ids`
- L'ID OpenPro est utilisé pour l'export des données vers OpenPro

**Vérification au démarrage :**
- Le backend vérifie que tous les hébergements en DB avec un ID OpenPro existent dans OpenPro
- Si un hébergement DB n'existe pas dans OpenPro : un avertissement est enregistré pour l'admin
- Note : L'API OpenPro ne permet pas de créer un hébergement, donc on ne peut que vérifier et avertir (voir section 3.9)

#### 3.1.1 Hébergements (legacy)
- `GET /api/suppliers/:idFournisseur/accommodations` - Liste des hébergements d'un fournisseur (depuis OpenPro, conservé pour compatibilité)

#### 3.1.2 Tarifs (modifié)

- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rates` - Récupérer les tarifs (query params `debut`, `fin`)
  - **Changement :** Charge maintenant depuis la DB backend uniquement (plus depuis OpenPro)
  - Les données sont stockées dans `accommodation_data` et `accommodation_stock`

#### 3.1.3 Stock (modifié)

- `GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock` - Récupérer le stock (query params `debut`, `fin`)
  - **Changement :** Charge maintenant depuis la DB backend uniquement
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
  - **Changement :** 
    1. Sauvegarde d'abord en DB via `saveAccommodationStock()`
    2. Export ensuite vers OpenPro via `openProClient.updateStock()`
  - **Validation :** `idFournisseur` doit correspondre à `SUPPLIER_ID`

#### 3.1.4 Types de tarifs (modifié)

- `GET /api/suppliers/:idFournisseur/rate-types` - Liste des types de tarifs
  - **Changement :** Charge depuis la DB backend (table `rate_types`)
- `POST /api/suppliers/:idFournisseur/rate-types` - Créer un type de tarif
  - **Changement :**
    1. Sauvegarde d'abord en DB via `saveRateType()`
    2. Export ensuite vers OpenPro automatiquement via `openProClient.createRateType()`
- `PUT /api/suppliers/:idFournisseur/rate-types/:idTypeTarif` - Modifier un type de tarif
  - **Changement :**
    1. Met à jour dans OpenPro
    2. Met à jour en DB
- `DELETE /api/suppliers/:idFournisseur/rate-types/:idTypeTarif` - Supprimer un type de tarif
  - **Changement :**
    1. Supprime dans OpenPro
    2. Supprime en DB

**Synchronisation au démarrage :**
- Le backend charge tous les plans tarifaires depuis la DB
- Le backend fetche tous les plans tarifaires depuis OpenPro
- Pour chaque plan tarifaire présent en DB mais absent d'OpenPro, le backend le crée automatiquement dans OpenPro
- Le backend synchronise également les liens plans tarifaires/hébergements (voir section 3.9)
- Garantit que OpenPro est synchronisé avec la DB backend au démarrage

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

#### 3.1.7 Mise à jour en bulk (modifié)

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
  - **Changement :**
    1. Sauvegarde chaque date en DB via `saveAccommodationData()`
    2. Transforme et exporte vers OpenPro via `openProClient.setRates()`
    3. Appelle `exportAccommodationDataToOpenPro()` pour synchronisation complète
  - **Réponse** :
    - `200 OK` en cas de succès.
    - `400 Bad Request` si les données sont invalides.
    - `500 Internal Server Error` en cas d'erreur lors de l'appel à l'API OpenPro.

#### 3.1.8 Réservations (nouveau)

- `GET /api/suppliers/:idFournisseur/local-bookings` - Liste toutes les réservations
  - **Changement :** Retourne toutes les réservations (toutes plateformes) depuis la DB
  - **Champs inclus :** `reservation_platform`, `booking_status`
  - **Validation :** `idFournisseur` doit correspondre à `SUPPLIER_ID`

### 3.2 Routes webhooks (`/api/webhooks`)

#### 3.2.1 Webhook OpenPro - Format GET (nouveau format principal)

- `GET /api/webhooks/openpro/booking?idFournisseur=X&idDossier=Y` - Réception des webhooks OpenPro
  - **Paramètres query :**
    - `idFournisseur` : ID du fournisseur (doit correspondre à `SUPPLIER_ID`)
    - `idDossier` : ID du dossier de réservation OpenPro
  - **Comportement :**
    1. Valide que `idFournisseur === SUPPLIER_ID`
    2. Récupère le dossier depuis OpenPro via `getBooking()`
    3. Mappe le dossier vers le format DB via `mapOpenProDossierToBooking()`
    4. Vérifie si la réservation existe déjà en DB (par `reference = idDossier` et `reservation_platform = 'OpenPro'`)
    5. Si existe et `booking_status !== 'Cancelled'` : met à jour
    6. Si existe et `booking_status === 'Cancelled'` : conserve le statut (ne pas réactiver)
    7. Si n'existe pas : insère avec `booking_status = 'Confirmed'`
  - **Réponse :** `{ received: true, message: 'Booking processed' }`

#### 3.7 Réservations multi-plateformes

Le système gère trois sources de réservations, toutes stockées dans la table `local_bookings` :

**1. Réservations Directes** (`reservation_platform = 'Directe'`)
- Créées via l'interface admin
- Stockées directement en DB avec `booking_status = 'Quote'` par défaut
- Peuvent être synchronisées vers OpenPro (fonctionnalité future)

**2. Réservations OpenPro** (`reservation_platform = 'OpenPro'`)
- Reçues via webhook GET : `/api/webhooks/openpro/booking?idFournisseur=X&idDossier=Y`
- Synchronisées au démarrage du backend
- Stockées avec `booking_status = 'Confirmed'` par défaut
- Utilisent `idDossier` comme `reference`

**3. Réservations plateformes externes** (`reservation_platform = 'Booking.com'`, etc.)
- Synchronisées via iCal (cron toutes les 15 minutes)
- Import depuis les URLs iCal configurées dans `ical_sync_config`
- Utilisent l'UID iCal comme `reference`

**Champ `reservation_platform` :**
- Enum : `'Directe' | 'OpenPro' | 'Booking.com' | 'Xotelia' | 'Unknown'`
- Permet d'identifier l'origine de chaque réservation
- Utilisé pour filtrer les réservations dans les exports iCal

**Champ `booking_status` :**
- Enum : `'Quote' | 'Confirmed' | 'Paid' | 'Cancelled' | 'Past'`
- Remplace l'ancien champ `is_cancelled`
- Gestion automatique :
  - `'Past'` : Mise à jour automatique pour les réservations dont la date de départ est passée
  - `'Cancelled'` : Conservé lors de la synchronisation OpenPro si déjà annulée en DB

#### 3.8 Synchronisation iCal bidirectionnelle

Le système gère la synchronisation bidirectionnelle avec les plateformes externes (Booking.com, etc.) via le format iCal.

**Configuration iCal :**
- `GET /api/ical-config` - Liste toutes les configurations iCal
- `POST /api/ical-config` - Créer une configuration iCal
  - **Corps :**
    ```typescript
    {
      idHebergement: string;
      platform: PlateformeReservation;  // Enum: 'Booking.com', 'Directe', 'OpenPro', 'Xotelia', 'Unknown'
      importUrl?: string;                // URL pour importer les réservations
      exportUrl?: string;                 // URL générée par le backend pour exporter
    }
    ```
- `DELETE /api/ical-config/:id` - Supprimer une configuration

**Export iCal :**
- `GET /api/ical/export/:idHebergement/:platform` - Génère un flux iCal d'export
  - **Paramètres :**
    - `idHebergement` : ID de l'hébergement (string)
    - `platform` : Valeur de l'enum `PlateformeReservation` (ex: 'Booking.com', 'Xotelia')
  - **Filtrage :** Exclut automatiquement :
    - Les réservations de la plateforme cible (ex: pas de réservations Booking.com dans l'export Booking.com)
    - Les réservations avec `booking_status = 'Cancelled'`
  - **Format :** iCalendar standard (RFC 5545)
  - **Utilisation :** L'URL d'export est visible dans l'admin pour copier/coller dans la plateforme externe

**Import iCal :**
- Exécuté automatiquement par le cron job toutes les 15 minutes
- Lit les URLs d'import configurées
- Parse les événements iCal
- Compare avec les réservations existantes en DB
- Insère les nouvelles réservations
- Met à jour les réservations modifiées
- Marque comme annulées les réservations supprimées du flux

**Cron job :**
- Route : `GET /cron/sync-ical-imports`
- Fréquence : Toutes les 15 minutes (configuré dans `wrangler.toml`)
- Déclenchement : Automatique via Cloudflare Cron Triggers

#### 3.9 Synchronisation au démarrage

Lors du démarrage du backend, plusieurs opérations sont exécutées dans un ordre spécifique pour garantir la cohérence :

**Ordre d'exécution :**
1. Vérification des hébergements (prérequis pour les étapes suivantes)
2. Synchronisation des plans tarifaires (prérequis pour les liens)
3. Synchronisation des liens plans tarifaires/hébergements (nécessite hébergements et plans tarifaires)
4. Synchronisation des réservations OpenPro (peut être exécutée en parallèle)
5. Export des données d'hébergements vers OpenPro (en dernier, après que tout soit synchronisé)

**1. Vérification des hébergements :**
- Fonction : `verifyAccommodationsOnStartup()` ✅ Implémentée
- Comportement :
  1. Charge tous les hébergements depuis la DB (table `accommodations`)
  2. Fetche tous les hébergements depuis OpenPro via `listAccommodations(SUPPLIER_ID)`
  3. Pour chaque hébergement en DB avec un ID OpenPro :
     - Vérifie qu'il existe dans OpenPro
     - Si absent dans OpenPro : enregistre un avertissement pour l'admin
  4. **Note importante :** L'API OpenPro ne permet pas de créer un hébergement, donc on ne peut que vérifier et avertir
  5. Les avertissements sont loggés et peuvent être exposés via l'endpoint `GET /api/startup-warnings`

**2. Synchronisation des plans tarifaires :**
- Fonction : `syncRateTypesOnStartup()` ✅ Implémentée
- Comportement :
  1. Charge tous les plans tarifaires depuis la DB (table `rate_types`, y compris ceux sans ID OpenPro)
  2. Fetche tous les plans tarifaires depuis OpenPro via `listRateTypes(SUPPLIER_ID)`
  3. Pour chaque plan tarifaire présent en DB mais absent d'OpenPro (sans `id_type_tarif`) :
     - Crée automatiquement dans OpenPro via `openProClient.createRateType()`
     - Met à jour `id_type_tarif` dans la DB avec l'ID retourné par OpenPro
  4. En cas d'échec de création : enregistre un avertissement
  5. Garantit que OpenPro est synchronisé avec la DB backend au démarrage

**3. Synchronisation des liens plans tarifaires/hébergements :**
- Fonction : `syncRateTypeLinksOnStartup()` ✅ Implémentée
- Comportement :
  1. Charge tous les hébergements avec ID OpenPro depuis la DB
  2. Pour chaque hébergement avec un ID OpenPro :
     - Charge les liens depuis la DB via `loadAccommodationRateTypeLinks()`
     - Fetche les liens depuis OpenPro via `listAccommodationRateTypeLinks()`
     - Compare avec les liens en DB
     - Pour chaque lien présent en DB mais absent dans OpenPro :
       - Crée automatiquement le lien dans OpenPro via `linkRateTypeToAccommodation()`
     - En cas d'échec : enregistre un avertissement
  3. **Note :** Les liens présents dans OpenPro mais absents en DB ne sont pas supprimés automatiquement (laissés tel quel pour éviter la perte de données)
  4. Force la création des liens manquants dans OpenPro pour garantir la cohérence DB → OpenPro

**4. Synchronisation des réservations OpenPro :**
- Fonction : `syncOpenProBookingsOnStartup()`
- Comportement :
  1. Récupère toutes les réservations OpenPro via `listBookings(SUPPLIER_ID)`
  2. Pour chaque réservation OpenPro :
     - Si absente en DB : insère avec `booking_status = 'Confirmed'`
     - Si présente et `booking_status = 'Cancelled'` : conserve (ne pas réactiver)
     - Si présente et dates différentes : conserve les dates de la DB
     - Sinon : met à jour les autres champs
  3. Pour chaque réservation en DB avec `reservation_platform = 'OpenPro'` :
     - Si absente dans OpenPro et `booking_status !== 'Cancelled'` : marque comme `booking_status = 'Cancelled'`
  4. Met à jour automatiquement `booking_status = 'Past'` pour les réservations dont la date de départ est passée

**5. Export des données d'hébergements vers OpenPro :**
- Fonction : `exportAccommodationDataOnStartup()`
- Comportement :
  1. Charge tous les hébergements depuis la DB
  2. Pour chaque hébergement avec un ID OpenPro :
     - Charge les données de tarifs et stock depuis la DB
     - Transforme au format OpenPro
     - Exporte via `openProClient.setRates()` et `openProClient.updateStock()`

**Exécution :**
- Utilise `executionCtx.waitUntil()` pour ne pas bloquer le démarrage
- Les erreurs sont loggées mais n'empêchent pas le démarrage du backend

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

#### 3.4.2 Synchronisation iCal (nouveau)

- `GET /cron/sync-ical-imports` - Synchronisation automatique des imports iCal
  - **Déclenchement :** Automatique via Cloudflare Cron (toutes les 15 minutes)
  - **Fréquence :** `*/15 * * * *` (configuré dans `wrangler.toml`)
  - **Comportement :**
    1. Charge toutes les configurations iCal actives (avec `import_url`)
    2. Pour chaque configuration :
       - Télécharge le flux iCal depuis `import_url`
       - Parse les événements
       - Compare avec les réservations existantes en DB (par `reference` et `reservation_platform`)
       - Insère les nouvelles réservations
       - Met à jour les réservations modifiées
       - Marque comme annulées les réservations supprimées du flux
  - **Logs :** Enregistre le nombre de réservations importées/mises à jour

#### 3.4.3 Gestion des réservations obsolètes

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
- `SUPPLIER_ID` - ID du fournisseur unique (string, converti en number, défaut: "47186" pour les tests)

**Secrets Cloudflare** (sensibles, définis via `wrangler secret put`) :
- `OPENPRO_API_KEY` - Clé API OpenPro (gardée secrète côté serveur)
- `OPENAI_API_KEY` - Clé API OpenAI (si AI_PROVIDER=openai)
- `ANTHROPIC_API_KEY` - Clé API Anthropic (si AI_PROVIDER=anthropic)
- `CLOUDFLARE_AI_GATEWAY_URL` - URL optionnelle du Cloudflare AI Gateway

**Note importante :** `SUPPLIER_ID` peut être configuré comme variable d'environnement (non sensible) dans `wrangler.toml` pour le développement, ou comme secret Cloudflare en production si vous souhaitez le garder privé. La fonction `getSupplierId(env)` dans `src/config/supplier.ts` valide que la variable est définie et est un nombre valide.

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

### 5.3 Schéma de base de données D1

**Nouvelles tables :**

1. **`accommodations`** - Hébergements
   - `id` (TEXT PRIMARY KEY) - ID interne (correspond à l'ID Directe)
   - `nom` (TEXT NOT NULL) - Nom de l'hébergement
   - `id_openpro` (INTEGER) - ID OpenPro (optionnel)
   - `date_creation`, `date_modification`

2. **`accommodation_external_ids`** - Identifiants externes
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `platform` (TEXT) - Plateforme ('Booking.com', 'Xotelia', etc.)
   - `external_id` (TEXT) - ID externe
   - Index unique sur `(id_hebergement, platform)`

3. **`ical_sync_config`** - Configuration iCal
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `platform` (TEXT) - Plateforme
   - `import_url` (TEXT) - URL pour importer
   - `export_url` (TEXT) - URL générée pour exporter
   - Index unique sur `(id_hebergement, platform)`

4. **`rate_types`** - Plans tarifaires
   - `id_type_tarif` (INTEGER NOT NULL) - ID OpenPro
   - `libelle` (TEXT) - JSON multilingue
   - `description` (TEXT) - JSON multilingue
   - `ordre` (INTEGER)
   - Index unique sur `id_type_tarif`

5. **`accommodation_rate_type_links`** - Liaisons hébergements/plans tarifaires
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `id_type_tarif` (INTEGER) - Référence à rate_types.id_type_tarif
   - Index unique sur `(id_hebergement, id_type_tarif)`

6. **`accommodation_data`** - Données de tarifs par date
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `id_type_tarif` (INTEGER) - Référence à rate_types.id_type_tarif
   - `date` (TEXT) - Date (YYYY-MM-DD)
   - `prix_nuitee` (REAL) - Prix à la nuitée
   - `arrivee_autorisee` (BOOLEAN) - Arrivée autorisée
   - `depart_autorise` (BOOLEAN) - Départ autorisé
   - `duree_minimale` (INTEGER) - Durée minimale
   - `duree_maximale` (INTEGER) - Durée maximale
   - Index unique sur `(id_hebergement, id_type_tarif, date)`

7. **`accommodation_stock`** - Stock par date
   - `id_hebergement` (TEXT) - Référence à accommodations.id
   - `date` (TEXT) - Date (YYYY-MM-DD)
   - `stock` (INTEGER) - Stock disponible
   - Index unique sur `(id_hebergement, date)`

**Modifications à `local_bookings` :**
- Ajout `reservation_platform` (TEXT NOT NULL DEFAULT 'Directe') - Plateforme d'origine
- Ajout `booking_status` (TEXT NOT NULL DEFAULT 'Quote') - État de la réservation
- Modification `id_hebergement` (TEXT) - Référence à accommodations.id
- Le champ `reference` existant est utilisé pour les identifiants externes (idDossier OpenPro, UID iCal)
- Index sur `reservation_platform`, `booking_status`, et `(reference, reservation_platform)`

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

