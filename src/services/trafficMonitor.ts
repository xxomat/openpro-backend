/**
 * Service de monitoring du trafic HTTP
 * 
 * Capture tous les événements de trafic (requêtes entrantes et sortantes)
 * et les stocke dans un ring buffer en mémoire.
 */

import type { 
  TrafficEvent, 
  TrafficEventType, 
  TrafficEventMetadata,
  TrafficStats,
  TrafficEventFilter,
  TraceTree
} from '../types/traffic.js';
import { randomUUID } from 'crypto';

class TrafficMonitor {
  private events: TrafficEvent[] = [];
  private readonly maxEvents = 1000;

  /**
   * Enregistre un événement de requête entrante
   */
  logIncoming(
    traceId: string,
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    metadata?: TrafficEventMetadata
  ): void {
    this.addEvent({
      id: randomUUID(),
      timestamp: new Date(),
      type: 'incoming',
      traceId,
      method,
      path,
      statusCode,
      duration,
      metadata
    });
  }

  /**
   * Enregistre un événement d'appel sortant vers OpenPro
   */
  logOutgoingOpenPro(
    traceId: string,
    method: string,
    path: string,
    statusCode?: number,
    duration?: number,
    error?: string,
    metadata?: TrafficEventMetadata
  ): void {
    this.addEvent({
      id: randomUUID(),
      timestamp: new Date(),
      type: 'outgoing-openpro',
      traceId,
      method,
      path,
      statusCode,
      duration,
      error,
      metadata
    });
  }

  /**
   * Enregistre un événement d'appel IA
   */
  logAI(
    traceId: string,
    provider: string,
    model: string,
    duration: number,
    statusCode?: number,
    error?: string,
    tokensUsed?: { prompt?: number; completion?: number; total?: number }
  ): void {
    this.addEvent({
      id: randomUUID(),
      timestamp: new Date(),
      type: 'outgoing-ai',
      traceId,
      method: 'POST',
      path: `/ai/${provider}/${model}`,
      statusCode,
      duration,
      error,
      metadata: {
        ai: {
          provider,
          model,
          tokensUsed: tokensUsed?.total,
          promptTokens: tokensUsed?.prompt,
          completionTokens: tokensUsed?.completion
        }
      }
    });
  }

  /**
   * Ajoute un événement au ring buffer
   */
  private addEvent(event: TrafficEvent): void {
    this.events.unshift(event); // Ajouter au début (plus récent en premier)
    
    // Maintenir la limite du ring buffer
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }
  }

  /**
   * Récupère les événements récents avec filtres optionnels
   */
  getEvents(limit: number = 50, filter?: TrafficEventFilter): TrafficEvent[] {
    let filtered = this.events;

    if (filter) {
      if (filter.type) {
        filtered = filtered.filter(e => e.type === filter.type);
      }
      if (filter.traceId) {
        filtered = filtered.filter(e => e.traceId === filter.traceId);
      }
      if (filter.minDuration !== undefined) {
        filtered = filtered.filter(e => (e.duration ?? 0) >= filter.minDuration!);
      }
      if (filter.hasError !== undefined) {
        filtered = filtered.filter(e => filter.hasError ? !!e.error : !e.error);
      }
    }

    return filtered.slice(0, limit);
  }

  /**
   * Récupère tous les événements d'une trace spécifique
   */
  getTrace(traceId: string): TraceTree | null {
    const traceEvents = this.events.filter(e => e.traceId === traceId);
    
    if (traceEvents.length === 0) {
      return null;
    }

    // Trouver l'événement racine (incoming)
    const rootEvent = traceEvents.find(e => e.type === 'incoming') || traceEvents[0];
    const childEvents = traceEvents.filter(e => e !== rootEvent);

    // Calculer la durée totale
    const timestamps = traceEvents.map(e => e.timestamp.getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const totalDuration = maxTime - minTime;

    return {
      traceId,
      rootEvent,
      childEvents,
      totalDuration
    };
  }

  /**
   * Calcule les statistiques du trafic
   */
  getStats(): TrafficStats {
    const total = this.events.length;
    const errors = this.events.filter(e => !!e.error || (e.statusCode && e.statusCode >= 400)).length;
    const slowRequests = this.events.filter(e => (e.duration ?? 0) > 1000).length;
    
    const byType = {
      incoming: this.events.filter(e => e.type === 'incoming').length,
      'outgoing-openpro': this.events.filter(e => e.type === 'outgoing-openpro').length,
      'outgoing-ai': this.events.filter(e => e.type === 'outgoing-ai').length
    };

    const durations = this.events.filter(e => e.duration !== undefined).map(e => e.duration!);
    const averageDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;

    return {
      total,
      byType,
      errors,
      errorRate: total > 0 ? errors / total : 0,
      averageDuration: Math.round(averageDuration),
      slowRequests
    };
  }

  /**
   * Réinitialise tous les événements (pour tests)
   */
  clear(): void {
    this.events = [];
  }
}

// Instance singleton
export const trafficMonitor = new TrafficMonitor();

