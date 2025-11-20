/**
 * Client OpenPro API
 * 
 * Ce fichier crée et exporte une instance unique du client OpenPro
 * configurée avec les credentials depuis les variables d'environnement.
 * 
 * Le client est wrappé pour tracer automatiquement tous les appels sortants
 * vers l'API OpenPro pour le monitoring du trafic.
 */

import { createOpenProClient } from '../../../openpro-api-react/src/client/index.js';
import { config } from '../config/env.js';
import { getTraceId } from './correlationContext.js';
import { trafficMonitor } from './trafficMonitor.js';
import { randomUUID } from 'crypto';

/**
 * Wrap le client OpenPro pour tracer automatiquement tous les appels
 */
function createTrackedClient<T extends object>(client: T, baseUrl: string): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      
      // Si ce n'est pas une fonction, retourner tel quel
      if (typeof original !== 'function') {
        return original;
      }
      
      // Wrapper la fonction pour tracer l'appel
      return async function (...args: any[]) {
        const traceId = getTraceId() || randomUUID();
        const startTime = Date.now();
        const methodName = String(prop);
        
        // Extraire les IDs des arguments pour le metadata
        const idFournisseur = args[0];
        const idHebergement = args[1];
        
        try {
          const result = await original.apply(target, args);
          const duration = Date.now() - startTime;
          
          trafficMonitor.logOutgoingOpenPro(
            traceId,
            'GET/POST', // Nous ne connaissons pas la méthode HTTP exacte depuis ici
            `${baseUrl}/${methodName}`,
            200, // Assume success si pas d'erreur
            duration,
            undefined,
            {
              openpro: {
                idFournisseur: typeof idFournisseur === 'number' ? idFournisseur : undefined,
                idHebergement: typeof idHebergement === 'number' ? idHebergement : undefined,
                endpoint: methodName
              }
            }
          );
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          trafficMonitor.logOutgoingOpenPro(
            traceId,
            'GET/POST',
            `${baseUrl}/${methodName}`,
            undefined,
            duration,
            errorMessage,
            {
              openpro: {
                idFournisseur: typeof idFournisseur === 'number' ? idFournisseur : undefined,
                idHebergement: typeof idHebergement === 'number' ? idHebergement : undefined,
                endpoint: methodName
              }
            }
          );
          
          throw error;
        }
      };
    }
  });
}

/**
 * Instance unique du client OpenPro configurée avec le rôle 'admin'
 * 
 * Cette instance est utilisée par tous les services pour communiquer
 * avec l'API OpenPro. L'API key est stockée côté serveur et n'est
 * jamais exposée au frontend.
 * 
 * Le client est automatiquement wrappé pour tracer tous les appels.
 */
const rawClient = createOpenProClient('admin', {
  baseUrl: config.OPENPRO_BASE_URL,
  apiKey: config.OPENPRO_API_KEY
});

export const openProClient = createTrackedClient(rawClient, config.OPENPRO_BASE_URL);

