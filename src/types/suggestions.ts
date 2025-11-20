/**
 * Types pour le service de suggestions IA
 * 
 * Ce fichier contient les types utilisés pour le système de suggestions
 * de tarifs et durées minimales basé sur l'analyse IA des réservations.
 */

export interface BookingAnalysis {
  idDossier: number;
  idFournisseur: number;
  idHebergement: number;
  dateArrivee: string;
  dateDepart: string;
  montant: number;
  timestamp: Date;
}

export interface PricingSuggestion {
  id: string;
  type: 'rate_increase' | 'rate_decrease' | 'min_stay_increase' | 'min_stay_decrease';
  idFournisseur: number;
  idHebergement: number;
  idTypeTarif?: number;
  dateDebut: string;
  dateFin: string;
  currentValue: number;
  suggestedValue: number;
  confidence: number;
  reasoning: string;
  createdAt: Date;
  status: 'pending' | 'applied' | 'rejected';
}

export interface SuggestionRequest {
  idFournisseur: number;
  idHebergement: number;
  recentBookings: BookingAnalysis[];
  currentRates: Record<string, number>;
  currentStock: Record<string, number>;
  historicalData?: unknown;
}

