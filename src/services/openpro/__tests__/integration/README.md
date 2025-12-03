# Tests d'intégration pour la synchronisation au démarrage

## Vue d'ensemble

Ces tests vérifient le comportement complet de la synchronisation au démarrage avec une vraie base de données D1 locale.

## Prérequis

### 1. Base de données D1 locale

La base de données D1 locale doit être initialisée :

```bash
npm run d1:migrate:local
```

Ou démarrer `wrangler dev` au moins une fois pour créer automatiquement la DB.

### 2. Serveur stub OpenPro (optionnel mais recommandé)

Pour des tests complets, démarrez le serveur stub :

```bash
# Dans le répertoire openpro-api-react
cd ../openpro-api-react
npm run stub
```

Le serveur stub sera accessible sur `http://localhost:3000`.

**Note :** Les tests s'exécutent même sans le stub serveur, mais les appels API échoueront. Les fonctions gèrent les erreurs gracieusement, donc les tests vérifient au moins que les fonctions s'exécutent sans crash.

## Exécution

### Tous les tests d'intégration

```bash
npm run test:integration
```

### En mode watch

```bash
npm run test:integration:watch
```

### Un fichier spécifique

```bash
npm test -- src/services/openpro/__tests__/startupSyncService.integration.spec.ts
```

## Structure

- **`startupSyncTestHelper.ts`** : Fonctions helper pour configurer les tests
- **`startupSyncService.integration.spec.ts`** : Tests d'intégration pour la synchronisation au démarrage

## Tests disponibles

1. **verifyAccommodationsOnStartup** : Vérification des hébergements
2. **syncRateTypesOnStartup** : Synchronisation des plans tarifaires
3. **syncRateTypeLinksOnStartup** : Synchronisation des liens hébergements/plans tarifaires
4. **Full workflow** : Test du workflow complet de synchronisation

## Notes importantes

- Les tests nettoient automatiquement les données de test avant et après chaque test
- Les données de test utilisent le préfixe `test-` pour être facilement identifiables
- Les tests sont isolés : chaque test nettoie ses données avant de commencer

