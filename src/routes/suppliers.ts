/**
 * Routes pour les fournisseurs
 * 
 * Adaptées pour Cloudflare Workers avec itty-router
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../index.js';
import { jsonResponse, errorResponse } from '../utils/cors.js';
import { getAccommodations } from '../services/openpro/accommodationService.js';
import { getSupplierData } from '../services/openpro/supplierDataService.js';
import { loadRatesForAccommodation } from '../services/openpro/rateService.js';
import { loadStockForAccommodation } from '../services/openpro/stockService.js';
import { loadRateTypes, buildRateTypesList } from '../services/openpro/rateTypeService.js';
import { transformBulkToOpenProFormat, type BulkUpdateRequest } from '../services/openpro/bulkUpdateService.js';
import { getOpenProClient } from '../services/openProClient.js';
import { createLogger } from '../index.js';

/**
 * Enregistre les routes des fournisseurs
 */
export function suppliersRouter(router: Router, env: Env, ctx: RequestContext) {
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

  // GET /api/suppliers/:idFournisseur/supplier-data
  router.get('/api/suppliers/:idFournisseur/supplier-data', async (request: IRequest) => {
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
  router.post('/api/suppliers/:idFournisseur/bulk-update', async (request: IRequest) => {
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
