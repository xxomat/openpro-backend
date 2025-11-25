/**
 * Routes pour le stock
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../../index.js';
import { jsonResponse, errorResponse } from '../../utils/cors.js';
import { loadStockForAccommodation } from '../../services/openpro/stockService.js';
import { getOpenProClient } from '../../services/openProClient.js';
import { createLogger } from '../../index.js';

/**
 * Enregistre les routes du stock
 */
export function stockRoutes(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock
  router.get('/api/suppliers/:idFournisseur/accommodations/:idHebergement/stock', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idHebergement = parseInt(request.params!.idHebergement, 10);
    const url = new URL(request.url);
    const debut = url.searchParams.get('debut');
    const fin = url.searchParams.get('fin');
    
    if (isNaN(idFournisseur) || isNaN(idHebergement)) {
      return errorResponse('Invalid parameters', 400);
    }
    
    if (!debut || !fin) {
      return errorResponse('Missing required query parameters: debut and fin', 400);
    }
    
    try {
      const stock = await loadStockForAccommodation(idFournisseur, idHebergement, debut, fin, env);
      return jsonResponse(stock);
    } catch (error) {
      logger.error('Error fetching stock', error);
      return errorResponse('Failed to fetch stock', 500);
    }
  });

  // POST /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock
  router.post('/api/suppliers/:idFournisseur/accommodations/:idHebergement/stock', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idHebergement = parseInt(request.params!.idHebergement, 10);
    
    if (isNaN(idFournisseur) || isNaN(idHebergement)) {
      return errorResponse('Invalid parameters: idFournisseur and idHebergement must be numbers', 400);
    }
    
    let stockPayload: { jours: Array<{ date: string; dispo: number }> };
    try {
      stockPayload = await request.json() as { jours: Array<{ date: string; dispo: number }> };
    } catch (error) {
      return errorResponse('Invalid JSON in request body', 400);
    }
    
    if (!stockPayload || !Array.isArray(stockPayload.jours)) {
      return errorResponse('Invalid payload: must contain a "jours" array', 400);
    }
    
    if (stockPayload.jours.length === 0) {
      return errorResponse('Invalid payload: "jours" array must not be empty', 400);
    }
    
    // Valider le format des dates
    for (const jour of stockPayload.jours) {
      if (!jour.date || typeof jour.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(jour.date)) {
        return errorResponse(`Invalid date format: ${jour.date}. Expected format: YYYY-MM-DD`, 400);
      }
      if (typeof jour.dispo !== 'number' || jour.dispo < 0) {
        return errorResponse(`Invalid dispo value: ${jour.dispo}. Expected a non-negative number`, 400);
      }
    }
    
    try {
      const openProClient = getOpenProClient(env);
      await openProClient.updateStock(idFournisseur, idHebergement, stockPayload);
      
      logger.info(`Updated stock for supplier ${idFournisseur}, accommodation ${idHebergement}, ${stockPayload.jours.length} days`);
      return jsonResponse({ success: true, updated: stockPayload.jours.length });
    } catch (error) {
      logger.error('Error updating stock', error);
      return errorResponse(
        'Failed to update stock',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });
}

