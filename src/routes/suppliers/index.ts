/**
 * Routes pour les fournisseurs
 * 
 * Ce fichier agrège toutes les routes des fournisseurs et contient
 * les routes communes (supplier-data, bulk-update)
 */

import type { Router } from 'itty-router';
import type { Env, RequestContext } from '../../index.js';
import { jsonResponse, errorResponse } from '../../utils/cors.js';
import { getAccommodations } from '../../services/openpro/accommodationService.js';
import { getSupplierData } from '../../services/openpro/supplierDataService.js';
import { transformBulkToOpenProFormat, type BulkUpdateRequest } from '../../services/openpro/bulkUpdateService.js';
import { getOpenProClient } from '../../services/openProClient.js';
import { createLogger } from '../../index.js';
import { accommodationsRoutes } from './accommodations.js';
import { ratesRoutes } from './rates.js';
import { stockRoutes } from './stock.js';
import { bookingsRoutes } from './bookings.js';
import { icalRoutes } from './ical.js';

/**
 * Enregistre toutes les routes des fournisseurs
 */
export function suppliersRouter(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // Enregistrer les routes par domaine fonctionnel
  accommodationsRoutes(router, env, ctx);
  ratesRoutes(router, env, ctx);
  stockRoutes(router, env, ctx);
  bookingsRoutes(router, env, ctx);
  icalRoutes(router, env, ctx);
  
  // GET /api/suppliers/:idFournisseur/supplier-data
  router.get('/api/suppliers/:idFournisseur/supplier-data', async (request) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const url = new URL(request.url);
    const debut = url.searchParams.get('debut');
    const fin = url.searchParams.get('fin');
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur', 400);
    }
    
    if (!debut || !fin) {
      return errorResponse('Missing required query parameters: debut and fin', 400);
    }
    
    try {
      const accommodations = await getAccommodations(idFournisseur, env);
      const startDate = new Date(debut + 'T00:00:00');
      const endDate = new Date(fin + 'T23:59:59');
      
      const data = await getSupplierData(idFournisseur, accommodations, startDate, endDate, env);
      return jsonResponse(data);
    } catch (error) {
      logger.error('Error fetching supplier data', error);
      return errorResponse('Failed to fetch supplier data', 500);
    }
  });

  // POST /api/suppliers/:idFournisseur/bulk-update
  router.post('/api/suppliers/:idFournisseur/bulk-update', async (request) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur', 400);
    }
    
    let bulkData: BulkUpdateRequest;
    try {
      bulkData = await request.json() as BulkUpdateRequest;
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }
    
    if (!bulkData || !Array.isArray(bulkData.accommodations)) {
      return errorResponse('Request body must contain an accommodations array', 400);
    }
    
    try {
      logger.info('Received bulk update request', { accommodationsCount: bulkData.accommodations.length });
      
      const openProClient = getOpenProClient(env);
      
      // Traiter chaque hébergement
      for (const accommodation of bulkData.accommodations) {
        logger.info('Processing accommodation', {
          accommodationId: accommodation.idHebergement,
          datesCount: accommodation.dates.length
        });
        
        const requeteTarif = transformBulkToOpenProFormat(accommodation);
        
        if (requeteTarif !== null && requeteTarif.tarifs.length > 0) {
          logger.info('Calling OpenPro API setRates', {
            accommodationId: accommodation.idHebergement,
            tarifsCount: requeteTarif.tarifs.length
          });
          
          await openProClient.setRates(
            idFournisseur,
            accommodation.idHebergement,
            requeteTarif
          );
          
          logger.info('Successfully called OpenPro API setRates', {
            accommodationId: accommodation.idHebergement
          });
        } else {
          logger.warn('Skipping accommodation: no valid tarifs to update', {
            accommodationId: accommodation.idHebergement
          });
        }
      }
      
      return jsonResponse({ success: true });
    } catch (error) {
      logger.error('Error saving bulk updates', error);
      return errorResponse(
        'Failed to save bulk updates',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });
}

