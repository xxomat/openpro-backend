/**
 * Types pour l'interface de monitoring du trafic
 */

export type TrafficEventType = 'incoming' | 'outgoing-openpro' | 'outgoing-ai';

export interface TrafficEventMetadata {
  userAgent?: string;
  origin?: string;
  openpro?: {
    idFournisseur?: number;
    idHebergement?: number;
    endpoint?: string;
  };
  ai?: {
    provider: string;
    model: string;
    tokensUsed?: number;
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface TrafficEvent {
  id: string;
  timestamp: string;
  type: TrafficEventType;
  traceId: string;
  method: string;
  path: string;
  statusCode?: number;
  duration?: number;
  error?: string;
  metadata?: TrafficEventMetadata;
}

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
  slowRequests: number;
}

export interface TraceTree {
  traceId: string;
  rootEvent: TrafficEvent;
  childEvents: TrafficEvent[];
  totalDuration: number;
}

