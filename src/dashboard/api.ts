/**
 * API client pour le dashboard de monitoring
 */

import type { TrafficEvent, TrafficStats, TraceTree, TrafficEventType } from './types';

const API_BASE = '/api/traffic';

export interface FetchEventsOptions {
  limit?: number;
  type?: TrafficEventType;
  traceId?: string;
  minDuration?: number;
  hasError?: boolean;
}

export async function fetchEvents(options?: FetchEventsOptions): Promise<TrafficEvent[]> {
  const params = new URLSearchParams();
  
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.type) params.set('type', options.type);
  if (options?.traceId) params.set('traceId', options.traceId);
  if (options?.minDuration) params.set('minDuration', String(options.minDuration));
  if (options?.hasError !== undefined) params.set('hasError', String(options.hasError));
  
  const query = params.toString();
  const url = `${API_BASE}/events${query ? '?' + query : ''}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.events || [];
}

export async function fetchStats(): Promise<TrafficStats> {
  const response = await fetch(`${API_BASE}/stats`);
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }
  
  return response.json();
}

export async function fetchTrace(traceId: string): Promise<TraceTree | null> {
  const response = await fetch(`${API_BASE}/trace/${traceId}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch trace: ${response.statusText}`);
  }
  
  return response.json();
}

export async function clearEvents(): Promise<void> {
  const response = await fetch(`${API_BASE}/events`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    throw new Error(`Failed to clear events: ${response.statusText}`);
  }
}

