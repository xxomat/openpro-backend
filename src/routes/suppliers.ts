/**
 * Routes pour les fournisseurs
 * 
 * Adaptées pour Cloudflare Workers avec itty-router
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../index.js';
import { jsonResponse, errorResponse } from '../utils/cors.js';
import { loadAllAccommodations, loadAccommodation, findAccommodationByOpenProId } from '../services/openpro/accommodationService.js';
import { getSupplierData } from '../services/openpro/supplierDataService.js';
import { loadRatesForAccommodation } from '../services/openpro/rateService.js';
import { loadStockForAccommodation } from '../services/openpro/stockService.js';
import { loadRateTypes, buildRateTypesList } from '../services/openpro/rateTypeService.js';
import { transformBulkToOpenProFormat, type BulkUpdateRequest } from '../services/openpro/bulkUpdateService.js';
import { getOpenProClient } from '../services/openProClient.js';
import { createLogger } from '../index.js';
import { createLocalBooking, deleteLocalBooking, loadAllBookings } from '../services/openpro/localBookingService.js';
import { syncBookingToStub } from '../services/openpro/stubSyncService.js';
import type { IApiTarif } from '../types/apiTypes.js';
import type { TypeTarifModif } from '@openpro-api-react/client/types.js';
import { SUPPLIER_ID } from '../config/supplier.js';
import { saveRateType, deleteRateType, linkRateTypeToAccommodation, unlinkRateTypeFromAccommodation, loadAccommodationRateTypeLinks } from '../services/openpro/rateTypeDbService.js';
import { saveAccommodationStock, saveAccommodationData, exportAccommodationDataToOpenPro } from '../services/openpro/accommodationDataService.js';

/**
 * Enregistre les routes des fournisseurs
 */
