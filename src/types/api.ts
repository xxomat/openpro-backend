/**
 * Types partagés pour l'API backend
 * 
 * Ce fichier contient les types utilisés par les routes et services
 * du backend, correspondant aux structures de données exposées au frontend.
 */

export interface Accommodation {
  idHebergement: number;
  nomHebergement: string;
}

export interface RateType {
  idTypeTarif: number;
  libelle?: unknown;
  descriptionFr?: string;
  ordre?: number;
}

export interface SupplierData {
  stock: Record<number, Record<string, number>>;
  rates: Record<number, Record<string, Record<number, number>>>;
  promo: Record<number, Record<string, boolean>>;
  rateTypes: Record<number, Record<string, string[]>>;
  dureeMin: Record<number, Record<string, number | null>>;
  rateTypeLabels: Record<number, string>;
  rateTypesList: RateType[];
}

export interface RatesData {
  rates: Record<string, Record<number, number>>;
  promo: Record<string, boolean>;
  rateTypes: Record<string, string[]>;
  dureeMin: Record<string, number | null>;
}

