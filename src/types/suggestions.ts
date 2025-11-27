/**
 * Types pour le service de suggestions IA
 * 
 * Ce fichier contient les interfaces utilisées pour le système de suggestions
 * de tarifs et durées minimales basé sur l'analyse IA des réservations.
 * 
 * Convention : Toutes les interfaces sont préfixées avec "I" (ex: IBookingAnalysis)
 * Les propriétés utilisent des noms camelCase en anglais.
 */

export interface IBookingAnalysis {
  bookingId: number;
  supplierId: number;
  accommodationId: number;
  arrivalDate: string;
  departureDate: string;
  amount: number;
  timestamp: Date;
}

export interface IPricingSuggestion {
  id: string;
  type: 'rate_increase' | 'rate_decrease' | 'min_stay_increase' | 'min_stay_decrease';
  supplierId: number;
  accommodationId: number;
  rateTypeId?: number;
  startDate: string;
  endDate: string;
  currentValue: number;
  suggestedValue: number;
  confidence: number;
  reasoning: string;
  createdAt: Date;
  status: 'pending' | 'applied' | 'rejected';
}

export interface ISuggestionRequest {
  supplierId: number;
  accommodationId: number;
  recentBookings: IBookingAnalysis[];
  currentRates: Record<string, number>;
  currentStock: Record<string, number>;
  historicalData?: unknown;
}
