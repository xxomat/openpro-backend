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
import { createLocalBooking, deleteLocalBooking } from '../services/openpro/localBookingService.js';
import { syncBookingToStub } from '../services/openpro/stubSyncService.js';

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

  // POST /api/suppliers/:idFournisseur/local-bookings
  router.post('/api/suppliers/:idFournisseur/local-bookings', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur: must be a number', 400);
    }
    
    let bookingData: {
      idHebergement: number;
      dateArrivee: string;
      dateDepart: string;
      clientNom?: string;
      clientPrenom?: string;
      clientEmail?: string;
      clientTelephone?: string;
      nbPersonnes?: number;
      montantTotal?: number;
      reference?: string;
    };
    
    try {
      bookingData = await request.json();
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }
    
    // Valider les champs obligatoires
    if (!bookingData.idHebergement || !bookingData.dateArrivee || !bookingData.dateDepart) {
      return errorResponse('Missing required fields: idHebergement, dateArrivee, dateDepart', 400);
    }
    
    // Valider les types
    if (typeof bookingData.idHebergement !== 'number') {
      return errorResponse('idHebergement must be a number', 400);
    }
    
    // Valider le format des dates (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(bookingData.dateArrivee) || !dateRegex.test(bookingData.dateDepart)) {
      return errorResponse('Dates must be in YYYY-MM-DD format', 400);
    }
    
    try {
      // Séparer le nom complet en nom et prénom si nécessaire
      let clientNom = bookingData.clientNom;
      let clientPrenom = bookingData.clientPrenom;
      
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
      
      // Calculer toutes les dates entre dateArrivee (inclus) et dateDepart (exclus)
      // Le stock doit être à 0 du premier jour inclus au dernier jour inclus
      // dateDepart est exclu car c'est la date de départ (dernière nuit = dateDepart - 1 jour)
      const dates: string[] = [];
      const [startYear, startMonth, startDay] = bookingData.dateArrivee.split('-').map(Number);
      const [endYear, endMonth, endDay] = bookingData.dateDepart.split('-').map(Number);
      
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
        idFournisseur,
        bookingData.idHebergement,
        stockPayload
      );
      
      logger.info(`Updated stock to 0 for supplier ${idFournisseur}, accommodation ${bookingData.idHebergement}, dates ${dates[0]} to ${dates[dates.length - 1]}`);
      
      // Créer la réservation en DB seulement si la mise à jour du stock a réussi
      const createdBooking = await createLocalBooking({
        idFournisseur,
        idHebergement: bookingData.idHebergement,
        dateArrivee: bookingData.dateArrivee,
        dateDepart: bookingData.dateDepart,
        clientNom,
        clientPrenom,
        clientEmail: bookingData.clientEmail,
        clientTelephone: bookingData.clientTelephone,
        nbPersonnes: bookingData.nbPersonnes,
        montantTotal: bookingData.montantTotal,
        reference: bookingData.reference
      }, env);
      
      logger.info(`Created local booking for supplier ${idFournisseur}, accommodation ${bookingData.idHebergement}`);
      
      // Synchroniser avec le stub-server en mode test (non bloquant)
      try {
        await syncBookingToStub(createdBooking, idFournisseur, env);
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
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur: must be a number', 400);
    }
    
    try {
      // Compter les réservations locales en attente de synchronisation
      const pendingResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM local_bookings
        WHERE id_fournisseur = ? AND synced_at IS NULL
      `).bind(idFournisseur).first();
      const pendingSyncCount = (pendingResult as any)?.count || 0;
      
      // Compter les réservations locales synchronisées
      const syncedResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM local_bookings
        WHERE id_fournisseur = ? AND synced_at IS NOT NULL
      `).bind(idFournisseur).first();
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
      `).bind(idFournisseur).first();
      const lastChange = (lastChangeResult as any)?.last_change || null;
      
      // Récupérer la date de dernière synchronisation (max synced_at)
      const lastSyncCheckResult = await env.DB.prepare(`
        SELECT MAX(synced_at) as last_sync_check FROM local_bookings
        WHERE id_fournisseur = ? AND synced_at IS NOT NULL
      `).bind(idFournisseur).first();
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
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur: must be a number', 400);
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
