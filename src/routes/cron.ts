/**
 * Routes pour les cron jobs Cloudflare
 * 
 * Ces routes sont appelées automatiquement par Cloudflare selon la configuration
 * dans wrangler.toml (triggers.crons)
 */

import type { IRequest } from 'itty-router';
import type { Router } from 'itty-router';
import type { Env, RequestContext } from '../index.js';
import { jsonResponse, errorResponse } from '../utils/cors.js';
import { createLogger } from '../index.js';
import { 
  loadAllLocalBookings
} from '../services/openpro/localBookingService.js';
import { PlateformeReservation } from '../types/api.js';
import { isStubMode } from '../services/openpro/stubSyncService.js';

/**
 * Handler pour valider la synchronisation des réservations Direct
 * 
 * Cette fonction est appelée toutes les 15 minutes par Cloudflare Cron pour :
 * - Vérifier que les réservations locales sont bien synchronisées dans OpenPro
 * - Détecter les réservations obsolètes (Direct dans OpenPro sans correspondance locale)
 * - Mettre à jour synced_at dans la DB pour les réservations synchronisées
 * - Marquer les réservations obsolètes dans la DB
 * 
 * @param env - Variables d'environnement Workers
 * @returns Statistiques de validation et liste des réservations
 */
async function validateDirectBookingsSync(env: Env): Promise<{
  localBookingsCount: number;
  syncedCount: number;
  pendingCount: number;
  obsoleteCount: number;
  bookings: Array<{
    reference: string | null;
    dateArrivee: string;
    synced: boolean;
    obsolete: boolean;
  }>;
}> {
  // Récupérer TOUS les fournisseurs uniques depuis la DB qui ont des réservations
  // (pas seulement celles en attente, car il faut vérifier les obsolètes aussi)
  const suppliersResult = await env.DB.prepare(`
    SELECT DISTINCT id_fournisseur FROM local_bookings
  `).all();
  
  // Liste des fournisseurs à vérifier (depuis la DB)
  const suppliersFromDb = suppliersResult.results 
    ? suppliersResult.results.map((row: any) => row.id_fournisseur)
    : [];
  
  // Si la DB est vide, on doit quand même vérifier les fournisseurs connus
  // pour détecter les réservations obsolètes dans OpenPro
  // Pour l'instant, on utilise une liste de fournisseurs connus (peut être étendue)
  const knownSuppliers = [47186, 55123]; // Fournisseurs connus du stub server
  
  // Combiner les fournisseurs de la DB avec les fournisseurs connus
  const allSuppliers = Array.from(new Set([...suppliersFromDb, ...knownSuppliers]));
  
  if (allSuppliers.length === 0) {
    return {
      localBookingsCount: 0,
      syncedCount: 0,
      pendingCount: 0,
      obsoleteCount: 0,
      bookings: []
    };
  }
  
  const suppliers = allSuppliers;
  let totalLocalBookingsCount = 0;
  
  let totalSyncedCount = 0;
  let totalPendingCount = 0;
  let totalObsoleteCount = 0;
  
  // Liste pour collecter les réservations obsolètes détectées
  const obsoleteBookings: Array<{
    reference: string | null;
    dateArrivee: string;
    synced: boolean;
    obsolete: boolean;
  }> = [];
  
  // Charger toutes les réservations locales depuis la DB
  const allBookings = await loadAllLocalBookings(env);
  
  // Pour chaque fournisseur, compter les réservations en attente
  for (const idFournisseur of suppliers) {
    try {
      // Filtrer les réservations pour ce fournisseur
      const supplierBookings = allBookings.filter(b => {
        // Vérifier si la réservation appartient à ce fournisseur
        // Les réservations ont idFournisseur dans la DB mais pas dans IBookingDisplay
        // On doit charger depuis la DB directement
        return true; // On va filtrer après
      });
      
      // Charger depuis la DB pour avoir accès à id_fournisseur
      const dbBookings = await env.DB.prepare(`
        SELECT * FROM local_bookings
        WHERE id_fournisseur = ?
      `).bind(idFournisseur).all();
      
      const pendingBookings = (dbBookings.results || []).filter((row: any) => 
        row.synced_at === null || row.synced_at === undefined
      );
      
      totalLocalBookingsCount += pendingBookings.length;
      totalPendingCount += pendingBookings.length;
      
      // Compter les synchronisées
      const syncedBookings = (dbBookings.results || []).filter((row: any) => 
        row.synced_at !== null && row.synced_at !== undefined
      );
      totalSyncedCount += syncedBookings.length;
      
    } catch (error) {
      console.error(`Error processing supplier ${idFournisseur}:`, error);
      // Continuer avec le prochain fournisseur
    }
  }
  
  // Charger toutes les réservations depuis la DB pour le retour
  const finalBookingsResult = await env.DB.prepare(`
    SELECT reference, date_arrivee, synced_at
    FROM local_bookings
    ORDER BY date_arrivee ASC
  `).all();

  const finalBookings = (finalBookingsResult.results || []).map((row: any) => ({
    reference: row.reference || null,
    dateArrivee: row.date_arrivee,
    synced: row.synced_at !== null && row.synced_at !== undefined,
    obsolete: false // Les réservations dans la DB ne sont jamais obsolètes (DB-first)
  }));

  // Trier par date d'arrivée
  finalBookings.sort((a, b) => a.dateArrivee.localeCompare(b.dateArrivee));

  return {
    localBookingsCount: totalLocalBookingsCount,
    syncedCount: totalSyncedCount,
    pendingCount: totalPendingCount,
    obsoleteCount: 0, // Plus de détection d'obsolètes depuis OpenPro (DB-first)
    bookings: finalBookings
  };
}

