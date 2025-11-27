/**
 * Types pour les réponses API OpenPro
 * 
 * Ce fichier contient les définitions d'interfaces pour les structures de données
 * retournées par l'API OpenPro. Ces interfaces permettent de typer strictement
 * les réponses API au lieu d'utiliser `any`.
 * 
 * Convention : Toutes les interfaces sont préfixées avec "I" (ex: IApiRateType)
 * Les propriétés utilisent des noms camelCase en anglais.
 */

/**
 * Structure d'un champ multilingue
 * 
 * Les champs multilingues peuvent être :
 * - Un string simple
 * - Un array d'objets avec langue/texte
 * 
 * Note: Les propriétés language et text normalisent les variantes majuscule/minuscule
 * de l'API OpenPro (langue/Langue, texte/Texte)
 */
export interface IMultilingualText {
  language?: string;  // Normalise langue/Langue
  text?: string;      // Normalise texte/Texte
}

/**
 * Type pour un champ multilingue
 * 
 * Représente un champ qui peut contenir du texte dans différentes langues.
 * Peut être :
 * - Un string simple (texte déjà en français ou langue par défaut)
 * - Un array d'objets IMultilingualText avec les traductions
 * - undefined si le champ n'est pas défini
 */
export type IMultilingualField = string | IMultilingualText[] | undefined;

/**
 * Structure d'une clé d'hébergement (structure imbriquée)
 */
export interface IApiAccommodationKey {
  accommodationId?: number;
}

/**
 * Structure d'un hébergement dans une réponse API
 */
export interface IApiAccommodation {
  accommodationId?: number;
  accommodationKey?: IApiAccommodationKey;
  accommodationName?: string;
  name?: string;
}

/**
 * Réponse API pour la liste des hébergements
 */
export interface IAccommodationListResponse {
  accommodations?: IApiAccommodation[];
  accommodationList?: IApiAccommodation[];
}

/**
 * Structure d'une occupation dans un tarif
 */
export interface ITarifOccupation {
  numberOfPersons?: number;
  price?: number;
}

/**
 * Structure d'un tarif avec occupation
 */
export interface ITarifPax {
  price?: number;
  occupationList?: ITarifOccupation[];
}

/**
 * Structure d'une clé de type de tarif (structure imbriquée)
 */
export interface IApiRateTypeKey {
  rateTypeId?: number;
}

/**
 * Structure d'un type de tarif dans une réponse API
 */
export interface IApiRateType {
  rateTypeId?: number;
  rateTypeKey?: IApiRateTypeKey;
  label?: IMultilingualField;
  description?: IMultilingualField;
  order?: number;
}

/**
 * Structure d'un tarif dans une réponse API
 */
export interface IApiTarif {
  startDate?: string;
  startDateAlt?: string;
  endDate?: string;
  endDateAlt?: string;
  rateTypeId?: number;
  rateType?: IApiRateType;
  ratePax?: ITarifPax;
  pricePax?: ITarifPax;
  occupationList?: ITarifOccupation[];
  price?: number;
  label?: IMultilingualField;
  promotion?: boolean | unknown;
  promo?: boolean | unknown;
  promotionActive?: boolean | unknown;
  hasPromo?: boolean | unknown;
  minDuration?: number;
  arrivalAllowed?: boolean;
  departureAllowed?: boolean;
  description?: IMultilingualField;
  order?: number;
}

/**
 * Réponse API pour les tarifs
 */
export interface IRatesResponse {
  rates?: IApiTarif[];
  periods?: IApiTarif[];
}

/**
 * Structure d'une liaison hébergement-type de tarif
 */
export interface IAccommodationRateTypeLink {
  rateTypeId?: number;
}

/**
 * Structure de données pour les liaisons
 */
export interface IAccommodationRateTypeLinksData {
  accommodationRateTypeLinks?: IAccommodationRateTypeLink[];
}

/**
 * Réponse API pour les liaisons hébergement-type de tarif
 */
export interface IAccommodationRateTypeLinksResponse {
  accommodationRateTypeLinks?: IAccommodationRateTypeLink[];
  data?: IAccommodationRateTypeLinksData;
}

/**
 * Réponse API pour les types de tarifs
 */
export interface IRateTypeListResponse {
  rateTypes?: IApiRateType[];
}
