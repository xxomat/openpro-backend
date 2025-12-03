/**
 * Routes pour les cron jobs Cloudflare
 * 
 * Ces routes sont appelées automatiquement par Cloudflare selon la configuration
 * dans wrangler.toml (triggers.crons)
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../index.js';
import { jsonResponse, errorResponse } from '../utils/cors.js';
import { createLogger } from '../index.js';
import { 
  updateSyncedStatusForLocalBookings
} from '../services/openpro/localBookingService.js';
import { PlateformeReservation } from '../types/api.js';
import { getOpenProClient } from '../services/openProClient.js';
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
  
  const openProClient = getOpenProClient(env);
  
  // Pour chaque fournisseur, charger les réservations locales et OpenPro, puis comparer
  for (const idFournisseur of suppliers) {
    try {
      // Charger TOUTES les réservations locales pour ce fournisseur (pas seulement celles en attente)
      const dbBookings = await env.DB.prepare(`
        SELECT * FROM local_bookings
        WHERE id_fournisseur = ?
      `).bind(idFournisseur).all();
      
      // Charger toutes les réservations OpenPro pour ce fournisseur
      const bookingList = await openProClient.listBookings(idFournisseur);
      const openProBookings: Array<{
        bookingId: number;
        accommodationId: number;
        arrivalDate: string;
        departureDate: string;
        reference?: string;
        reservationPlatform: PlateformeReservation;
        isPendingSync: boolean;
        isObsolete: boolean;
      }> = [];
      
      // Convertir les réservations OpenPro en BookingDisplay et filtrer les Direct
      // Le nouveau format retourne une liste de résumés, il faut charger les détails complets
      for (const summary of bookingList.liste ?? []) {
        // Charger les détails complets du dossier
        const dossier = await openProClient.getBooking(summary.cleDossier.idFournisseur, summary.cleDossier.idDossier);
        
        // Le nouveau format peut avoir plusieurs hébergements dans listeHebergement
        const listeHebergement = dossier.listeHebergement ?? [];
        
        for (const hebergementItem of listeHebergement) {
          if (hebergementItem.sejour?.debut && hebergementItem.sejour?.fin) {
            // Déterminer la plateforme
            let plateforme = PlateformeReservation.Unknown;
            if (dossier.transaction?.transactionResaLocale) {
              plateforme = PlateformeReservation.Directe;
            } else if (dossier.transaction?.transactionBooking) {
              plateforme = PlateformeReservation.BookingCom;
            } else if (dossier.transaction?.transactionXotelia) {
              plateforme = PlateformeReservation.Xotelia;
            } else if (dossier.transaction?.transactionOpenSystem) {
              plateforme = PlateformeReservation.OpenPro;
            }
            
            if (plateforme === PlateformeReservation.Directe) {
              const idDossier = dossier.cleDossier.idDossier;
              // Log pour diagnostic si idDossier est manquant
              if (!idDossier || idDossier === 0) {
                console.warn(`[CRON] Direct booking without idDossier:`, {
                  cleDossier: dossier.cleDossier,
                  dossierKeys: Object.keys(dossier)
                });
              }
              openProBookings.push({
                bookingId: idDossier,
                accommodationId: hebergementItem.cleHebergement.idHebergement,
                arrivalDate: hebergementItem.sejour.debut,
                departureDate: hebergementItem.sejour.fin,
                reference: undefined, // Le nouveau format n'a pas de reference au niveau du dossier
                reservationPlatform: PlateformeReservation.Directe,
                isPendingSync: false,
                isObsolete: false
              });
            }
          }
        }
      }
      
      // Si pas de réservations locales mais des réservations Direct dans OpenPro, compter les obsolètes
      if (!dbBookings.results || dbBookings.results.length === 0) {
        // Pas de réservations locales, toutes les réservations Direct dans OpenPro sont obsolètes
        // (elles ne sont pas stockées dans la DB, seulement comptées)
        for (const openProBooking of openProBookings) {
          obsoleteBookings.push({
            reference: openProBooking.reference ?? null,
            dateArrivee: openProBooking.arrivalDate,
            synced: false,
            obsolete: true
          });
          totalObsoleteCount++;
          
          // Log pour diagnostic
          console.log(`[CRON] Found obsolete booking (no local bookings): bookingId=${openProBooking.bookingId}, ref=${openProBooking.reference}, isStubMode=${isStubMode(env)}`);
          
          // Supprimer la réservation obsolète du stub server uniquement si on est en mode stub
          if (isStubMode(env)) {
            // Vérifier que l'ID est valide avant de supprimer
            if (openProBooking.bookingId && openProBooking.bookingId > 0) {
              try {
                console.log(`[CRON] Attempting to delete obsolete booking ${openProBooking.bookingId} (ref: ${openProBooking.reference}) from stub-server`);
                const { deleteBookingFromStubById } = await import('../services/openpro/stubSyncService.js');
                await deleteBookingFromStubById(
                  openProBooking.bookingId,
                  idFournisseur,
                  env
                );
                console.log(`[CRON] Successfully deleted obsolete booking ${openProBooking.bookingId} from stub-server`);
              } catch (deleteError) {
                // Ne pas faire échouer le cron si la suppression échoue
                console.error(`[CRON] Failed to delete obsolete booking ${openProBooking.bookingId} from stub-server:`, deleteError);
              }
            } else {
              console.warn(`[CRON] Cannot delete obsolete booking: invalid bookingId (${openProBooking.bookingId})`);
            }
          } else {
            console.log(`[CRON] Not in stub mode (OPENPRO_BASE_URL=${env.OPENPRO_BASE_URL}), skipping deletion`);
          }
        }
        continue;
      }
      
      // Séparer les réservations en attente et toutes les autres
      const pendingLocalBookings = dbBookings.results.filter((row: any) => 
        row.synced_at === null || row.synced_at === undefined
      );
      
      totalLocalBookingsCount += pendingLocalBookings.length;
      
      // Convertir toutes les réservations locales en BookingDisplay
      const allSupplierLocalBookings = dbBookings.results.map((row: any) => ({
        idDossier: 0,
        idHebergement: row.id_hebergement,
        dateArrivee: row.date_arrivee,
        dateDepart: row.date_depart,
        plateformeReservation: PlateformeReservation.Directe,
        isPendingSync: row.synced_at === null || row.synced_at === undefined,
        isObsolete: false // Les réservations dans la DB ne sont jamais obsolètes
      }));
      
      // Convertir seulement les réservations en attente pour la mise à jour synced_at
      const pendingSupplierLocalBookings = pendingLocalBookings.map((row: any) => ({
        idDossier: 0,
        idHebergement: row.id_hebergement,
        dateArrivee: row.date_arrivee,
        dateDepart: row.date_depart,
        plateformeReservation: PlateformeReservation.Directe,
        isPendingSync: true,
        isObsolete: false
      }));
      
      // Mettre à jour synced_at pour les réservations synchronisées (seulement celles en attente)
      if (pendingSupplierLocalBookings.length > 0) {
        const syncStats = await updateSyncedStatusForLocalBookings(
          idFournisseur,
          pendingSupplierLocalBookings,
          openProBookings,
          env
        );
        totalSyncedCount += syncStats.syncedCount;
        totalPendingCount += syncStats.pendingCount;
      }
      
      // Détecter les réservations obsolètes (sans les créer dans la DB)
      // Compter les réservations Direct dans OpenPro qui n'ont pas de correspondance locale
      for (const openProBooking of openProBookings) {
        const match = allSupplierLocalBookings.find(localBooking =>
          localBooking.accommodationId === openProBooking.accommodationId &&
          localBooking.arrivalDate === openProBooking.arrivalDate &&
          localBooking.departureDate === openProBooking.departureDate
        );
        
        if (!match) {
          // Réservation Direct dans OpenPro sans correspondance locale = obsolète
          // (détectée dynamiquement, pas stockée dans la DB)
          obsoleteBookings.push({
            reference: openProBooking.reference ?? null,
            dateArrivee: openProBooking.arrivalDate,
            synced: false,
            obsolete: true
          });
          totalObsoleteCount++;
          
          // Log pour diagnostic
          console.log(`[CRON] Found obsolete booking: bookingId=${openProBooking.bookingId}, ref=${openProBooking.reference}, isStubMode=${isStubMode(env)}`);
          
          // Supprimer la réservation obsolète du stub server uniquement si on est en mode stub
          if (isStubMode(env)) {
            // Vérifier que l'ID est valide avant de supprimer
            if (openProBooking.bookingId && openProBooking.bookingId > 0) {
              try {
                console.log(`[CRON] Attempting to delete obsolete booking ${openProBooking.bookingId} (ref: ${openProBooking.reference}) from stub-server`);
                const { deleteBookingFromStubById } = await import('../services/openpro/stubSyncService.js');
                await deleteBookingFromStubById(
                  openProBooking.bookingId,
                  idFournisseur,
                  env
                );
                console.log(`[CRON] Successfully deleted obsolete booking ${openProBooking.bookingId} from stub-server`);
              } catch (deleteError) {
                // Ne pas faire échouer le cron si la suppression échoue
                console.error(`[CRON] Failed to delete obsolete booking ${openProBooking.bookingId} from stub-server:`, deleteError);
              }
            } else {
              console.warn(`[CRON] Cannot delete obsolete booking: invalid bookingId (${openProBooking.bookingId})`);
            }
          } else {
            console.log(`[CRON] Not in stub mode (OPENPRO_BASE_URL=${env.OPENPRO_BASE_URL}), skipping deletion`);
          }
        }
      }
      
    } catch (error) {
      console.error(`Error processing supplier ${idFournisseur}:`, error);
      // Continuer avec le prochain fournisseur
    }
  }
  
  // Recharger toutes les réservations locales depuis la DB (les obsolètes ne sont pas dans la DB)
  const finalBookingsResult = await env.DB.prepare(`
    SELECT reference, date_arrivee, synced_at
    FROM local_bookings
    ORDER BY date_arrivee ASC
  `).all();
  
  const finalBookings = (finalBookingsResult.results || []).map((row: any) => ({
    reference: row.reference || null,
    dateArrivee: row.date_arrivee,
    synced: row.synced_at !== null && row.synced_at !== undefined,
    obsolete: false // Les réservations dans la DB ne sont jamais obsolètes
  }));
  
  // Ajouter les réservations obsolètes détectées au tableau final
  const allBookings = [...finalBookings, ...obsoleteBookings];
  
  // Trier par date d'arrivée
  allBookings.sort((a, b) => a.dateArrivee.localeCompare(b.dateArrivee));
  
  return {
    localBookingsCount: totalLocalBookingsCount,
    syncedCount: totalSyncedCount,
    pendingCount: totalPendingCount,
    obsoleteCount: totalObsoleteCount, // Compté dynamiquement depuis OpenPro vs DB
    bookings: allBookings
  };
}

/**
 * Enregistre les routes de cron
 */
export function cronRouter(router: Router, env: Env, ctx: RequestContext) {
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

