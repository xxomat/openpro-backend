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
        
        // Construire le path réel de l'endpoint selon la méthode
        let endpointPath = methodName;
        if (methodName === 'setRates' && typeof idFournisseur === 'number' && typeof idHebergement === 'number') {
          endpointPath = `/fournisseur/${idFournisseur}/hebergements/${idHebergement}/typetarifs/tarif`;
        } else if (methodName === 'getRates' && typeof idFournisseur === 'number' && typeof idHebergement === 'number') {
          endpointPath = `/fournisseur/${idFournisseur}/hebergements/${idHebergement}/typetarifs/tarif`;
        } else if (methodName === 'getStock' && typeof idFournisseur === 'number' && typeof idHebergement === 'number') {
          endpointPath = `/fournisseur/${idFournisseur}/hebergements/${idHebergement}/stock`;
        } else if (methodName === 'updateStock' && typeof idFournisseur === 'number' && typeof idHebergement === 'number') {
          endpointPath = `/fournisseur/${idFournisseur}/hebergements/${idHebergement}/stock`;
        } else if (methodName === 'listAccommodations' && typeof idFournisseur === 'number') {
          endpointPath = `/fournisseur/${idFournisseur}/hebergements`;
        } else if (methodName === 'listRateTypes' && typeof idFournisseur === 'number') {
          endpointPath = `/fournisseur/${idFournisseur}/typetarifs`;
        } else if (methodName === 'listBookings' && typeof idFournisseur === 'number') {
          endpointPath = `/fournisseur/${idFournisseur}/dossiers`;
        } else if (methodName === 'getBooking' && typeof idFournisseur === 'number' && typeof args[1] === 'number') {
          endpointPath = `/fournisseur/${idFournisseur}/dossiers/${args[1]}`;
        }
        
        // Déterminer la méthode HTTP selon le nom de la méthode
        let httpMethod = 'GET';
        if (methodName.includes('set') || methodName.includes('update') || methodName.includes('create') || methodName.includes('add') || methodName.includes('link')) {
          httpMethod = 'POST';
        } else if (methodName.includes('delete') || methodName.includes('unlink')) {
          httpMethod = 'DELETE';
        } else if (methodName.includes('update') && methodName.includes('RateType')) {
          httpMethod = 'PUT';
        }
        
        try {
          const result = await original.apply(target, args);
          const duration = Date.now() - startTime;
          
          trafficMonitor.logOutgoingOpenPro(
            traceId,
            httpMethod,
            `${baseUrl}${endpointPath}`,
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
          
          // Essayer d'extraire le status code de l'erreur si c'est une OpenProHttpError
          let statusCode: number | undefined = undefined;
          if (error && typeof error === 'object' && 'statusCode' in error) {
            statusCode = error.statusCode as number;
          }
          
          trafficMonitor.logOutgoingOpenPro(
            traceId,
            httpMethod,
            `${baseUrl}${endpointPath}`,
            statusCode,
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

