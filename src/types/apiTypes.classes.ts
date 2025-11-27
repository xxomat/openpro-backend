/**
 * Classes pour les réponses API OpenPro avec class-transformer
 * 
 * Ce fichier contient les classes avec décorateurs pour mapper les noms JSON
 * vers les noms de propriétés TypeScript en camelCase.
 * 
 * IMPORTANT : Ces classes implémentent les interfaces préfixées "I" définies dans apiTypes.ts
 * Le code doit toujours utiliser les interfaces, jamais les classes directement.
 * 
 * Exemple d'utilisation :
 * ```typescript
 * import { plainToInstance } from 'class-transformer';
 * import type { IApiRateType } from './apiTypes.js';
 * const rateType = plainToInstance(ApiRateTypeClass, jsonData) as IApiRateType;
 * ```
 */

import 'reflect-metadata';
import { Expose, Type, Transform } from 'class-transformer';
import type { IMultilingualField, IMultilingualText, IApiAccommodationKey, IApiAccommodation, IAccommodationListResponse, ITarifOccupation, ITarifPax, IApiRateTypeKey, IApiRateType, IApiTarif, IRatesResponse, IAccommodationRateTypeLink, IAccommodationRateTypeLinksData, IAccommodationRateTypeLinksResponse, IRateTypeListResponse } from './apiTypes.js';

/**
 * Structure d'un champ multilingue
 * 
 * Normalise les variantes majuscule/minuscule de l'API OpenPro (langue/Langue, texte/Texte)
 */
export class MultilingualTextClass implements IMultilingualText {
  @Expose({ name: 'langue' })
  @Transform(({ obj }) => obj.langue ?? obj.Langue ?? undefined)
  language?: string;

  @Expose({ name: 'texte' })
  @Transform(({ obj }) => obj.texte ?? obj.Texte ?? undefined)
  text?: string;
}

/**
 * Clé d'hébergement (structure imbriquée)
 */
export class ApiAccommodationKeyClass implements IApiAccommodationKey {
  @Expose({ name: 'idHebergement' })
  accommodationId?: number;
}

/**
 * Structure d'un hébergement dans une réponse API
 */
export class ApiAccommodationClass implements IApiAccommodation {
  @Expose({ name: 'idHebergement' })
  accommodationId?: number;

  @Expose({ name: 'cleHebergement' })
  @Type(() => ApiAccommodationKeyClass)
  accommodationKey?: IApiAccommodationKey;

  @Expose({ name: 'nomHebergement' })
  accommodationName?: string;

  @Expose({ name: 'nom' })
  name?: string;
}

/**
 * Réponse API pour la liste des hébergements
 */
export class AccommodationListResponseClass implements IAccommodationListResponse {
  @Expose({ name: 'hebergements' })
  @Type(() => ApiAccommodationClass)
  accommodations?: IApiAccommodation[];

  @Expose({ name: 'listeHebergement' })
  @Type(() => ApiAccommodationClass)
  accommodationList?: IApiAccommodation[];
}

/**
 * Structure d'une occupation dans un tarif
 */
export class TarifOccupationClass implements ITarifOccupation {
  @Expose({ name: 'nbPers' })
  numberOfPersons?: number;

  @Expose({ name: 'prix' })
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  price?: number;
}

/**
 * Structure d'un tarif avec occupation
 */
export class TarifPaxClass implements ITarifPax {
  @Expose({ name: 'prix' })
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  price?: number;

  @Expose({ name: 'listeTarifPaxOccupation' })
  @Type(() => TarifOccupationClass)
  occupationList?: ITarifOccupation[];
}

/**
 * Clé de type de tarif (structure imbriquée)
 */
export class ApiRateTypeKeyClass implements IApiRateTypeKey {
  @Expose({ name: 'idTypeTarif' })
  rateTypeId?: number;
}

/**
 * Structure d'un type de tarif dans une réponse API
 */
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

/**
 * Structure d'un tarif dans une réponse API
 */
