/**
 * Classes pour les suggestions IA avec class-transformer
 * 
 * Ce fichier contient les classes avec décorateurs pour mapper les noms JSON
 * vers les noms de propriétés TypeScript en camelCase.
 * 
 * IMPORTANT : Ces classes implémentent les interfaces préfixées "I" définies dans suggestions.ts
 * Le code doit toujours utiliser les interfaces, jamais les classes directement.
 */

import 'reflect-metadata';
import { Expose, Type, Transform } from 'class-transformer';
import type { IBookingAnalysis, IPricingSuggestion, ISuggestionRequest } from './suggestions.js';

/**
 * Structure d'une analyse de réservation
 */
export class BookingAnalysisClass implements IBookingAnalysis {
  @Expose({ name: 'idDossier' })
  bookingId!: number;

  @Expose({ name: 'idFournisseur' })
  supplierId!: number;

  @Expose({ name: 'idHebergement' })
  accommodationId!: number;

  @Expose({ name: 'dateArrivee' })
  arrivalDate!: string;

  @Expose({ name: 'dateDepart' })
  departureDate!: string;

  @Expose({ name: 'montant' })
  amount!: number;

  @Expose({ name: 'timestamp' })
  @Transform(({ value }) => value instanceof Date ? value : new Date(value))
  timestamp!: Date;
}

/**
 * Structure d'une suggestion de tarification
 */
export class PricingSuggestionClass implements IPricingSuggestion {
  @Expose({ name: 'id' })
  id!: string;

  @Expose({ name: 'type' })
  type!: 'rate_increase' | 'rate_decrease' | 'min_stay_increase' | 'min_stay_decrease';

  @Expose({ name: 'idFournisseur' })
  supplierId!: number;

  @Expose({ name: 'idHebergement' })
  accommodationId!: number;

  @Expose({ name: 'idTypeTarif' })
  rateTypeId?: number;

  @Expose({ name: 'dateDebut' })
  startDate!: string;

  @Expose({ name: 'dateFin' })
  endDate!: string;

  @Expose({ name: 'currentValue' })
  currentValue!: number;

  @Expose({ name: 'suggestedValue' })
  suggestedValue!: number;

  @Expose({ name: 'confidence' })
  confidence!: number;

  @Expose({ name: 'reasoning' })
  reasoning!: string;

  @Expose({ name: 'createdAt' })
  @Transform(({ value }) => value instanceof Date ? value : new Date(value))
  createdAt!: Date;

  @Expose({ name: 'status' })
  status!: 'pending' | 'applied' | 'rejected';
}

/**
 * Structure d'une requête de suggestion
 */
export class SuggestionRequestClass implements ISuggestionRequest {
  @Expose({ name: 'idFournisseur' })
  supplierId!: number;

  @Expose({ name: 'idHebergement' })
  accommodationId!: number;

  @Expose({ name: 'recentBookings' })
  @Type(() => BookingAnalysisClass)
  recentBookings!: IBookingAnalysis[];

  @Expose({ name: 'currentRates' })
  currentRates!: Record<string, number>;

  @Expose({ name: 'currentStock' })
  currentStock!: Record<string, number>;

  @Expose({ name: 'historicalData' })
  historicalData?: unknown;
}

