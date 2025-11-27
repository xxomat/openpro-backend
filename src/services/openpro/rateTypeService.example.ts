/**
 * EXEMPLE D'UTILISATION de class-transformer avec ApiRateType
 * 
 * Ce fichier montre comment utiliser les classes avec class-transformer
 * pour remplacer les interfaces actuelles.
 * 
 * AVANT (avec interfaces) :
 * ```typescript
 * const apiRateTypesResponse = allRateTypesResponse as unknown as RateTypeListResponse;
 * const allRateTypes: ApiRateType[] = apiRateTypesResponse.typeTarifs ?? [];
 * const id = Number(rateType.cleTypeTarif?.idTypeTarif ?? rateType.idTypeTarif);
 * ```
 * 
 * APRÈS (avec class-transformer) :
 * ```typescript
 * import { plainToInstance } from 'class-transformer';
 * import { RateTypeListResponse, ApiRateType } from '../../types/apiTypes.classes.js';
 * 
 * const apiRateTypesResponse = plainToInstance(
 *   RateTypeListResponse,
 *   allRateTypesResponse,
 *   { excludeExtraneousValues: true }
 * );
 * const allRateTypes = apiRateTypesResponse.rateTypes ?? [];
 * const id = rateType.rateTypeKey?.rateTypeId ?? rateType.rateTypeId;
 * ```
 */

import { plainToInstance } from 'class-transformer';
import { RateTypeListResponse, ApiRateType } from '../../types/apiTypes.classes.js';

// Exemple de données JSON reçues de l'API
const exampleJsonResponse = {
  typeTarifs: [
    {
      idTypeTarif: 1,
      cleTypeTarif: { idTypeTarif: 1 },
      libelle: "Standard",
      description: "Chambre standard",
      ordre: 10
    },
    {
      idTypeTarif: 2,
      libelle: "Deluxe",
      ordre: 20
    }
  ]
};

// Transformation avec class-transformer
const rateTypeListResponse = plainToInstance(
  RateTypeListResponse,
  exampleJsonResponse,
  { excludeExtraneousValues: true }
);

// Maintenant on peut utiliser les noms en camelCase
const firstRateType = rateTypeListResponse.rateTypes?.[0];
if (firstRateType) {
  // Au lieu de: rateType.cleTypeTarif?.idTypeTarif ?? rateType.idTypeTarif
  const id = firstRateType.rateTypeKey?.rateTypeId ?? firstRateType.rateTypeId;
  const label = firstRateType.label;
  const order = firstRateType.order;
  
  console.log(`Rate Type ID: ${id}, Label: ${label}, Order: ${order}`);
}

// Pour la sérialisation (retour vers l'API), utiliser instanceToPlain
import { instanceToPlain } from 'class-transformer';

const jsonToSend = instanceToPlain(rateTypeListResponse);
// jsonToSend contient les noms JSON originaux (typeTarifs, idTypeTarif, etc.)

