/**
 * Service de gestion du cache iCal avec historique
 * 
 * Ce service gère le stockage et la récupération des fichiers iCal dans Cloudflare KV,
 * avec conservation d'un historique des 10 dernières versions pour le debugging.
 */

import type { Env } from '../../index.js';

const MAX_HISTORY_VERSIONS = 10;

/**
 * Construit la clé de cache principale pour un fournisseur
 */
function getCacheKey(idFournisseur: number, filters?: { debut?: string; fin?: string; idHebergement?: number }): string {
  let key = `ical:supplier:${idFournisseur}`;
  
  if (filters?.debut) key += `:debut:${filters.debut}`;
  if (filters?.fin) key += `:fin:${filters.fin}`;
  if (filters?.idHebergement) key += `:hebergement:${filters.idHebergement}`;
  
  return `${key}:current`;
}

/**
 * Construit la clé d'historique pour un fournisseur avec timestamp
 */
function getHistoryKey(idFournisseur: number, timestamp: string, filters?: { debut?: string; fin?: string; idHebergement?: number }): string {
  let key = `ical:supplier:${idFournisseur}`;
  
  if (filters?.debut) key += `:debut:${filters.debut}`;
  if (filters?.fin) key += `:fin:${filters.fin}`;
  if (filters?.idHebergement) key += `:hebergement:${filters.idHebergement}`;
  
  return `${key}:history:${timestamp}`;
}

/**
 * Construit le préfixe pour lister toutes les clés d'historique d'un fournisseur
 */
function getHistoryPrefix(idFournisseur: number, filters?: { debut?: string; fin?: string; idHebergement?: number }): string {
  let prefix = `ical:supplier:${idFournisseur}`;
  
  if (filters?.debut) prefix += `:debut:${filters.debut}`;
  if (filters?.fin) prefix += `:fin:${filters.fin}`;
  if (filters?.idHebergement) prefix += `:hebergement:${filters.idHebergement}`;
  
  return `${prefix}:history:`;
}

/**
 * Récupère le fichier iCal depuis le cache
 */
export async function getCachedIcal(
  idFournisseur: number,
  env: Env,
  filters?: { debut?: string; fin?: string; idHebergement?: number }
): Promise<string | null> {
  const key = getCacheKey(idFournisseur, filters);
  return await env.ICAL_CACHE.get(key);
}

/**
 * Met à jour le cache iCal et conserve l'historique
 */
export async function updateIcalCache(
  idFournisseur: number,
  icalContent: string,
  env: Env,
  filters?: { debut?: string; fin?: string; idHebergement?: number }
): Promise<void> {
  const timestamp = new Date().toISOString();
  const currentKey = getCacheKey(idFournisseur, filters);
  
  // 1. Sauvegarder la version actuelle dans l'historique (si elle existe)
  const current = await env.ICAL_CACHE.get(currentKey);
  if (current) {
    const historyKey = getHistoryKey(idFournisseur, timestamp, filters);
    await env.ICAL_CACHE.put(historyKey, current);
  }
  
  // 2. Mettre à jour la version actuelle
  await env.ICAL_CACHE.put(currentKey, icalContent);
  
  // 3. Nettoyer l'historique (garder seulement les MAX_HISTORY_VERSIONS dernières)
  await cleanupHistory(idFournisseur, env, filters);
}

/**
 * Nettoie l'historique en gardant seulement les MAX_HISTORY_VERSIONS dernières versions
 */
async function cleanupHistory(
  idFournisseur: number,
  env: Env,
  filters?: { debut?: string; fin?: string; idHebergement?: number }
): Promise<void> {
  const prefix = getHistoryPrefix(idFournisseur, filters);
  
  // Lister toutes les clés d'historique
  // Note: KV ne supporte pas nativement le listage, on doit utiliser list() avec le prefix
  const listResult = await env.ICAL_CACHE.list({ prefix });
  
  if (!listResult.keys || listResult.keys.length <= MAX_HISTORY_VERSIONS) {
    return; // Pas besoin de nettoyer si on a moins de MAX_HISTORY_VERSIONS versions
  }
  
  // Trier par timestamp (dans le nom de la clé) - plus récent en premier
  const sortedKeys = listResult.keys
    .map(key => ({
      name: key.name,
      timestamp: extractTimestampFromKey(key.name)
    }))
    .filter(item => item.timestamp !== null)
    .sort((a, b) => {
      // Trier par timestamp décroissant (plus récent en premier)
      return (b.timestamp as string).localeCompare(a.timestamp as string);
    });
  
  // Supprimer les versions au-delà de MAX_HISTORY_VERSIONS
  const keysToDelete = sortedKeys.slice(MAX_HISTORY_VERSIONS);
  for (const key of keysToDelete) {
    await env.ICAL_CACHE.delete(key.name);
  }
}

/**
 * Extrait le timestamp d'une clé d'historique
 */
function extractTimestampFromKey(key: string): string | null {
  const match = key.match(/history:([^:]+)$/);
  return match ? match[1] : null;
}

/**
 * Récupère l'historique des versions du fichier iCal
 */
export async function getIcalHistory(
  idFournisseur: number,
  env: Env,
  filters?: { debut?: string; fin?: string; idHebergement?: number }
): Promise<Array<{ timestamp: string; size: number }>> {
  const prefix = getHistoryPrefix(idFournisseur, filters);
  const currentKey = getCacheKey(idFournisseur, filters);
  
  // Récupérer la version actuelle
  const current = await env.ICAL_CACHE.get(currentKey);
  
  const history: Array<{ timestamp: string; size: number }> = [];
  
  // Ajouter la version actuelle si elle existe (avec timestamp "current")
  if (current) {
    history.push({
      timestamp: 'current',
      size: new TextEncoder().encode(current).length
    });
  }
  
  // Lister toutes les clés d'historique
  const listResult = await env.ICAL_CACHE.list({ prefix });
  
  // Ajouter les versions historiques
  if (listResult.keys) {
    for (const key of listResult.keys) {
      const timestamp = extractTimestampFromKey(key.name);
      if (timestamp) {
        const value = await env.ICAL_CACHE.get(key.name);
        if (value) {
          history.push({
            timestamp,
            size: new TextEncoder().encode(value).length
          });
        }
      }
    }
  }
  
  // Trier par timestamp décroissant (plus récent en premier)
  // "current" est considéré comme le plus récent
  return history.sort((a, b) => {
    if (a.timestamp === 'current') return -1;
    if (b.timestamp === 'current') return 1;
    return b.timestamp.localeCompare(a.timestamp);
  });
}

/**
 * Invalide le cache iCal pour un fournisseur (supprime la version actuelle et l'historique)
 * Utile lors de la suppression de toutes les réservations ou d'une réinitialisation
 */
export async function invalidateIcalCache(
  idFournisseur: number,
  env: Env,
  filters?: { debut?: string; fin?: string; idHebergement?: number }
): Promise<void> {
  const currentKey = getCacheKey(idFournisseur, filters);
  const prefix = getHistoryPrefix(idFournisseur, filters);
  
  // Supprimer la version actuelle
  await env.ICAL_CACHE.delete(currentKey);
  
  // Supprimer tout l'historique
  const listResult = await env.ICAL_CACHE.list({ prefix });
  if (listResult.keys) {
    for (const key of listResult.keys) {
      await env.ICAL_CACHE.delete(key.name);
    }
  }
}

