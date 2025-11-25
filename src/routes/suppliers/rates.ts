/**
 * Routes pour les tarifs et types de tarifs
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../../index.js';
import { jsonResponse, errorResponse } from '../../utils/cors.js';
import { loadRatesForAccommodation } from '../../services/openpro/rateService.js';
import { loadRateTypes, buildRateTypesList } from '../../services/openpro/rateTypeService.js';
import { getAccommodations } from '../../services/openpro/accommodationService.js';
import { createLogger } from '../../index.js';

/**
 * Enregistre les routes des tarifs
 */
export function ratesRoutes(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rates
  router.get('/api/suppliers/:idFournisseur/accommodations/:idHebergement/rates', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idHebergement = parseInt(request.params!.idHebergement, 10);
    const url = new URL(request.url);
    const debut = url.searchParams.get('debut');
    const fin = url.searchParams.get('fin');
    
    if (isNaN(idFournisseur) || isNaN(idHebergement)) {
      return errorResponse('Invalid parameters: idFournisseur and idHebergement must be numbers', 400);
    }
    
    if (!debut || !fin) {
      return errorResponse('Missing required query parameters: debut and fin (format: YYYY-MM-DD)', 400);
    }
    
    try {
      const discoveredRateTypes = new Map();
      const ratesData = await loadRatesForAccommodation(
        idFournisseur,
        idHebergement,
        debut,
        fin,
        discoveredRateTypes,
        env
      );
      return jsonResponse(ratesData);
    } catch (error) {
      logger.error('Error fetching rates', error);
      return errorResponse(
        'Failed to fetch rates',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/suppliers/:idFournisseur/rate-types
  router.get('/api/suppliers/:idFournisseur/rate-types', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur', 400);
    }
    
    try {
      const accommodations = await getAccommodations(idFournisseur, env);
      const discoveredRateTypes = await loadRateTypes(idFournisseur, accommodations, env);
      const { rateTypeLabels, rateTypesList } = buildRateTypesList(discoveredRateTypes);
      
      return jsonResponse({
        rateTypeLabels,
        rateTypesList
      });
    } catch (error) {
      logger.error('Error fetching rate types', error);
      return errorResponse('Failed to fetch rate types', 500);
    }
  });
}

