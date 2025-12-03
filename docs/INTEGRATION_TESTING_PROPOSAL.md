# Proposition de tests d'intégration pour la synchronisation au démarrage

## Objectif

Créer des tests d'intégration qui vérifient le comportement complet de la synchronisation au démarrage avec une vraie base de données D1 locale et un serveur stub OpenPro.

## Architecture proposée

### 1. Infrastructure de test

#### 1.1 Base de données D1 locale
- Utiliser `d1TestHelper.ts` existant qui accède à la DB SQLite locale créée par `wrangler dev`
- Avantage : Utilise la même structure que l'environnement de développement
- Prérequis : Exécuter `npm run d1:migrate:local` ou démarrer `wrangler dev` au moins une fois

#### 1.2 Serveur stub OpenPro
- Utiliser le serveur stub existant dans `openpro-api-react/stub-server/`
- Avantage : Contrôle total sur les réponses API
- Prérequis : Démarrer le serveur stub avec `npm run stub` (dans `openpro-api-react/`)

### 2. Structure des tests

#### 2.1 Fichier de test principal
**Fichier :** `src/services/openpro/__tests__/startupSyncService.integration.spec.ts`

#### 2.2 Helper pour la configuration
**Fichier :** `src/services/openpro/__tests__/integration/startupSyncTestHelper.ts`

Fonctions helper proposées :
- `setupTestDatabase()` : Nettoie et initialise la DB avec des données de test
- `setupStubServer()` : Vérifie que le serveur stub est accessible
- `createTestAccommodation()` : Crée un hébergement de test
- `createTestRateType()` : Crée un plan tarifaire de test
- `cleanupTestData()` : Nettoie les données de test après chaque test

### 3. Scénarios de test proposés

#### 3.1 Test de `verifyAccommodationsOnStartup()`

**Scénario 1 : Hébergement présent en DB et dans OpenPro**
```typescript
it('should not add warning when accommodation exists in both DB and OpenPro', async () => {
  // 1. Créer un hébergement en DB avec ID OpenPro
  // 2. Configurer le stub pour retourner cet hébergement
  // 3. Exécuter verifyAccommodationsOnStartup()
  // 4. Vérifier qu'aucun avertissement n'est créé
});
```

**Scénario 2 : Hébergement présent en DB mais absent dans OpenPro**
```typescript
it('should add warning when accommodation exists in DB but not in OpenPro', async () => {
  // 1. Créer un hébergement en DB avec ID OpenPro
  // 2. Configurer le stub pour ne pas retourner cet hébergement
  // 3. Exécuter verifyAccommodationsOnStartup()
  // 4. Vérifier qu'un avertissement est créé
});
```

#### 3.2 Test de `syncRateTypesOnStartup()`

**Scénario 1 : Plan tarifaire sans ID OpenPro créé dans OpenPro**
```typescript
it('should create rate type in OpenPro and update DB with OpenPro ID', async () => {
  // 1. Créer un plan tarifaire en DB sans id_type_tarif (NULL)
  // 2. Configurer le stub pour accepter la création et retourner un ID
  // 3. Exécuter syncRateTypesOnStartup()
  // 4. Vérifier que :
  //    - createRateType a été appelé sur le stub
  //    - id_type_tarif a été mis à jour en DB
});
```

**Scénario 2 : Plan tarifaire avec ID OpenPro déjà synchronisé**
```typescript
it('should not create rate type when already synchronized', async () => {
  // 1. Créer un plan tarifaire en DB avec id_type_tarif
  // 2. Configurer le stub pour retourner ce plan tarifaire
  // 3. Exécuter syncRateTypesOnStartup()
  // 4. Vérifier que createRateType n'a pas été appelé
});
```

#### 3.3 Test de `syncRateTypeLinksOnStartup()`

**Scénario 1 : Lien créé dans OpenPro**
```typescript
it('should create missing link in OpenPro', async () => {
  // 1. Créer un hébergement et un plan tarifaire en DB
  // 2. Créer le lien en DB (accommodation_rate_type_links)
  // 3. Configurer le stub pour ne pas retourner ce lien
  // 4. Exécuter syncRateTypeLinksOnStartup()
  // 5. Vérifier que linkRateTypeToAccommodation a été appelé
});
```

