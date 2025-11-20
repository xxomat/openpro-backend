/**
 * Types pour les réponses API OpenPro
 * 
 * Ce fichier contient les définitions de types pour les structures de données
 * retournées par l'API OpenPro. Ces types permettent de typer strictement
 * les réponses API au lieu d'utiliser `any`.
 */

/**
 * Structure d'un champ multilingue
 * 
 * Les champs multilingues peuvent être :
 * - Un string simple
 * - Un array d'objets avec langue/texte
 */
export interface MultilingualText {
  langue?: string;
  Langue?: string;
  texte?: string;
  Texte?: string;
}

/**
 * Type pour un champ multilingue
 * 
 * Représente un champ qui peut contenir du texte dans différentes langues.
 * Peut être :
 * - Un string simple (texte déjà en français ou langue par défaut)
 * - Un array d'objets MultilingualText avec les traductions
 * - undefined si le champ n'est pas défini
 */
export type MultilingualField = string | MultilingualText[] | undefined;

/**
 * Structure d'un hébergement dans une réponse API
 */
export interface ApiAccommodation {
  idHebergement?: number;
  cleHebergement?: {
    idHebergement?: number;
  };
  nomHebergement?: string;
  nom?: string;
}

/**
 * Réponse API pour la liste des hébergements
 */
export interface AccommodationListResponse {
  hebergements?: ApiAccommodation[];
  listeHebergement?: ApiAccommodation[];
}

/**
 * Structure d'une occupation dans un tarif
 */
export interface TarifOccupation {
  nbPers?: number;
  prix?: number | string;
}

/**
 * Structure d'un tarif avec occupation
 */
export interface TarifPax {
  prix?: number | string;
  listeTarifPaxOccupation?: TarifOccupation[];
}

/**
 * Structure d'un type de tarif dans une réponse API
 */
export interface ApiRateType {
  idTypeTarif?: number;
  cleTypeTarif?: {
    idTypeTarif?: number;
  };
  libelle?: MultilingualField;
  description?: MultilingualField;
  ordre?: number;
}

/**
 * Structure d'un tarif dans une réponse API
 */
export interface ApiTarif {
  debut?: string;
  dateDebut?: string;
  fin?: string;
  dateFin?: string;
  idTypeTarif?: number;
  typeTarif?: ApiRateType;
  tarifPax?: TarifPax;
  prixPax?: TarifPax;
  listeTarifPaxOccupation?: TarifOccupation[];
  prix?: number | string;
  libelle?: MultilingualField;
  Libelle?: MultilingualField;
  promotion?: boolean | unknown;
  promo?: boolean | unknown;
  promotionActive?: boolean | unknown;
  hasPromo?: boolean | unknown;
  dureeMin?: number;
  description?: MultilingualField;
  ordre?: number;
}

/**
 * Réponse API pour les tarifs
 */
export interface RatesResponse {
  tarifs?: ApiTarif[];
  periodes?: ApiTarif[];
}

/**
 * Structure d'une liaison hébergement-type de tarif
 */
export interface AccommodationRateTypeLink {
  idTypeTarif?: number | string;
}

/**
 * Réponse API pour les liaisons hébergement-type de tarif
 */
export interface AccommodationRateTypeLinksResponse {
  liaisonHebergementTypeTarifs?: AccommodationRateTypeLink[];
  data?: {
    liaisonHebergementTypeTarifs?: AccommodationRateTypeLink[];
  };
}

/**
 * Réponse API pour les types de tarifs
 */
export interface RateTypeListResponse {
  typeTarifs?: ApiRateType[];
}

