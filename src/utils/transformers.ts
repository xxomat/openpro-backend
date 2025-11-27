/**
 * Helpers de transformation avec class-transformer
 * 
 * Ce fichier contient des fonctions utilitaires pour transformer les données JSON
 * de l'API OpenPro vers les interfaces TypeScript avec noms camelCase.
 * 
 * IMPORTANT : Toutes les fonctions retournent des interfaces (préfixe "I"),
 * jamais des classes. Le code doit toujours coder contre les interfaces.
 */

import { plainToInstance } from 'class-transformer';
import type {
  IMultilingualText,
  IApiAccommodation,
  IAccommodationListResponse,
  ITarifOccupation,
  ITarifPax,
  IApiRateType,
  IApiTarif,
  IRatesResponse,
  IAccommodationRateTypeLink,
  IAccommodationRateTypeLinksResponse,
  IRateTypeListResponse
} from '../types/apiTypes.js';
import type {
  IAccommodation,
  IRateType,
  IBookingDisplay
} from '../types/api.js';
import type {
  IBookingAnalysis,
  IPricingSuggestion,
  ISuggestionRequest
} from '../types/suggestions.js';

import {
  MultilingualTextClass,
  ApiAccommodationClass,
  AccommodationListResponseClass,
  TarifOccupationClass,
  TarifPaxClass,
  ApiRateTypeClass,
  ApiTarifClass,
  RatesResponseClass,
  AccommodationRateTypeLinkClass,
  AccommodationRateTypeLinksResponseClass,
  RateTypeListResponseClass
} from '../types/apiTypes.classes.js';
import {
  AccommodationClass,
  RateTypeClass,
  BookingDisplayClass
} from '../types/api.classes.js';
import {
  BookingAnalysisClass,
  PricingSuggestionClass,
  SuggestionRequestClass
} from '../types/suggestions.classes.js';

/**
 * Options par défaut pour plainToInstance
 */
const DEFAULT_TRANSFORM_OPTIONS = {
  excludeExtraneousValues: true
};

/**
 * Transforme un objet JSON en IMultilingualText
 */
export function transformMultilingualText(json: unknown): IMultilingualText {
  return plainToInstance(MultilingualTextClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IApiAccommodation
 */
export function transformApiAccommodation(json: unknown): IApiAccommodation {
  return plainToInstance(ApiAccommodationClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IAccommodationListResponse
 */
export function transformAccommodationListResponse(json: unknown): IAccommodationListResponse {
  return plainToInstance(AccommodationListResponseClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en ITarifOccupation
 */
export function transformTarifOccupation(json: unknown): ITarifOccupation {
  return plainToInstance(TarifOccupationClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en ITarifPax
 */
export function transformTarifPax(json: unknown): ITarifPax {
  return plainToInstance(TarifPaxClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IApiRateType
 */
export function transformApiRateType(json: unknown): IApiRateType {
  return plainToInstance(ApiRateTypeClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IApiTarif
 */
export function transformApiTarif(json: unknown): IApiTarif {
  return plainToInstance(ApiTarifClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IRatesResponse
 */
export function transformRatesResponse(json: unknown): IRatesResponse {
  return plainToInstance(RatesResponseClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IAccommodationRateTypeLink
 */
export function transformAccommodationRateTypeLink(json: unknown): IAccommodationRateTypeLink {
  return plainToInstance(AccommodationRateTypeLinkClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IAccommodationRateTypeLinksResponse
 */
export function transformAccommodationRateTypeLinksResponse(json: unknown): IAccommodationRateTypeLinksResponse {
  return plainToInstance(AccommodationRateTypeLinksResponseClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IRateTypeListResponse
 */
export function transformRateTypeListResponse(json: unknown): IRateTypeListResponse {
  return plainToInstance(RateTypeListResponseClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IAccommodation
 */
export function transformAccommodation(json: unknown): IAccommodation {
  return plainToInstance(AccommodationClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IRateType
 */
export function transformRateType(json: unknown): IRateType {
  return plainToInstance(RateTypeClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IBookingDisplay
 */
export function transformBookingDisplay(json: unknown): IBookingDisplay {
  return plainToInstance(BookingDisplayClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IBookingAnalysis
 */
export function transformBookingAnalysis(json: unknown): IBookingAnalysis {
  return plainToInstance(BookingAnalysisClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en IPricingSuggestion
 */
export function transformPricingSuggestion(json: unknown): IPricingSuggestion {
  return plainToInstance(PricingSuggestionClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un objet JSON en ISuggestionRequest
 */
export function transformSuggestionRequest(json: unknown): ISuggestionRequest {
  return plainToInstance(SuggestionRequestClass, json, DEFAULT_TRANSFORM_OPTIONS);
}

/**
 * Transforme un tableau JSON en tableau d'interfaces
 */
export function transformArray<T>(
  jsonArray: unknown[],
  transformFn: (json: unknown) => T
): T[] {
  if (!Array.isArray(jsonArray)) {
    return [];
  }
  return jsonArray.map(item => transformFn(item));
}