**Scénario 2 : Lien déjà synchronisé**
```typescript
it('should not create link when already synchronized', async () => {
  // 1. Créer un hébergement et un plan tarifaire en DB
  // 2. Créer le lien en DB
  // 3. Configurer le stub pour retourner ce lien
  // 4. Exécuter syncRateTypeLinksOnStartup()
  // 5. Vérifier que linkRateTypeToAccommodation n'a pas été appelé
});
```

#### 3.4 Test d'intégration complète

**Scénario : Workflow complet de synchronisation**
```typescript
it('should execute full startup synchronization workflow', async () => {
  // 1. Créer des données de test complètes :
  //    - Hébergements (certains avec/sans ID OpenPro)
  //    - Plans tarifaires (certains avec/sans ID OpenPro)
  //    - Liens hébergements/plans tarifaires
  // 2. Configurer le stub avec des réponses appropriées
  // 3. Exécuter toutes les fonctions de synchronisation dans l'ordre
  // 4. Vérifier que :
  //    - Tous les plans tarifaires ont un ID OpenPro
  //    - Tous les liens sont créés dans OpenPro
  //    - Les avertissements sont correctement enregistrés
});
```

### 4. Configuration du stub serveur

#### 4.1 Endpoints à mocker

Le stub serveur doit supporter :
- `GET /fournisseur/:id/hebergements` → Liste des hébergements
- `GET /fournisseur/:id/typetarifs` → Liste des plans tarifaires
- `POST /fournisseur/:id/typetarifs` → Création d'un plan tarifaire
- `GET /fournisseur/:id/hebergements/:idHebergement/typetarifs` → Liens hébergement/plan tarifaire
- `POST /fournisseur/:id/hebergements/:idHebergement/typetarifs/:idTypeTarif` → Création d'un lien

#### 4.2 Gestion de l'état du stub

Le stub doit maintenir un état interne pour :
- Les hébergements retournés
- Les plans tarifaires retournés
- Les liens créés

**Option 1 : Utiliser le stub existant**
- Le stub dans `openpro-api-react/stub-server/` utilise déjà un fichier JSON
- Modifier le fichier JSON avant chaque test ou utiliser des endpoints de reset

**Option 2 : Créer un stub dédié aux tests**
- Créer un serveur stub minimal uniquement pour les tests d'intégration
- Plus de contrôle, mais nécessite plus de maintenance

### 5. Exemple d'implémentation

```typescript
// src/services/openpro/__tests__/integration/startupSyncTestHelper.ts

import { createD1TestDatabase } from '../../../ical/__tests__/d1TestHelper.js';
import type { Env } from '../../../../index.js';

const STUB_SERVER_URL = process.env.OPENPRO_BASE_URL || 'http://localhost:3000';

/**
 * Vérifie que le serveur stub est accessible
 */
export async function checkStubServer(): Promise<boolean> {
  try {
    const response = await fetch(`${STUB_SERVER_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Nettoie et initialise la DB avec des données de test
 */
export async function setupTestDatabase(): Promise<Env> {
  const db = createD1TestDatabase();
  const env: Env = {
    DB: db,
    OPENPRO_API_KEY: 'test-key',
    OPENPRO_BASE_URL: STUB_SERVER_URL,
    FRONTEND_URL: 'http://localhost:4321',
    AI_PROVIDER: 'openai',
  };

  // Nettoyer les données de test
  await cleanupTestData(env);

  return env;
}

/**
 * Nettoie les données de test
 */
export async function cleanupTestData(env: Env): Promise<void> {
  await env.DB.prepare(`DELETE FROM accommodation_data WHERE id_hebergement LIKE 'test-%'`).run();
  await env.DB.prepare(`DELETE FROM accommodation_rate_type_links WHERE id_hebergement LIKE 'test-%'`).run();
  await env.DB.prepare(`DELETE FROM rate_types WHERE id LIKE 'test-%'`).run();
  await env.DB.prepare(`DELETE FROM accommodations WHERE id LIKE 'test-%'`).run();
}

/**
 * Crée un hébergement de test
 */
export async function createTestAccommodation(
  env: Env,
  id: string,
  nom: string,
  idOpenPro: number
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO accommodations (id, nom, id_openpro, date_creation, date_modification)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).bind(id, nom, idOpenPro).run();
}

