/**
 * Client OpenPro API pour Workers
 * 
 * Ce fichier crée et exporte une fonction pour obtenir une instance du client OpenPro
 * configurée avec les credentials depuis les variables d'environnement Workers.
 */

import { createOpenProClient } from '../../openpro-api-react/src/client/index.js';
import type { Env } from '../index.js';

/**
 * Crée une instance du client OpenPro avec les credentials de l'environnement
 * 
 * @param env - Variables d'environnement Workers
 * @returns Instance du client OpenPro configurée
 */
export function getOpenProClient(env: Env) {
  return createOpenProClient('admin', {
    baseUrl: env.OPENPRO_BASE_URL,
    apiKey: env.OPENPRO_API_KEY
  });
}
