/**
 * Routes pour les hébergements
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../../index.js';
import { jsonResponse, errorResponse } from '../../utils/cors.js';
import { getAccommodations } from '../../services/openpro/accommodationService.js';
import { createLogger } from '../../index.js';

/**
 * Enregistre les routes des hébergements
 */
export function accommodationsRoutes(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // GET /api/suppliers/:idFournisseur/accommodations
  router.get('/api/suppliers/:idFournisseur/accommodations', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur: must be a number', 400);
    }
    
    try {
      const accommodations = await getAccommodations(idFournisseur, env);
      return jsonResponse(accommodations);
    } catch (error) {
      logger.error('Error fetching accommodations', error);
      return errorResponse(
        'Failed to fetch accommodations',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });
}