/**
 * Crée un plan tarifaire de test
 */
export async function createTestRateType(
  env: Env,
  id: string,
  libelle: string,
  idTypeTarif: number | null = null
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO rate_types (id, id_type_tarif, libelle, description, ordre, date_creation, date_modification)
    VALUES (?, ?, ?, NULL, NULL, datetime('now'), datetime('now'))
  `).bind(id, idTypeTarif, libelle).run();
}
```

### 6. Exécution des tests

#### 6.1 Prérequis

1. **Initialiser la base de données locale** :
   ```bash
   npm run d1:migrate:local
   ```
   Ou démarrer `wrangler dev` au moins une fois pour créer la DB.

2. **Démarrer le serveur stub** (optionnel mais recommandé) :
   ```bash
   # Terminal 1 : Démarrer le serveur stub
   cd openpro-api-react
   npm run stub
   ```

3. **Exécuter les tests d'intégration** :
   ```bash
   # Terminal 2 : Exécuter les tests d'intégration
   cd openpro-backend
   npm run test:integration
   ```

#### 6.2 Scripts npm disponibles

Les scripts suivants ont été ajoutés dans `package.json` :

```json
{
  "scripts": {
    "test:integration": "vitest run src/services/openpro/__tests__/**/*.integration.spec.ts",
    "test:integration:watch": "vitest watch src/services/openpro/__tests__/**/*.integration.spec.ts"
  }
}
```

#### 6.3 Comportement sans stub serveur

Si le serveur stub n'est pas démarré, les tests s'exécutent quand même mais :
- Les appels API échouent (erreur de connexion)
- Les fonctions gèrent les erreurs gracieusement (ne font pas échouer le démarrage)
- Les tests vérifient que les fonctions s'exécutent sans crash
- Un avertissement est affiché pour indiquer que le stub n'est pas disponible

Pour des tests complets, il est recommandé de démarrer le serveur stub.

### 7. Avantages de cette approche

1. **Tests réalistes** : Utilise une vraie base de données SQLite (même moteur que D1)
2. **Isolation** : Chaque test nettoie ses données avant/après
3. **Contrôle** : Le stub permet de simuler différents scénarios
4. **Maintenabilité** : Réutilise les helpers existants (`d1TestHelper.ts`)
5. **Rapidité** : Les tests s'exécutent rapidement (pas de vraie API externe)

### 8. Limitations et alternatives

#### 8.1 Limitations
- Nécessite que le serveur stub soit démarré
- Nécessite que la DB locale soit initialisée
- Les tests ne sont pas complètement isolés (partagent la même DB)

#### 8.2 Alternatives

**Option A : Tests avec DB en mémoire**
- Créer une DB SQLite en mémoire pour chaque test
- Avantage : Isolation complète
- Inconvénient : Nécessite de recréer le schéma à chaque test

**Option B : Tests avec mocks complets**
- Mocker complètement D1Database et OpenProClient
- Avantage : Pas de dépendances externes
- Inconvénient : Moins réaliste, déjà couvert par les tests unitaires

**Option C : Tests E2E avec vraie API OpenPro (sandbox)**
- Utiliser l'API OpenPro sandbox réelle
- Avantage : Teste le vrai comportement
- Inconvénient : Plus lent, nécessite des credentials, peut être instable

### 9. Recommandation

**Approche recommandée :** Combiner les tests unitaires existants avec des tests d'intégration limités aux scénarios critiques :

1. **Tests unitaires** (déjà implémentés) : Couvrent la logique métier avec mocks
2. **Tests d'intégration** (à implémenter) : Vérifient le workflow complet avec DB réelle et stub
3. **Tests E2E** (optionnel) : Tests manuels ou automatisés avec l'API sandbox réelle

Cette approche offre un bon équilibre entre couverture, rapidité et maintenabilité.