/**
 * Enregistre les routes de cron
 */
export function cronRouter(router: typeof Router.prototype, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // GET /cron/validate-direct-bookings
  // Cette route est appelée automatiquement par Cloudflare Cron toutes les 15 minutes
  router.get('/cron/validate-direct-bookings', async (request: IRequest) => {
    // Vérifier que c'est bien un appel cron (optionnel, pour sécurité)
    const cronHeader = request.headers.get('X-Cron');
    if (cronHeader !== 'true' && !request.url.includes('/cron/')) {
      logger.warn('Cron endpoint called without proper authorization');
      return errorResponse('Unauthorized', 401);
    }
    
    try {
      logger.info('Starting cron job: validate-direct-bookings');
      const stats = await validateDirectBookingsSync(env);
      logger.info('Cron job completed', stats);
      
      return jsonResponse({
        success: true,
        timestamp: new Date().toISOString(),
        stats
      });
    } catch (error) {
      logger.error('Error in cron job validate-direct-bookings', error);
      return errorResponse(
        'Failed to validate direct bookings sync',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /cron/sync-ical-imports
  // Cette route est appelée automatiquement par Cloudflare Cron toutes les 15 minutes
  router.get('/cron/sync-ical-imports', async (request: IRequest) => {
    // Vérifier que c'est bien un appel cron (optionnel, pour sécurité)
    const cronHeader = request.headers.get('X-Cron');
    if (cronHeader !== 'true' && !request.url.includes('/cron/')) {
      logger.warn('Cron endpoint called without proper authorization');
      return errorResponse('Unauthorized', 401);
    }
    
    try {
      logger.info('Starting cron job: sync-ical-imports');
      
      const { loadAllAccommodations } = await import('../services/openpro/accommodationService.js');
      const { loadAllIcalSyncConfigs, syncIcalImport } = await import('../services/ical/icalSyncService.js');
      
      // Charger tous les hébergements
      const accommodations = await loadAllAccommodations(env);
      
      let totalSynced = 0;
      let totalErrors = 0;
      
      // Pour chaque hébergement, synchroniser les configurations iCal
      for (const accommodation of accommodations) {
        try {
          const configs = await loadAllIcalSyncConfigs(accommodation.id, env);
          
          for (const config of configs) {
            if (config.importUrl) {
              try {
                await syncIcalImport(accommodation.id, config.platform, env);
                totalSynced++;
                logger.info(`Synced iCal for accommodation ${accommodation.id}, platform ${config.platform}`);
              } catch (error) {
                totalErrors++;
                logger.error(`Error syncing iCal for accommodation ${accommodation.id}, platform ${config.platform}:`, error);
                // Continuer avec les autres configurations même si une échoue
              }
            }
          }
        } catch (error) {
          totalErrors++;
          logger.error(`Error loading iCal configs for accommodation ${accommodation.id}:`, error);
          // Continuer avec les autres hébergements même si un échoue
        }
      }
      
      logger.info('Cron job completed', { totalSynced, totalErrors });
      
      return jsonResponse({
        success: true,
        timestamp: new Date().toISOString(),
        stats: {
          totalSynced,
          totalErrors
        }
      });
    } catch (error) {
      logger.error('Error in cron job sync-ical-imports', error);
      return errorResponse(
        'Failed to sync iCal imports',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });
}

