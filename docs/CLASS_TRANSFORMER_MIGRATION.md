# Migration vers class-transformer

## Objectif

Migrer vers `class-transformer` pour permettre le mapping automatique entre les noms JSON de l'API (ex: `idTypeTarif`) et les noms TypeScript en camelCase (ex: `rateTypeId`), tout en respectant la règle **"coder contre des interfaces"**.

## Principe : Interfaces comme contrats, Classes pour transformation

### Architecture

- **Interfaces** : Contrats de type avec noms camelCase, **préfixées avec "I"** (convention C#) - utilisées partout dans le code
- **Classes** : Implémentent les interfaces avec décorateurs (utilisées uniquement pour la transformation)

```typescript
// Interface (contrat de type - utilisée dans tout le code)
// Convention : toutes les interfaces sont préfixées avec "I"
export interface IApiRateType {
  rateTypeId?: number;
  rateTypeKey?: IApiRateTypeKey;
  label?: IMultilingualField;
  description?: IMultilingualField;
  order?: number;
}

// Classe (implémente l'interface - utilisée uniquement pour transformation)
export class ApiRateTypeClass implements IApiRateType {
  @Expose({ name: 'idTypeTarif' })
  rateTypeId?: number;

  @Expose({ name: 'cleTypeTarif' })
  @Type(() => ApiRateTypeKeyClass)
  rateTypeKey?: IApiRateTypeKey;

  @Expose({ name: 'libelle' })
  label?: IMultilingualField;

  @Expose({ name: 'description' })
  description?: IMultilingualField;

  @Expose({ name: 'ordre' })
  order?: number;
}

// Utilisation dans le code (on code contre l'interface)
function processRateType(rateType: IApiRateType) {
  const id = rateType.rateTypeId; // Utilise l'interface
  // ...
}

// Transformation (utilise la classe)
const instance = plainToInstance(ApiRateTypeClass, jsonData);
const typed: IApiRateType = instance; // Typage via interface
processRateType(typed); // Le code utilise l'interface
```

## Installation

✅ **Fait** : `class-transformer` et `reflect-metadata` ont été installés
✅ **Fait** : `tsconfig.json` a été configuré avec `experimentalDecorators` et `emitDecoratorMetadata`

## Exemple de transformation

### AVANT (avec interfaces et casts)

```typescript
// Types
export interface ApiRateType {
  idTypeTarif?: number;
  cleTypeTarif?: {
    idTypeTarif?: number;
  };
  libelle?: MultilingualField;
  ordre?: number;
}

// Utilisation
const apiRateTypesResponse = allRateTypesResponse as unknown as RateTypeListResponse;
const allRateTypes: ApiRateType[] = apiRateTypesResponse.typeTarifs ?? [];
const id = Number(rateType.cleTypeTarif?.idTypeTarif ?? rateType.idTypeTarif);
const order = rateType.ordre;
```

### APRÈS (interfaces + classes avec class-transformer)

```typescript
// Interface (contrat de type) - Convention : préfixe "I"
export interface IApiRateType {
  rateTypeId?: number;
  rateTypeKey?: IApiRateTypeKey;
  label?: IMultilingualField;
  order?: number;
}

// Classe (pour transformation uniquement)
export class ApiRateTypeClass implements IApiRateType {
  @Expose({ name: 'idTypeTarif' })
  rateTypeId?: number;

  @Expose({ name: 'cleTypeTarif' })
  @Type(() => ApiRateTypeKeyClass)
  rateTypeKey?: IApiRateTypeKey;

  @Expose({ name: 'libelle' })
  label?: IMultilingualField;

  @Expose({ name: 'ordre' })
  order?: number;
}

// Utilisation dans le code (on code contre l'interface)
import { plainToInstance } from 'class-transformer';

const apiRateTypesResponse = plainToInstance(
  RateTypeListResponseClass,
  allRateTypesResponse,
  { excludeExtraneousValues: true }
);
const allRateTypes: IApiRateType[] = apiRateTypesResponse.rateTypes ?? [];
const id = rateType.rateTypeKey?.rateTypeId ?? rateType.rateTypeId; // Utilise l'interface
const order = rateType.order; // Utilise l'interface
```

## Mapping des noms

### Convention de nommage

| JSON API (français) | Interface TypeScript (camelCase) |
|---------------------|--------------------------------|
| `idTypeTarif` | `rateTypeId` |
| `idHebergement` | `accommodationId` |
| `idDossier` | `bookingId` |
| `idFournisseur` | `supplierId` |
| `nomHebergement` | `accommodationName` |
| `libelle` | `label` |
| `ordre` | `order` |
| `dureeMin` | `minDuration` |
| `arriveeAutorisee` | `arrivalAllowed` |
| `departAutorise` | `departureAllowed` |
| `dateArrivee` | `arrivalDate` |
| `dateDepart` | `departureDate` |
| `montantTotal` | `totalAmount` |
| `nbPersonnes` | `numberOfPersons` |
| `nbNuits` | `numberOfNights` |
| `clientNom` | `clientName` |
| `clientEmail` | `clientEmail` |
| `typeTarifs` | `rateTypes` |
| `tarifs` | `rates` |
| `periodes` | `periods` |

## Structure des fichiers

### Interfaces (contrats de type)

- `src/types/apiTypes.ts` - Interfaces pour les réponses API OpenPro (avec noms camelCase)
- `src/types/api.ts` - Interfaces pour les données exposées au frontend (avec noms camelCase)
- `src/types/suggestions.ts` - Interfaces pour les suggestions IA (avec noms camelCase)

### Classes (transformation uniquement)

- `src/types/apiTypes.classes.ts` - Classes qui implémentent les interfaces de `apiTypes.ts`
- `src/types/api.classes.ts` - Classes qui implémentent les interfaces de `api.ts`
- `src/types/suggestions.classes.ts` - Classes qui implémentent les interfaces de `suggestions.ts`

## Règle de codage

**TOUJOURS coder contre les interfaces, jamais contre les classes.**

**Convention de nommage** : Toutes les interfaces sont préfixées avec "I" (ex: `IApiRateType`, `IAccommodation`, `IBookingDisplay`)

```typescript
// ✅ BON : Le code utilise l'interface (préfixe "I")
function processData(data: IApiRateType) {
  return data.rateTypeId;
}

// ❌ MAUVAIS : Le code utilise la classe directement
function processData(data: ApiRateTypeClass) {
  return data.rateTypeId;
}

// ✅ BON : Transformation puis typage via interface
const instance = plainToInstance(ApiRateTypeClass, jsonData);
const typed: IApiRateType = instance;
processData(typed);

// ✅ BON : Helper de transformation qui retourne l'interface
function transformApiRateType(json: unknown): IApiRateType {
  return plainToInstance(ApiRateTypeClass, json, { excludeExtraneousValues: true });
}
```

## Liste des interfaces et classes à créer

### Fichier: `src/types/apiTypes.ts` (interfaces avec noms camelCase - préfixe "I")

- `IMultilingualText` → `language`, `text` (normalisés)
- `IApiAccommodation` → `accommodationId`, `accommodationName`
- `IApiAccommodationKey` → `accommodationId`
- `IAccommodationListResponse` → `accommodations`, `accommodationList`
- `ITarifOccupation` → `numberOfPersons`, `price`
- `ITarifPax` → `price`, `occupationList`
- `IApiRateType` → `rateTypeId`, `rateTypeKey`, `label`, `order`
- `IApiRateTypeKey` → `rateTypeId`
- `IApiTarif` → `rateTypeId`, `label`, `minDuration`, etc.
- `IRatesResponse` → `rates`, `periods`
- `IAccommodationRateTypeLink` → `rateTypeId`
- `IAccommodationRateTypeLinksResponse` → `accommodationRateTypeLinks`
- `IRateTypeListResponse` → `rateTypes`

### Fichier: `src/types/apiTypes.classes.ts` (classes qui implémentent)

- Toutes les classes correspondantes avec décorateurs `@Expose` et `@Type`

### Fichier: `src/types/api.ts` (interfaces avec noms camelCase - préfixe "I")

- `IAccommodation` → `accommodationId`, `accommodationName`
- `IRateType` → `rateTypeId`, `label`, `descriptionFr`, `order`
- `IBookingDisplay` → `bookingId`, `accommodationId`, `arrivalDate`, `departureDate`, `clientName`, etc.
- `ISupplierData` → Tous les champs en camelCase
- `IRatesData` → Tous les champs en camelCase

### Fichier: `src/types/api.classes.ts` (classes qui implémentent)

- Toutes les classes correspondantes avec décorateurs

### Fichier: `src/types/suggestions.ts` (interfaces avec noms camelCase - préfixe "I")

- `IBookingAnalysis` → `bookingId`, `supplierId`, `accommodationId`, `arrivalDate`, `departureDate`, `amount`
- `IPricingSuggestion` → `rateTypeId`, `startDate`, `endDate`, etc.
- `ISuggestionRequest` → `supplierId`, `accommodationId`, etc.

### Fichier: `src/types/suggestions.classes.ts` (classes qui implémentent)

- Toutes les classes correspondantes avec décorateurs

## Services à mettre à jour

1. Créer des helpers de transformation qui retournent les interfaces
2. Mettre à jour `rateTypeService.ts` pour utiliser les helpers
3. Mettre à jour `accommodationService.ts`
4. Mettre à jour `rateService.ts`
5. Mettre à jour `supplierDataService.ts`
6. Mettre à jour `bookingService.ts`
7. Mettre à jour `openProClient.ts` - Point d'entrée pour la désérialisation

## Routes à mettre à jour

1. `routes/suppliers.ts` - Utiliser les interfaces dans les réponses
2. `routes/suggestions.ts` - Utiliser les interfaces
3. `routes/webhooks.ts` - Utiliser les interfaces

## Points d'attention

### Cloudflare Workers

⚠️ **Important** : `class-transformer` utilise `reflect-metadata` qui peut nécessiter des polyfills dans Cloudflare Workers. À tester.

### Performance

- `plainToInstance` peut avoir un impact sur les performances pour de gros volumes de données
- Considérer l'utilisation de `excludeExtraneousValues: true` pour éviter les propriétés non mappées

### Compatibilité

- Les interfaces restent inchangées dans leur utilisation
- Seule la transformation utilise les classes
- Migration progressive possible

## Prochaines étapes

1. ✅ Créer les classes de base (`apiTypes.classes.ts`)
2. Mettre à jour les interfaces avec les noms camelCase
3. Créer les classes qui implémentent les interfaces
4. Créer des helpers de transformation
5. Mettre à jour les services pour utiliser les helpers
6. Renommer les variables dans tout le code
7. Mettre à jour les tests
8. Vérifier la compatibilité Cloudflare Workers

## Références

- [class-transformer documentation](https://github.com/typestack/class-transformer)
- [Exemple d'utilisation](./../src/services/openpro/rateTypeService.example.ts)