export function suppliersRouter(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // GET /api/suppliers/:idFournisseur/accommodations
  router.get('/api/suppliers/:idFournisseur/accommodations', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    try {
      const accommodations = await loadAllAccommodations(env);
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

  // GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rates/details
  router.get('/api/suppliers/:idFournisseur/accommodations/:idHebergement/rates/details', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idHebergement = parseInt(request.params!.idHebergement, 10);
    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    const rateTypeIdParam = url.searchParams.get('rateTypeId');
    
    if (isNaN(idFournisseur) || isNaN(idHebergement)) {
      return errorResponse('Invalid parameters: idFournisseur and idHebergement must be numbers', 400);
    }
    
    if (!date) {
      return errorResponse('Missing required query parameter: date (format: YYYY-MM-DD)', 400);
    }
    
    if (!rateTypeIdParam) {
      return errorResponse('Missing required query parameter: rateTypeId', 400);
    }
    
    const rateTypeId = parseInt(rateTypeIdParam, 10);
    if (isNaN(rateTypeId)) {
      return errorResponse('Invalid rateTypeId: must be a number', 400);
    }
    
    try {
      const openProClient = getOpenProClient(env);
      const rates = await openProClient.getRates(idFournisseur, idHebergement);
      
      // Transformer la réponse avec class-transformer
      const dataToTransform = (rates && typeof rates === 'object' && 'data' in rates && rates.data) 
        ? rates.data 
        : rates;
      
      const { transformRatesResponse } = await import('../utils/transformers.js');
      const apiResponse = transformRatesResponse(dataToTransform);
      const tarifs = apiResponse.rates ?? apiResponse.periods ?? [];
      
      // Trouver le tarif correspondant à la date et au type de tarif
      const dateObj = new Date(date + 'T00:00:00');
      const matchingTarif = tarifs.find((tarif: IApiTarif) => {
        const tarifRateTypeId = tarif.rateTypeId ?? tarif?.rateType?.rateTypeId;
        if (Number(tarifRateTypeId) !== rateTypeId) {
          return false;
        }
        
        const deb = String(tarif.startDate ?? tarif.startDateAlt ?? '').trim();
        const fe = String(
          tarif.endDate ?? 
          tarif.endDateAlt ?? 
          (tarif as any)['fin'] ?? 
          (tarif as any)['fin '] ?? 
          ''
        ).trim();
        
        if (!deb || !fe) {
          return false;
        }
        
        const startD = new Date(deb + 'T00:00:00');
        const endD = new Date(fe + 'T23:59:59');
        
        return dateObj >= startD && dateObj <= endD;
      });
      
      if (!matchingTarif) {
        return errorResponse('No rate found for the specified date and rate type', 404);
      }
      
      // Retourner le tarif sans les champs debut et fin
      const { startDate, startDateAlt, endDate, endDateAlt, ...tarifWithoutDates } = matchingTarif;
      const result = { ...tarifWithoutDates };
      
      // Nettoyer les propriétés 'fin' et 'fin ' si elles existent
      if ('fin' in result) {
        delete (result as any).fin;
      }
      if ('fin ' in result) {
        delete (result as any)['fin '];
      }
      
      return jsonResponse(result);
    } catch (error) {
      logger.error('Error fetching rate details', error);
      return errorResponse(
        'Failed to fetch rate details',
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

  // POST /api/suppliers/:idFournisseur/accommodations/:idHebergement/stock
  router.post('/api/suppliers/:idFournisseur/accommodations/:idHebergement/stock', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idHebergementParam = request.params!.idHebergement;
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    // idHebergement peut être un nombre (OpenPro ID) ou une string (DB ID)
    // Essayer de trouver l'hébergement
    let accommodationId: string;
    let idOpenPro: number;
    
    if (!isNaN(parseInt(idHebergementParam, 10))) {
      // C'est un ID OpenPro (nombre)
      idOpenPro = parseInt(idHebergementParam, 10);
      const accommodation = await findAccommodationByOpenProId(idOpenPro, env);
      if (!accommodation) {
        return errorResponse(`Accommodation with OpenPro ID ${idOpenPro} not found`, 404);
      }
      accommodationId = accommodation.id;
    } else {
      // C'est un ID DB (string)
      accommodationId = idHebergementParam;
      const accommodation = await loadAccommodation(accommodationId, env);
      if (!accommodation) {
        return errorResponse(`Accommodation with ID ${accommodationId} not found`, 404);
      }
      if (!accommodation.ids.OpenPro) {
        return errorResponse(`Accommodation ${accommodationId} has no OpenPro ID`, 400);
      }
      idOpenPro = parseInt(accommodation.ids.OpenPro, 10);
      if (isNaN(idOpenPro)) {
        return errorResponse(`Invalid OpenPro ID for accommodation ${accommodationId}`, 400);
      }
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
      // Sauvegarder en DB
      for (const jour of stockPayload.jours) {
        await saveAccommodationStock(accommodationId, jour.date, jour.dispo, env);
      }
      
      logger.info(`Saved stock to DB for accommodation ${accommodationId}, ${stockPayload.jours.length} days`);
      
      // Exporter vers OpenPro
      const openProClient = getOpenProClient(env);
      await openProClient.updateStock(SUPPLIER_ID, idOpenPro, stockPayload);
      
      logger.info(`Exported stock to OpenPro for supplier ${SUPPLIER_ID}, accommodation ${idOpenPro}, ${stockPayload.jours.length} days`);
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

  // GET /api/suppliers/:idFournisseur/rate-types
  router.get('/api/suppliers/:idFournisseur/rate-types', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    try {
      // Charger depuis la DB en priorité, puis compléter avec OpenPro si nécessaire
      const { loadRateTypes } = await import('../services/openpro/rateTypeDbService.js');
      const dbRateTypes = await loadRateTypes(env);
      
      // Si on a des rate types en DB, les retourner
      if (dbRateTypes.length > 0) {
        return jsonResponse({
          typeTarifs: dbRateTypes.map(rt => ({
            idTypeTarif: rt.rateTypeId,
            libelle: rt.label,
            description: rt.descriptionFr ? { fr: rt.descriptionFr } : undefined,
            ordre: rt.order
          }))
        });
      }
      
      // Sinon, charger depuis OpenPro (pour compatibilité)
      const openProClient = getOpenProClient(env);
      const allRateTypesResponse = await openProClient.listRateTypes(SUPPLIER_ID);
      
      logger.info('Raw response from OpenPro API:', JSON.stringify(allRateTypesResponse, null, 2));
      
      // Adapter le format de réponse pour correspondre à ce que le frontend attend
      const apiRateTypesResponse = allRateTypesResponse as unknown as { typeTarifs?: unknown[] };
      const rawTypeTarifs = apiRateTypesResponse.typeTarifs || [];
      
      logger.info(`Found ${rawTypeTarifs.length} raw rate types`);
      
      // Normaliser la structure : l'API OpenPro peut retourner cleTypeTarif.idTypeTarif ou idTypeTarif directement
      const typeTarifs = rawTypeTarifs.map((rt: any) => {
        const idTypeTarif = rt.cleTypeTarif?.idTypeTarif ?? rt.idTypeTarif;
        // Ne garder que les champs nécessaires, sans cleTypeTarif
        return {
          idTypeTarif: Number(idTypeTarif),
          libelle: rt.libelle,
          description: rt.description,
          ordre: rt.ordre != null ? Number(rt.ordre) : undefined
        };
      }).filter((rt: any) => {
        const isValid = rt.idTypeTarif != null && !isNaN(rt.idTypeTarif);
        if (!isValid) {
          logger.warn(`Filtered out invalid rate type:`, JSON.stringify(rt, null, 2));
        }
        return isValid;
      });
      
      logger.info(`Returning ${typeTarifs.length} normalized rate types`);
      
      return jsonResponse({
        typeTarifs
      });
    } catch (error) {
      logger.error('Error fetching rate types', error);
      return errorResponse(
        'Failed to fetch rate types',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/suppliers/:idFournisseur/rate-types
  router.post('/api/suppliers/:idFournisseur/rate-types', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    let payload: { typeTarifModif: TypeTarifModif };
    try {
      payload = await request.json() as { typeTarifModif: TypeTarifModif };
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }
    
    if (!payload || !payload.typeTarifModif) {
      return errorResponse('Request body must contain typeTarifModif', 400);
    }
    
    try {
      // Créer dans OpenPro d'abord (pour obtenir l'ID)
      const openProClient = getOpenProClient(env);
      const result = await openProClient.createRateType(SUPPLIER_ID, payload.typeTarifModif);
      
      // Extraire l'ID du plan tarifaire créé
      const idTypeTarif = (result as any)?.idTypeTarif || (result as any)?.data?.idTypeTarif;
      if (!idTypeTarif) {
        logger.warn('Could not extract idTypeTarif from OpenPro response, skipping DB save');
        return jsonResponse(result);
      }
      
      // Sauvegarder en DB
      await saveRateType({
        idTypeTarif: Number(idTypeTarif),
        libelle: payload.typeTarifModif.libelle ? JSON.stringify(payload.typeTarifModif.libelle) : undefined,
        description: payload.typeTarifModif.description ? JSON.stringify(payload.typeTarifModif.description) : undefined,
        ordre: payload.typeTarifModif.ordre
      }, env);
      
      logger.info(`Saved rate type ${idTypeTarif} to DB`);
      return jsonResponse(result);
    } catch (error) {
      logger.error('Error creating rate type', error);
      return errorResponse(
        'Failed to create rate type',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // PUT /api/suppliers/:idFournisseur/rate-types/:idTypeTarif
  router.put('/api/suppliers/:idFournisseur/rate-types/:idTypeTarif', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idTypeTarif = parseInt(request.params!.idTypeTarif, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    if (isNaN(idTypeTarif)) {
      return errorResponse('Invalid idTypeTarif', 400);
    }
    
    let payload: { typeTarifModif: TypeTarifModif };
    try {
      payload = await request.json() as { typeTarifModif: TypeTarifModif };
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }
    
    if (!payload || !payload.typeTarifModif) {
      return errorResponse('Request body must contain typeTarifModif', 400);
    }
    
    try {
      // Mettre à jour dans OpenPro
      const openProClient = getOpenProClient(env);
      await openProClient.updateRateType(SUPPLIER_ID, idTypeTarif, payload.typeTarifModif);
      
      // Mettre à jour en DB
      await saveRateType({
        idTypeTarif,
        libelle: payload.typeTarifModif.libelle ? JSON.stringify(payload.typeTarifModif.libelle) : undefined,
        description: payload.typeTarifModif.description ? JSON.stringify(payload.typeTarifModif.description) : undefined,
        ordre: payload.typeTarifModif.ordre
      }, env);
      
      logger.info(`Updated rate type ${idTypeTarif} in DB and OpenPro`);
      return jsonResponse({ success: true });
    } catch (error) {
      logger.error('Error updating rate type', error);
      return errorResponse(
        'Failed to update rate type',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // DELETE /api/suppliers/:idFournisseur/rate-types/:idTypeTarif
  router.delete('/api/suppliers/:idFournisseur/rate-types/:idTypeTarif', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idTypeTarif = parseInt(request.params!.idTypeTarif, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    if (isNaN(idTypeTarif)) {
      return errorResponse('Invalid idTypeTarif', 400);
    }
    
    try {
      // Supprimer dans OpenPro
      const openProClient = getOpenProClient(env);
      await openProClient.deleteRateType(SUPPLIER_ID, idTypeTarif);
      
      // Supprimer en DB
      await deleteRateType(idTypeTarif, env);
      
      logger.info(`Deleted rate type ${idTypeTarif} from DB and OpenPro`);
      return jsonResponse({ success: true });
    } catch (error) {
      logger.error('Error deleting rate type', error);
      return errorResponse(
        'Failed to delete rate type',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/suppliers/:idFournisseur/accommodations/:idHebergement/rate-type-links
  router.get('/api/suppliers/:idFournisseur/accommodations/:idHebergement/rate-type-links', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idHebergement = parseInt(request.params!.idHebergement, 10);
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur', 400);
    }
    
    if (isNaN(idHebergement)) {
      return errorResponse('Invalid idHebergement', 400);
    }
    
    try {
      const openProClient = getOpenProClient(env);
      const result = await openProClient.listAccommodationRateTypeLinks(idFournisseur, idHebergement);
      return jsonResponse(result);
    } catch (error) {
      logger.error('Error fetching accommodation rate type links', error);
      return errorResponse(
        'Failed to fetch accommodation rate type links',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/suppliers/:idFournisseur/accommodations/:idHebergement/rate-type-links/:idTypeTarif
  router.post('/api/suppliers/:idFournisseur/accommodations/:idHebergement/rate-type-links/:idTypeTarif', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idHebergementParam = request.params!.idHebergement;
    const idTypeTarif = parseInt(request.params!.idTypeTarif, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    if (isNaN(idTypeTarif)) {
      return errorResponse('Invalid idTypeTarif', 400);
    }
    
    // Trouver l'hébergement
    let accommodationId: string;
    let idOpenPro: number;
    
    if (!isNaN(parseInt(idHebergementParam, 10))) {
      // C'est un ID OpenPro (nombre)
      idOpenPro = parseInt(idHebergementParam, 10);
      const accommodation = await findAccommodationByOpenProId(idOpenPro, env);
      if (!accommodation) {
        return errorResponse(`Accommodation with OpenPro ID ${idOpenPro} not found`, 404);
      }
      accommodationId = accommodation.id;
    } else {
      // C'est un ID DB (string)
      accommodationId = idHebergementParam;
      const accommodation = await loadAccommodation(accommodationId, env);
      if (!accommodation) {
        return errorResponse(`Accommodation with ID ${accommodationId} not found`, 404);
      }
      if (!accommodation.ids.OpenPro) {
        return errorResponse(`Accommodation ${accommodationId} has no OpenPro ID`, 400);
      }
      idOpenPro = parseInt(accommodation.ids.OpenPro, 10);
      if (isNaN(idOpenPro)) {
        return errorResponse(`Invalid OpenPro ID for accommodation ${accommodationId}`, 400);
      }
    }
    
    try {
      // Lier dans OpenPro
      const openProClient = getOpenProClient(env);
      await openProClient.linkRateTypeToAccommodation(SUPPLIER_ID, idOpenPro, idTypeTarif);
      
      // Sauvegarder en DB
      await linkRateTypeToAccommodation(accommodationId, idTypeTarif, env);
      
      logger.info(`Linked rate type ${idTypeTarif} to accommodation ${accommodationId} in DB and OpenPro`);
      
      // Exporter les données vers OpenPro
      try {
        await exportAccommodationDataToOpenPro(SUPPLIER_ID, idOpenPro, accommodationId, env);
        logger.info(`Exported accommodation data to OpenPro after linking rate type`);
      } catch (exportError) {
        logger.warn('Failed to export accommodation data to OpenPro (non-blocking):', exportError);
      }
      
      return jsonResponse({ success: true });
    } catch (error) {
      logger.error('Error linking rate type to accommodation', error);
      return errorResponse(
        'Failed to link rate type to accommodation',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // DELETE /api/suppliers/:idFournisseur/accommodations/:idHebergement/rate-type-links/:idTypeTarif
  router.delete('/api/suppliers/:idFournisseur/accommodations/:idHebergement/rate-type-links/:idTypeTarif', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idHebergementParam = request.params!.idHebergement;
    const idTypeTarif = parseInt(request.params!.idTypeTarif, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    if (isNaN(idTypeTarif)) {
      return errorResponse('Invalid idTypeTarif', 400);
    }
    
    // Trouver l'hébergement
    let accommodationId: string;
    let idOpenPro: number;
    
    if (!isNaN(parseInt(idHebergementParam, 10))) {
      // C'est un ID OpenPro (nombre)
      idOpenPro = parseInt(idHebergementParam, 10);
      const accommodation = await findAccommodationByOpenProId(idOpenPro, env);
      if (!accommodation) {
        return errorResponse(`Accommodation with OpenPro ID ${idOpenPro} not found`, 404);
      }
      accommodationId = accommodation.id;
    } else {
      // C'est un ID DB (string)
      accommodationId = idHebergementParam;
      const accommodation = await loadAccommodation(accommodationId, env);
      if (!accommodation) {
        return errorResponse(`Accommodation with ID ${accommodationId} not found`, 404);
      }
      if (!accommodation.ids.OpenPro) {
        return errorResponse(`Accommodation ${accommodationId} has no OpenPro ID`, 400);
      }
      idOpenPro = parseInt(accommodation.ids.OpenPro, 10);
      if (isNaN(idOpenPro)) {
        return errorResponse(`Invalid OpenPro ID for accommodation ${accommodationId}`, 400);
      }
    }
    
    try {
      // Délier dans OpenPro
      const openProClient = getOpenProClient(env);
      await openProClient.unlinkRateTypeFromAccommodation(SUPPLIER_ID, idOpenPro, idTypeTarif);
      
      // Supprimer de la DB
      await unlinkRateTypeFromAccommodation(accommodationId, idTypeTarif, env);
      
      logger.info(`Unlinked rate type ${idTypeTarif} from accommodation ${accommodationId} in DB and OpenPro`);
      
      // Exporter les données vers OpenPro
      try {
        await exportAccommodationDataToOpenPro(SUPPLIER_ID, idOpenPro, accommodationId, env);
        logger.info(`Exported accommodation data to OpenPro after unlinking rate type`);
      } catch (exportError) {
        logger.warn('Failed to export accommodation data to OpenPro (non-blocking):', exportError);
      }
      
      return jsonResponse({ success: true });
    } catch (error) {
      logger.error('Error unlinking rate type from accommodation', error);
      return errorResponse(
        'Failed to unlink rate type from accommodation',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/suppliers/:idFournisseur/supplier-data
  router.get('/api/suppliers/:idFournisseur/supplier-data', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const url = new URL(request.url);
    const debut = url.searchParams.get('debut');
    const fin = url.searchParams.get('fin');
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    if (!debut || !fin) {
      return errorResponse('Missing required query parameters: debut and fin', 400);
    }
    
    try {
      const accommodations = await loadAllAccommodations(env);
      const startDate = new Date(debut + 'T00:00:00');
      const endDate = new Date(fin + 'T23:59:59');
      
      const data = await getSupplierData(SUPPLIER_ID, accommodations, startDate, endDate, env);
      return jsonResponse(data);
    } catch (error) {
      logger.error('Error fetching supplier data', error);
      return errorResponse('Failed to fetch supplier data', 500);
    }
  });

  // POST /api/suppliers/:idFournisseur/bulk-update
  router.post('/api/suppliers/:idFournisseur/bulk-update', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
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
          accommodationId: accommodation.accommodationId,
          datesCount: accommodation.dates.length
        });
        
        // Trouver l'hébergement en DB par son ID OpenPro
        const accommodationDb = await findAccommodationByOpenProId(accommodation.accommodationId, env);
        if (!accommodationDb) {
          logger.warn(`Accommodation with OpenPro ID ${accommodation.accommodationId} not found in DB, skipping`);
          continue;
        }
        
        const accommodationId = accommodationDb.id;
        
        // Sauvegarder chaque date modifiée en DB
        for (const dateData of accommodation.dates) {
          if (dateData.rateTypeId && dateData.price !== undefined) {
            // Normaliser les valeurs
            const dureeMin = dateData.minDuration ?? dateData.dureeMin;
            const arriveeAutorisee = dateData.arrivalAllowed ?? dateData.arriveeAutorisee;
            
            await saveAccommodationData(accommodationId, dateData.rateTypeId, dateData.date, {
              prixNuitee: dateData.price,
              arriveeAutorisee: arriveeAutorisee,
              dureeMinimale: dureeMin ?? undefined
            }, env);
          }
        }
        
        logger.info(`Saved ${accommodation.dates.length} dates to DB for accommodation ${accommodationId}`);
        
        // Transformer et exporter vers OpenPro
        const requeteTarif = transformBulkToOpenProFormat(accommodation);
        
        if (requeteTarif !== null && requeteTarif.tarifs.length > 0) {
          logger.info('Calling OpenPro API setRates', {
            accommodationId: accommodation.accommodationId,
            tarifsCount: requeteTarif.tarifs.length
          });
          
          await openProClient.setRates(
            SUPPLIER_ID,
            accommodation.accommodationId,
            requeteTarif
          );
          
          logger.info('Successfully called OpenPro API setRates', {
            accommodationId: accommodation.accommodationId
          });
          
          // Exporter aussi via exportAccommodationDataToOpenPro pour être sûr
          try {
            await exportAccommodationDataToOpenPro(SUPPLIER_ID, accommodation.accommodationId, accommodationId, env);
            logger.info(`Exported accommodation data to OpenPro for ${accommodationId}`);
          } catch (exportError) {
            logger.warn('Failed to export accommodation data to OpenPro (non-blocking):', exportError);
          }
        } else {
          logger.warn('Skipping accommodation: no valid tarifs to update', {
            accommodationId: accommodation.accommodationId
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

  // GET /api/suppliers/:idFournisseur/local-bookings
  router.get('/api/suppliers/:idFournisseur/local-bookings', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    try {
      // Charger toutes les réservations depuis la DB (toutes plateformes)
      const bookings = await loadAllBookings(env);
      return jsonResponse(bookings);
    } catch (error) {
      logger.error('Error fetching bookings', error);
      return errorResponse(
        'Failed to fetch bookings',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/suppliers/:idFournisseur/local-bookings
  router.post('/api/suppliers/:idFournisseur/local-bookings', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    let bookingData: {
      accommodationId?: number;
      idHebergement?: number; // Support ancien format pour compatibilité
      arrivalDate?: string;
      dateArrivee?: string; // Support ancien format pour compatibilité
      departureDate?: string;
      dateDepart?: string; // Support ancien format pour compatibilité
      clientName?: string;
      clientNom?: string; // Support ancien format pour compatibilité
      clientFirstName?: string;
      clientPrenom?: string; // Support ancien format pour compatibilité
      clientEmail?: string;
      clientPhone?: string;
      clientTelephone?: string; // Support ancien format pour compatibilité
      numberOfPersons?: number;
      nbPersonnes?: number; // Support ancien format pour compatibilité
      totalAmount?: number;
      montantTotal?: number; // Support ancien format pour compatibilité
      reference?: string;
    };
    
    try {
      bookingData = await request.json();
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Normaliser les noms (support des anciens et nouveaux formats)
    const accommodationId = bookingData.accommodationId ?? bookingData.idHebergement;
    const arrivalDate = bookingData.arrivalDate ?? bookingData.dateArrivee;
    const departureDate = bookingData.departureDate ?? bookingData.dateDepart;
    const clientName = bookingData.clientName ?? bookingData.clientNom;
    const clientFirstName = bookingData.clientFirstName ?? bookingData.clientPrenom;
    const clientEmail = bookingData.clientEmail;
    const clientPhone = bookingData.clientPhone ?? bookingData.clientTelephone;
    const numberOfPersons = bookingData.numberOfPersons ?? bookingData.nbPersonnes;
    const totalAmount = bookingData.totalAmount ?? bookingData.montantTotal;
    const reference = bookingData.reference;
    
    // Valider les champs obligatoires
    if (!accommodationId || !arrivalDate || !departureDate) {
      return errorResponse('Missing required fields: accommodationId (or idHebergement), arrivalDate (or dateArrivee), departureDate (or dateDepart)', 400);
    }
    
    // Valider les types
    if (typeof accommodationId !== 'number') {
      return errorResponse('accommodationId (or idHebergement) must be a number', 400);
    }
    
    // Valider le format des dates (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(arrivalDate) || !dateRegex.test(departureDate)) {
      return errorResponse('Dates must be in YYYY-MM-DD format', 400);
    }
    
    try {
      // Séparer le nom complet en nom et prénom si nécessaire
      let clientNom = clientName;
      let clientPrenom = clientFirstName;
      
      // Si on a seulement clientNom (nom complet), essayer de le séparer
      if (clientNom && !clientPrenom) {
        const parts = clientNom.trim().split(/\s+/);
        if (parts.length > 1) {
          // Dernier mot = nom de famille, reste = prénom
          clientNom = parts[parts.length - 1];
          clientPrenom = parts.slice(0, -1).join(' ');
        } else {
          // Un seul mot = considérer comme nom de famille
          clientNom = parts[0];
          clientPrenom = undefined;
        }
      }
      
      // Mettre à jour le stock à 0 pour toutes les dates de la réservation AVANT de créer la réservation
      // Si cela échoue, la réservation ne sera pas créée
      const openProClient = getOpenProClient(env);
      
      // Calculer toutes les dates entre arrivalDate (inclus) et departureDate (exclus)
      // Le stock doit être à 0 du premier jour inclus au dernier jour inclus
      // departureDate est exclu car c'est la date de départ (dernière nuit = departureDate - 1 jour)
      const dates: string[] = [];
      const [startYear, startMonth, startDay] = arrivalDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = departureDate.split('-').map(Number);
      
      // Créer des dates en locale pour éviter les problèmes de fuseau horaire
      let currentDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      
      // Ajouter toutes les dates du premier jour inclus au dernier jour inclus (dateDepart est exclu)
      while (currentDate < endDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        dates.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Créer le payload pour mettre le stock à 0 pour chaque date
      const stockPayload = {
        jours: dates.map(date => ({
          date,
          dispo: 0
        }))
      };
      
      // Mettre à jour le stock dans OpenPro (si cela échoue, la création de réservation échouera aussi)
      await openProClient.updateStock(
        SUPPLIER_ID,
        accommodationId,
        stockPayload
      );
      
      logger.info(`Updated stock to 0 for supplier ${SUPPLIER_ID}, accommodation ${accommodationId}, dates ${dates[0]} to ${dates[dates.length - 1]}`);
      
      // Créer la réservation en DB seulement si la mise à jour du stock a réussi
      const createdBooking = await createLocalBooking({
        supplierId: SUPPLIER_ID,
        accommodationId: accommodationId,
        arrivalDate: arrivalDate,
        departureDate: departureDate,
        clientName: clientNom,
        clientFirstName: clientPrenom,
        clientEmail: clientEmail,
        clientPhone: clientPhone,
        numberOfPersons: numberOfPersons,
        totalAmount: totalAmount,
        reference: reference
      }, env);
      
      logger.info(`Created local booking for supplier ${SUPPLIER_ID}, accommodation ${accommodationId}`);
      
      // Synchroniser avec le stub-server en mode test (non bloquant)
      try {
        await syncBookingToStub(createdBooking, SUPPLIER_ID, env);
      } catch (syncError) {
        // Ne pas faire échouer la création si la sync échoue
        logger.warn('Failed to sync booking to stub-server (non-blocking):', syncError);
      }
      
      return jsonResponse(createdBooking);
    } catch (error) {
      logger.error('Error creating local booking', error);
      
      // Fournir un message d'erreur plus explicite si c'est une erreur de stock
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isStockError = errorMessage.includes('stock') || errorMessage.includes('Stock') || errorMessage.includes('Failed to update stock');
      
      return errorResponse(
        isStockError 
          ? 'Failed to update stock: ' + errorMessage
          : 'Failed to create local booking: ' + errorMessage,
        500,
        errorMessage
      );
    }
  });

  // GET /api/suppliers/:idFournisseur/local-bookings-sync-status
  router.get('/api/suppliers/:idFournisseur/local-bookings-sync-status', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    try {
      // Compter les réservations locales en attente de synchronisation
      const pendingResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM local_bookings
        WHERE id_fournisseur = ? AND synced_at IS NULL
      `).bind(SUPPLIER_ID).first();
      const pendingSyncCount = (pendingResult as any)?.count || 0;
      
      // Compter les réservations locales synchronisées
      const syncedResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM local_bookings
        WHERE id_fournisseur = ? AND synced_at IS NOT NULL
      `).bind(SUPPLIER_ID).first();
      const syncedCount = (syncedResult as any)?.count || 0;
      
      // Les réservations obsolètes ne sont pas stockées dans la DB
      // Elles sont détectées dynamiquement lors du chargement des réservations
      // Pour obtenir le compte exact, il faudrait charger toutes les réservations OpenPro
      // Pour l'instant, on retourne 0 (sera calculé dynamiquement côté frontend si nécessaire)
      const obsoleteCount = 0;
      
      // Récupérer la date de dernière modification (synced_at ou date_modification)
      const lastChangeResult = await env.DB.prepare(`
        SELECT MAX(COALESCE(synced_at, date_modification)) as last_change FROM local_bookings
        WHERE id_fournisseur = ?
      `).bind(SUPPLIER_ID).first();
      const lastChange = (lastChangeResult as any)?.last_change || null;
      
      // Récupérer la date de dernière synchronisation (max synced_at)
      const lastSyncCheckResult = await env.DB.prepare(`
        SELECT MAX(synced_at) as last_sync_check FROM local_bookings
        WHERE id_fournisseur = ? AND synced_at IS NOT NULL
      `).bind(SUPPLIER_ID).first();
      const lastSyncCheck = (lastSyncCheckResult as any)?.last_sync_check || null;
      
      return jsonResponse({
        lastSyncCheck,
        pendingSyncCount,
        syncedCount,
        obsoleteCount,
        lastChange
      });
    } catch (error) {
      logger.error('Error fetching sync status', error);
      return errorResponse(
        'Failed to fetch sync status',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // DELETE /api/suppliers/:idFournisseur/local-bookings/:idDossier
  router.delete('/api/suppliers/:idFournisseur/local-bookings/:idDossier', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const idDossier = parseInt(request.params!.idDossier, 10);
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    if (idFournisseur !== SUPPLIER_ID) {
      return errorResponse(`Invalid idFournisseur: must be ${SUPPLIER_ID}`, 400);
    }
    
    if (isNaN(idDossier)) {
      return errorResponse('Invalid idDossier: must be a number', 400);
    }
    
    // Récupérer les paramètres optionnels de la query string pour une recherche plus précise
    const url = new URL(request.url);
    const idHebergementParam = url.searchParams.get('idHebergement');
    const dateArriveeParam = url.searchParams.get('dateArrivee');
    const dateDepartParam = url.searchParams.get('dateDepart');
    
    const idHebergement = idHebergementParam ? parseInt(idHebergementParam, 10) : undefined;
    const dateArrivee = dateArriveeParam || undefined;
    const dateDepart = dateDepartParam || undefined;
    
    try {
      // Supprimer la réservation locale de la DB
      // Passer les critères supplémentaires pour une recherche plus précise
      const result = await deleteLocalBooking(
        idFournisseur,
        idDossier,
        env,
        idHebergement,
        dateArrivee,
        dateDepart
      );
      
      if (!result.success || !result.deletedBooking) {
        return errorResponse('Booking not found or could not be deleted', 404);
      }
      
      const deletedBooking = result.deletedBooking;
      
      logger.info(`Deleted local booking ${idDossier} for supplier ${idFournisseur}`);
      
      // Supprimer également du stub-server si on est en mode test
      try {
        const { deleteBookingFromStub } = await import('../services/openpro/stubSyncService.js');
        await deleteBookingFromStub(deletedBooking, idFournisseur, env);
      } catch (syncError) {
        // Ne pas faire échouer la suppression si la sync stub échoue
        logger.warn('Failed to delete booking from stub-server (non-blocking):', syncError);
      }
      
      return jsonResponse({ success: true });
    } catch (error) {
      logger.error('Error deleting local booking', error);
      return errorResponse(
        'Failed to delete local booking',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });
}