export class ApiTarifClass implements IApiTarif {
  @Expose({ name: 'debut' })
  startDate?: string;

  @Expose({ name: 'dateDebut' })
  startDateAlt?: string;

  @Expose({ name: 'fin' })
  @Transform(({ obj }) => obj.fin ?? obj['fin '] ?? undefined)
  endDate?: string;

  @Expose({ name: 'dateFin' })
  endDateAlt?: string;

  @Expose({ name: 'idTypeTarif' })
  rateTypeId?: number;

  @Expose({ name: 'typeTarif' })
  @Type(() => ApiRateTypeClass)
  rateType?: IApiRateType;

  @Expose({ name: 'tarifPax' })
  @Type(() => TarifPaxClass)
  ratePax?: ITarifPax;

  @Expose({ name: 'prixPax' })
  @Type(() => TarifPaxClass)
  pricePax?: ITarifPax;

  @Expose({ name: 'listeTarifPaxOccupation' })
  @Type(() => TarifOccupationClass)
  occupationList?: ITarifOccupation[];

  @Expose({ name: 'prix' })
  @Transform(({ value }) => typeof value === 'string' ? parseFloat(value) : value)
  price?: number;

  @Expose({ name: 'libelle' })
  @Transform(({ obj }) => obj.libelle ?? obj.Libelle ?? undefined)
  label?: IMultilingualField;

  @Expose({ name: 'promotion' })
  promotion?: boolean | unknown;

  @Expose({ name: 'promo' })
  promo?: boolean | unknown;

  @Expose({ name: 'promotionActive' })
  promotionActive?: boolean | unknown;

  @Expose({ name: 'hasPromo' })
  hasPromo?: boolean | unknown;

  @Expose({ name: 'dureeMin' })
  minDuration?: number;

  @Expose({ name: 'arriveeAutorisee' })
  arrivalAllowed?: boolean;

  @Expose({ name: 'departAutorise' })
  departureAllowed?: boolean;

  @Expose({ name: 'description' })
  description?: IMultilingualField;

  @Expose({ name: 'ordre' })
  order?: number;
}

/**
 * Réponse API pour les tarifs
 */
export class RatesResponseClass implements IRatesResponse {
  @Expose({ name: 'tarifs' })
  @Type(() => ApiTarifClass)
  rates?: IApiTarif[];

  @Expose({ name: 'periodes' })
  @Type(() => ApiTarifClass)
  periods?: IApiTarif[];
}

/**
 * Structure d'une liaison hébergement-type de tarif
 */
export class AccommodationRateTypeLinkClass implements IAccommodationRateTypeLink {
  @Expose({ name: 'idTypeTarif' })
  @Transform(({ value }) => typeof value === 'string' ? parseInt(value, 10) : value)
  rateTypeId?: number;
}

/**
 * Structure de données pour les liaisons
 */
export class AccommodationRateTypeLinksDataClass implements IAccommodationRateTypeLinksData {
  @Expose({ name: 'liaisonHebergementTypeTarifs' })
  @Type(() => AccommodationRateTypeLinkClass)
  accommodationRateTypeLinks?: IAccommodationRateTypeLink[];
}

/**
 * Réponse API pour les liaisons hébergement-type de tarif
 */
export class AccommodationRateTypeLinksResponseClass implements IAccommodationRateTypeLinksResponse {
  @Expose({ name: 'liaisonHebergementTypeTarifs' })
  @Type(() => AccommodationRateTypeLinkClass)
  accommodationRateTypeLinks?: IAccommodationRateTypeLink[];

  @Expose({ name: 'data' })
  @Type(() => AccommodationRateTypeLinksDataClass)
  data?: IAccommodationRateTypeLinksData;
}

/**
 * Réponse API pour les types de tarifs
 */
export class RateTypeListResponseClass implements IRateTypeListResponse {
  @Expose({ name: 'typeTarifs' })
  @Type(() => ApiRateTypeClass)
  rateTypes?: IApiRateType[];
}
