/**
 * Client OpenPro API
 * 
 * Ce fichier crée et exporte une instance unique du client OpenPro
 * configurée avec les credentials depuis les variables d'environnement.
 */

import { createOpenProClient } from '../../openpro-api-react/src/client/index.js';
import { config } from '../config/env.js';

/**
 * Instance unique du client OpenPro configurée avec le rôle 'admin'
 * 
 * Cette instance est utilisée par tous les services pour communiquer
 * avec l'API OpenPro. L'API key est stockée côté serveur et n'est
 * jamais exposée au frontend.
 */
export const openProClient = createOpenProClient('admin', {
  baseUrl: config.OPENPRO_BASE_URL,
  apiKey: config.OPENPRO_API_KEY
});

