# Convention de nommage des interfaces

## Règle

**Toutes les interfaces doivent être préfixées avec "I" (convention C#)**

## Mapping complet des interfaces

### Fichier: `src/types/apiTypes.ts`

| Ancien nom | Nouveau nom (interface) | Classe correspondante |
|------------|------------------------|----------------------|
| `MultilingualText` | `IMultilingualText` | `MultilingualTextClass` |
| `ApiAccommodation` | `IApiAccommodation` | `ApiAccommodationClass` |
| `ApiAccommodationKey` | `IApiAccommodationKey` | `ApiAccommodationKeyClass` |
| `AccommodationListResponse` | `IAccommodationListResponse` | `AccommodationListResponseClass` |
| `TarifOccupation` | `ITarifOccupation` | `TarifOccupationClass` |
| `TarifPax` | `ITarifPax` | `TarifPaxClass` |
| `ApiRateType` | `IApiRateType` | `ApiRateTypeClass` |
| `ApiRateTypeKey` | `IApiRateTypeKey` | `ApiRateTypeKeyClass` |
| `ApiTarif` | `IApiTarif` | `ApiTarifClass` |
| `RatesResponse` | `IRatesResponse` | `RatesResponseClass` |
| `AccommodationRateTypeLink` | `IAccommodationRateTypeLink` | `AccommodationRateTypeLinkClass` |
| `AccommodationRateTypeLinksResponse` | `IAccommodationRateTypeLinksResponse` | `AccommodationRateTypeLinksResponseClass` |
| `AccommodationRateTypeLinksData` | `IAccommodationRateTypeLinksData` | `AccommodationRateTypeLinksDataClass` |
| `RateTypeListResponse` | `IRateTypeListResponse` | `RateTypeListResponseClass` |

### Fichier: `src/types/api.ts`

| Ancien nom | Nouveau nom (interface) | Classe correspondante |
|------------|------------------------|----------------------|
| `Accommodation` | `IAccommodation` | `AccommodationClass` |
| `RateType` | `IRateType` | `RateTypeClass` |
| `BookingDisplay` | `IBookingDisplay` | `BookingDisplayClass` |
| `SupplierData` | `ISupplierData` | `SupplierDataClass` |
| `RatesData` | `IRatesData` | `RatesDataClass` |

### Fichier: `src/types/suggestions.ts`

| Ancien nom | Nouveau nom (interface) | Classe correspondante |
|------------|------------------------|----------------------|
| `BookingAnalysis` | `IBookingAnalysis` | `BookingAnalysisClass` |
| `PricingSuggestion` | `IPricingSuggestion` | `PricingSuggestionClass` |
| `SuggestionRequest` | `ISuggestionRequest` | `SuggestionRequestClass` |

## Exemple d'utilisation

```typescript
// Interface (préfixe "I")
export interface IApiRateType {
  rateTypeId?: number;
  label?: IMultilingualField;
  order?: number;
}

// Classe (implémente l'interface)
export class ApiRateTypeClass implements IApiRateType {
  @Expose({ name: 'idTypeTarif' })
  rateTypeId?: number;

  @Expose({ name: 'libelle' })
  label?: IMultilingualField;

  @Expose({ name: 'ordre' })
  order?: number;
}

// Helper de transformation (retourne l'interface)
export function transformApiRateType(json: unknown): IApiRateType {
  return plainToInstance(ApiRateTypeClass, json, { excludeExtraneousValues: true });
}

// Utilisation dans le code (on code contre l'interface)
function processRateType(rateType: IApiRateType) {
  const id = rateType.rateTypeId; // ✅ Utilise l'interface
  // ...
}
```

## Règles

1. **Toutes les interfaces** : Préfixe "I" obligatoire
2. **Toutes les classes** : Pas de préfixe "I", suffixe "Class" optionnel mais recommandé pour clarté
3. **Le code utilise toujours les interfaces** : Jamais les classes directement
4. **Les classes implémentent les interfaces** : `class XClass implements IX`

