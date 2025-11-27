# Plan de migration mis à jour - Règle "Coder contre des interfaces"

## Principe fondamental

**TOUJOURS coder contre des interfaces, jamais contre des classes.**

- **Interfaces** : Contrats de type avec noms camelCase (utilisées partout dans le code)
- **Classes** : Implémentent les interfaces avec décorateurs (utilisées uniquement pour la transformation)

## Structure

```
src/types/
├── apiTypes.ts              # Interfaces (contrats) avec noms camelCase
├── apiTypes.classes.ts      # Classes qui implémentent les interfaces (transformation uniquement)
├── api.ts                   # Interfaces (contrats) avec noms camelCase
├── api.classes.ts           # Classes qui implémentent les interfaces
├── suggestions.ts           # Interfaces (contrats) avec noms camelCase
└── suggestions.classes.ts  # Classes qui implémentent les interfaces
```

## Exemple de pattern

```typescript
// Interface (contrat de type) - Convention : préfixe "I"
export interface IApiRateType {
  rateTypeId?: number;
  label?: IMultilingualField;
  order?: number;
}

// Classe (implémente l'interface - transformation uniquement)
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

// Transformation
const typed = transformApiRateType(jsonData);
processRateType(typed); // ✅ Le code utilise l'interface
```

## Phases de migration

### Phase 1 : Mettre à jour les interfaces avec noms camelCase
- Mettre à jour `apiTypes.ts` : renommer tous les champs en camelCase
- Mettre à jour `api.ts` : renommer tous les champs en camelCase
- Mettre à jour `suggestions.ts` : renommer tous les champs en camelCase

### Phase 2 : Créer les classes qui implémentent
- Créer `apiTypes.classes.ts` : classes avec décorateurs qui implémentent les interfaces
- Créer `api.classes.ts` : classes avec décorateurs qui implémentent les interfaces
- Créer `suggestions.classes.ts` : classes avec décorateurs qui implémentent les interfaces

### Phase 3 : Créer les helpers de transformation
- Créer `src/utils/transformers.ts` avec des fonctions qui retournent les interfaces
- Chaque fonction utilise `plainToInstance` avec la classe correspondante
- Toutes les fonctions retournent le type interface

### Phase 4 : Mettre à jour les services
- Remplacer les casts `as unknown as` par les helpers de transformation
- Le code utilise toujours les interfaces, jamais les classes
- Renommer toutes les variables pour utiliser les noms camelCase

### Phase 5 : Mettre à jour les routes
- Les routes utilisent les interfaces dans les réponses
- Pas de changement dans l'utilisation, juste les noms de propriétés

### Phase 6 : Mettre à jour l'admin
- Mettre à jour les types pour refléter les noms camelCase
- Renommer toutes les références dans le code

### Phase 7 : Mettre à jour les PRDs
- Mettre à jour tous les exemples avec les noms camelCase
- Documenter la nouvelle architecture

