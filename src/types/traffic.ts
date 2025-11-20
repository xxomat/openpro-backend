/**
 * Types pour le système de monitoring du trafic HTTP
 */

/**
 * Type d'événement de trafic
 */
export type TrafficEventType = 'incoming' | 'outgoing-openpro' | 'outgoing-ai';

/**
 * Métadonnées spécifiques par type d'événement
 */
export interface TrafficEventMetadata {
  // Pour incoming
  userAgent?: string;
  origin?: string;
  
  // Pour outgoing-openpro
  openpro?: {
    idFournisseur?: number;
    idHebergement?: number;
    endpoint?: string;
  };
  
  // Pour outgoing-ai
  ai?: {
    provider: string;
    model: string;
    tokensUsed?: number;
    promptTokens?: number;
    completionTokens?: number;
  };
  
  // Commun
  requestBody?: any;
  responseBody?: any;
}

/**
 * Événement de trafic capturé
 */
export interface TrafficEvent {
  id: string;
  timestamp: Date;
  type: TrafficEventType;
  traceId: string;
  method: string;
  path: string;
  statusCode?: number;
  duration?: number;
  error?: string;
  metadata?: TrafficEventMetadata;
}

/**
 * Statistiques agrégées du trafic
 */
export interface TrafficStats {
  total: number;
  byType: {
    incoming: number;
    'outgoing-openpro': number;
    'outgoing-ai': number;
  };
  errors: number;
  errorRate: number;
  averageDuration: number;
  slowRequests: number; // > 1000ms
}

/**
 * Arbre de trace pour la corrélation
 */
export interface TraceTree {
  traceId: string;
  rootEvent: TrafficEvent;
  childEvents: TrafficEvent[];
  totalDuration: number;
}

/**
 * Filtres pour la requête d'événements
 */
export interface TrafficEventFilter {
  type?: TrafficEventType;
  traceId?: string;
  minDuration?: number;
  hasError?: boolean;
}

