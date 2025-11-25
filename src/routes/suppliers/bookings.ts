/**
 * Routes pour les réservations locales
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../../index.js';
import { jsonResponse, errorResponse } from '../../utils/cors.js';
import { createLocalBooking, deleteLocalBooking } from '../../services/openpro/localBookingService.js';
import { syncBookingToStub } from '../../services/openpro/stubSyncService.js';
import { generateIcalFile } from '../../services/openpro/icalExportService.js';
import { updateIcalCache } from '../../services/openpro/icalCacheService.js';
import { getOpenProClient } from '../../services/openProClient.js';
import { createLogger } from '../../index.js';

/**
 * Enregistre les routes des réservations locales
 */
export function bookingsRoutes(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
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
      const openProClient = getOpenProClient(env);
      
      // Calculer toutes les dates entre dateArrivee (inclus) et dateDepart (exclus)
      const dates: string[] = [];
      const [startYear, startMonth, startDay] = bookingData.dateArrivee.split('-').map(Number);
      const [endYear, endMonth, endDay] = bookingData.dateDepart.split('-').map(Number);
      
      let currentDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      
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
      
      // Mettre à jour le stock dans OpenPro
      await openProClient.updateStock(
        idFournisseur,
        bookingData.idHebergement,
        stockPayload
      );
      
      logger.info(`Updated stock to 0 for supplier ${idFournisseur}, accommodation ${bookingData.idHebergement}, dates ${dates[0]} to ${dates[dates.length - 1]}`);
      
      // Créer la réservation en DB
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
      
      // Régénérer et mettre à jour le cache iCal (non bloquant)
      try {
        const icalContent = await generateIcalFile(idFournisseur, env);
        await updateIcalCache(idFournisseur, icalContent, env);
        logger.info(`Updated iCal cache for supplier ${idFournisseur}`);
      } catch (cacheError) {
        logger.warn('Failed to update iCal cache (non-blocking):', cacheError);
      }
      
      // Synchroniser avec le stub-server en mode test (non bloquant)
      try {
        await syncBookingToStub(createdBooking, idFournisseur, env);
      } catch (syncError) {
        logger.warn('Failed to sync booking to stub-server (non-blocking):', syncError);
      }
      
      return jsonResponse(createdBooking);
    } catch (error) {
      logger.error('Error creating local booking', error);
      
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
      
      const obsoleteCount = 0;
      
      // Récupérer la date de dernière modification
      const lastChangeResult = await env.DB.prepare(`
        SELECT MAX(COALESCE(synced_at, date_modification)) as last_change FROM local_bookings
        WHERE id_fournisseur = ?
      `).bind(idFournisseur).first();
      const lastChange = (lastChangeResult as any)?.last_change || null;
      
      // Récupérer la date de dernière synchronisation
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
    
    const url = new URL(request.url);
    const idHebergementParam = url.searchParams.get('idHebergement');
    const dateArriveeParam = url.searchParams.get('dateArrivee');
    const dateDepartParam = url.searchParams.get('dateDepart');
    
    const idHebergement = idHebergementParam ? parseInt(idHebergementParam, 10) : undefined;
    const dateArrivee = dateArriveeParam || undefined;
    const dateDepart = dateDepartParam || undefined;
    
    try {
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
      
      // Régénérer et mettre à jour le cache iCal (non bloquant)
      try {
        const icalContent = await generateIcalFile(idFournisseur, env);
        await updateIcalCache(idFournisseur, icalContent, env);
        logger.info(`Updated iCal cache for supplier ${idFournisseur}`);
      } catch (cacheError) {
        logger.warn('Failed to update iCal cache (non-blocking):', cacheError);
      }
      
      // Supprimer également du stub-server si on est en mode test
      try {
        const { deleteBookingFromStub } = await import('../../services/openpro/stubSyncService.js');
        await deleteBookingFromStub(deletedBooking, idFournisseur, env);
      } catch (syncError) {
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

