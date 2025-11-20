/**
 * Service de contexte de corrélation pour propager le traceId
 * à travers les appels asynchrones
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

interface CorrelationContext {
  traceId: string;
  startTime: number;
}

const asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>();

/**
 * Exécute une fonction dans un contexte de corrélation avec un traceId
 */
export function runWithTrace<T>(fn: () => T): T {
  const traceId = randomUUID();
  const context: CorrelationContext = {
    traceId,
    startTime: Date.now()
  };
  
  return asyncLocalStorage.run(context, fn);
}

/**
 * Récupère le traceId du contexte actuel
 */
export function getTraceId(): string | undefined {
  return asyncLocalStorage.getStore()?.traceId;
}

/**
 * Récupère le timestamp de début du contexte actuel
 */
export function getStartTime(): number | undefined {
  return asyncLocalStorage.getStore()?.startTime;
}

/**
 * Définit un nouveau traceId dans le contexte actuel
 * (utile pour propager un traceId existant)
 */
export function setTraceContext(traceId: string, startTime: number): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.traceId = traceId;
    store.startTime = startTime;
  }
}

/**
 * Exécute une fonction dans le contexte de corrélation existant
 * ou en crée un nouveau si nécessaire
 */
export function ensureTrace<T>(fn: () => T): T {
  const existing = asyncLocalStorage.getStore();
  if (existing) {
    return fn();
  }
  return runWithTrace(fn);
}

