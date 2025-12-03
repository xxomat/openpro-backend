/**
 * Service de synchronisation au démarrage
 * 
 * Ce service gère :
 * 1. La vérification des hébergements
 * 2. La synchronisation des plans tarifaires
 * 3. La synchronisation des liens plans tarifaires/hébergements
 * 4. La synchronisation des réservations OpenPro au démarrage
 * 5. L'export des données d'hébergement vers OpenPro au démarrage
 */

/**
 * Stockage des avertissements de synchronisation
 * Peut être exposé via un endpoint pour l'interface admin
 */
export interface StartupWarning {
  type: 'accommodation_missing_in_openpro' | 'rate_type_creation_failed' | 'link_creation_failed';
  message: string;
  accommodationId?: string;
  rateTypeId?: string | number;
  timestamp: string;
}

const startupWarnings: StartupWarning[] = [];

/**
 * Ajoute un avertissement de synchronisation
 */
function addWarning(warning: Omit<StartupWarning, 'timestamp'>): void {
  startupWarnings.push({
    ...warning,
    timestamp: new Date().toISOString()
  });
}

/**
 * Récupère tous les avertissements de synchronisation
 */
export function getStartupWarnings(): StartupWarning[] {
  return [...startupWarnings];
}

/**
 * Efface tous les avertissements (utile pour les tests)
 */
export function clearStartupWarnings(): void {
  startupWarnings.length = 0;
}

import type { Env } from '../../index.js';
import { getOpenProClient } from '../openProClient.js';
import { getSupplierId } from '../../config/supplier.js';
import { mapOpenProDossierToBooking } from './openProBookingService.js';
import { loadAllBookings, markBookingAsCancelled } from './localBookingService.js';
import { BookingStatus, PlateformeReservation } from '../../types/api.js';
import { loadAllAccommodations } from './accommodationService.js';
import { exportAccommodationDataToOpenPro } from './accommodationDataService.js';
import { updateRateTypeOpenProId } from './rateTypeDbService.js';
import { loadAccommodationRateTypeLinks } from './rateTypeDbService.js';

/**
 * Synchronise les réservations OpenPro au démarrage
 * 
 * Logique :
 * - Charge toutes les réservations depuis OpenPro
 * - Pour chaque réservation OpenPro :
 *   - Si absente en DB : insérer avec booking_status = 'Confirmed'
 *   - Si présente :
 *     - Si booking_status = 'Cancelled' : conserver (ne pas réactiver)
 *     - Si dates différentes : conserver les dates de la DB
 *     - Mettre à jour les autres champs si nécessaire
 * - Pour chaque réservation en DB avec reservation_platform = 'OpenPro' :
 *   - Si absente dans OpenPro et booking_status != 'Cancelled' : marquer comme 'Cancelled'
 * - Mettre à jour automatiquement booking_status = 'Past' pour les réservations dont la date de départ est passée
 */
export async function syncOpenProBookingsOnStartup(env: Env): Promise<void> {
  console.log('[StartupSync] Starting OpenPro bookings synchronization...');
  const SUPPLIER_ID = getSupplierId(env);

  try {
    const openProClient = getOpenProClient(env);

    // Charger toutes les réservations depuis OpenPro
    const openProBookingsResponse = await openProClient.listBookings(SUPPLIER_ID);
    const openProBookings = openProBookingsResponse.liste || [];

    console.log(`[StartupSync] Found ${openProBookings.length} bookings in OpenPro`);

    // Charger toutes les réservations en DB
    const dbBookings = await loadAllBookings(env);
    const openProBookingsInDb = dbBookings.filter(b => b.reservationPlatform === PlateformeReservation.OpenPro);

    console.log(`[StartupSync] Found ${openProBookingsInDb.length} OpenPro bookings in DB`);

    // Map des réservations OpenPro par reference (idDossier)
    const openProBookingsMap = new Map<number, (typeof openProBookings)[0]>();
    for (const booking of openProBookings) {
      const idDossier = (booking as any).cleDossier?.idDossier;
      if (idDossier) {
        openProBookingsMap.set(idDossier, booking);
      }
    }

    // Map des réservations DB par reference
    const dbBookingsMap = new Map<string, typeof dbBookings[0]>();
    for (const booking of openProBookingsInDb) {
      if (booking.reference) {
        dbBookingsMap.set(booking.reference, booking);
      }
    }

    // Traiter chaque réservation OpenPro
    for (const openProBooking of openProBookings) {
      const idDossier = (openProBooking as any).cleDossier?.idDossier;
      if (!idDossier) {
        continue;
      }

      const reference = String(idDossier);
      const dbBooking = dbBookingsMap.get(reference);

      if (!dbBooking) {
        // Réservation absente en DB : insérer
        // Convertir BookingSummary en Booking pour mapOpenProDossierToBooking
        const bookingDetail = await openProClient.getBooking(SUPPLIER_ID, idDossier);
        const mappedBooking = await mapOpenProDossierToBooking(bookingDetail, env);
        
        // Insérer en DB avec booking_status = 'Confirmed'
        await env.DB.prepare(`
          INSERT INTO local_bookings (
            id_fournisseur, id_hebergement, date_arrivee, date_depart,
            client_nom, client_prenom, client_email, client_telephone,
            nb_personnes, montant_total, reference,
            reservation_platform, booking_status,
            date_creation, date_modification
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          SUPPLIER_ID,
          mappedBooking.accommodationId,
          mappedBooking.arrivalDate,
          mappedBooking.departureDate,
          mappedBooking.clientName?.split(' ')[1] || null, // nom
          mappedBooking.clientName?.split(' ')[0] || null, // prénom
          mappedBooking.clientEmail || null,
          mappedBooking.clientPhone || null,
          mappedBooking.numberOfPersons || 2,
          mappedBooking.totalAmount || null,
          reference,
          PlateformeReservation.OpenPro,
          BookingStatus.Confirmed
        ).run();

        console.log(`[StartupSync] Inserted new booking ${reference}`);
      } else {
        // Réservation présente en DB
        if (dbBooking.bookingStatus === BookingStatus.Cancelled) {
          // Conserver le statut "Cancelled" même si présente dans OpenPro
          console.log(`[StartupSync] Keeping booking ${reference} as cancelled`);
        } else {
          // Récupérer les détails complets pour comparer les dates
          const bookingDetail = await openProClient.getBooking(SUPPLIER_ID, idDossier);
          const datesDiffer = 
            dbBooking.arrivalDate !== bookingDetail.dateArrivee ||
            dbBooking.departureDate !== bookingDetail.dateDepart;

          if (datesDiffer) {
            // Conserver les dates de la DB
            console.log(`[StartupSync] Keeping DB dates for booking ${reference}`);
          } else {
            // Mettre à jour les autres champs si nécessaire
            // (pour l'instant, on ne met à jour que si nécessaire)
          }
        }
      }
    }

    // Traiter les réservations DB absentes d'OpenPro
    for (const dbBooking of openProBookingsInDb) {
      if (!dbBooking.reference) {
        continue;
      }

      const idDossier = parseInt(dbBooking.reference, 10);
      if (isNaN(idDossier)) {
        continue;
      }

      if (!openProBookingsMap.has(idDossier)) {
        // Réservation absente d'OpenPro
        if (dbBooking.bookingStatus !== BookingStatus.Cancelled) {
          // Marquer comme "Cancelled"
          await markBookingAsCancelled(
            SUPPLIER_ID,
            dbBooking.bookingId,
            env,
            typeof dbBooking.accommodationId === 'number' ? dbBooking.accommodationId : undefined,
            dbBooking.arrivalDate,
            dbBooking.departureDate
          );
          console.log(`[StartupSync] Marked booking ${dbBooking.reference} as cancelled (absent from OpenPro)`);
        }
      }
    }

    // Mettre à jour automatiquement les réservations passées
    const today = new Date().toISOString().split('T')[0];
    await env.DB.prepare(`
      UPDATE local_bookings
      SET booking_status = ?, date_modification = datetime('now')
      WHERE reservation_platform = ? 
        AND booking_status != ?
        AND date_depart < ?
    `).bind(
      BookingStatus.Past,
      PlateformeReservation.OpenPro,
      BookingStatus.Past,
      today
    ).run();

    console.log('[StartupSync] OpenPro bookings synchronization completed');
  } catch (error) {
    console.error('[StartupSync] Error during OpenPro bookings synchronization:', error);
    // Ne pas faire échouer le démarrage si la synchronisation échoue
  }
}

/**
 * Exporte les données d'hébergement vers OpenPro au démarrage
 * 
 * Pour chaque hébergement avec un id_openpro, charge les données tarifaires
 * et stock depuis la DB et les exporte vers OpenPro.
 */
export async function exportAccommodationDataOnStartup(env: Env): Promise<void> {
  console.log('[StartupSync] Starting accommodation data export to OpenPro...');
  const SUPPLIER_ID = getSupplierId(env);

  try {
    const accommodations = await loadAllAccommodations(env);
    const accommodationsWithOpenPro = accommodations.filter(acc => acc.ids?.[PlateformeReservation.OpenPro]);

    console.log(`[StartupSync] Found ${accommodationsWithOpenPro.length} accommodations with OpenPro ID`);

    for (const accommodation of accommodationsWithOpenPro) {
      const idOpenProStr = accommodation.ids?.[PlateformeReservation.OpenPro];
      if (!idOpenProStr) {
        continue;
      }

      const idOpenPro = parseInt(idOpenProStr, 10);
      if (isNaN(idOpenPro)) {
        continue;
      }

      try {
        await exportAccommodationDataToOpenPro(
          SUPPLIER_ID,
          idOpenPro,
          accommodation.id,
          env
        );
        console.log(`[StartupSync] Exported data for accommodation ${accommodation.id} (OpenPro ID: ${idOpenPro})`);
      } catch (error) {
        console.error(`[StartupSync] Failed to export data for accommodation ${accommodation.id}:`, error);
        // Continuer avec les autres hébergements même si un échoue
      }
    }

    console.log('[StartupSync] Accommodation data export completed');
  } catch (error) {
    console.error('[StartupSync] Error during accommodation data export:', error);
    // Ne pas faire échouer le démarrage si l'export échoue
  }
}

/**
 * Charge tous les plans tarifaires depuis la DB (y compris ceux sans ID OpenPro)
 */
async function loadAllRateTypesFromDb(env: Env): Promise<Array<{
  id: string;
  id_type_tarif: number | null;
  libelle: string | null;
  description: string | null;
  ordre: number | null;
}>> {
  const result = await env.DB.prepare(`
    SELECT * FROM rate_types
    ORDER BY ordre ASC, id_type_tarif ASC
  `).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  return result.results as Array<{
    id: string;
    id_type_tarif: number | null;
    libelle: string | null;
    description: string | null;
    ordre: number | null;
  }>;
}

/**
 * Vérifie les hébergements au démarrage
 * 
 * Comportement :
 * 1. Charge tous les hébergements depuis la DB
 * 2. Fetche tous les hébergements depuis OpenPro
 * 3. Pour chaque hébergement en DB avec un ID OpenPro :
 *    - Vérifie qu'il existe dans OpenPro
 *    - Si absent dans OpenPro : enregistre un avertissement
 * 4. Note : L'API OpenPro ne permet pas de créer un hébergement, donc on ne peut que vérifier et avertir
 */
export async function verifyAccommodationsOnStartup(env: Env): Promise<void> {
  console.log('[StartupSync] Starting accommodations verification...');
  const SUPPLIER_ID = getSupplierId(env);

  try {
    const openProClient = getOpenProClient(env);

    // 1. Charger tous les hébergements depuis la DB
    const dbAccommodations = await loadAllAccommodations(env);
    const dbAccommodationsWithOpenPro = dbAccommodations.filter(
      acc => acc.ids?.[PlateformeReservation.OpenPro]
    );

    console.log(`[StartupSync] Found ${dbAccommodationsWithOpenPro.length} accommodations with OpenPro ID in DB`);

    // 2. Fetcher tous les hébergements depuis OpenPro
    const openProAccommodationsResponse = await openProClient.listAccommodations(SUPPLIER_ID);
    const openProAccommodations = (openProAccommodationsResponse as any)?.listeHebergement || [];

    console.log(`[StartupSync] Found ${openProAccommodations.length} accommodations in OpenPro`);

    // Créer un Set des IDs OpenPro pour recherche rapide
    const openProIds = new Set<number>();
    for (const acc of openProAccommodations) {
      const idOpenPro = (acc as any).cleHebergement?.idHebergement;
      if (idOpenPro) {
        openProIds.add(Number(idOpenPro));
      }
    }

    // 3. Vérifier chaque hébergement DB avec ID OpenPro
    for (const dbAcc of dbAccommodationsWithOpenPro) {
      const idOpenProStr = dbAcc.ids?.[PlateformeReservation.OpenPro];
      if (!idOpenProStr) {
        continue;
      }

      const idOpenPro = parseInt(idOpenProStr, 10);
      if (isNaN(idOpenPro)) {
        continue;
      }

      if (!openProIds.has(idOpenPro)) {
        // Hébergement absent dans OpenPro
        addWarning({
          type: 'accommodation_missing_in_openpro',
          message: `Hébergement "${dbAcc.nom}" (ID DB: ${dbAcc.id}, ID OpenPro: ${idOpenPro}) présent en DB mais absent dans OpenPro`,
          accommodationId: dbAcc.id
        });
        console.warn(`[StartupSync] WARNING: Hébergement "${dbAcc.nom}" (ID DB: ${dbAcc.id}, ID OpenPro: ${idOpenPro}) présent en DB mais absent dans OpenPro`);
      }
    }

    console.log(`[StartupSync] Accommodations verification completed. ${startupWarnings.length} warning(s) found.`);
  } catch (error) {
    console.error('[StartupSync] Error during accommodations verification:', error);
    // Ne pas faire échouer le démarrage si la vérification échoue
  }
}

/**
 * Synchronise les plans tarifaires au démarrage
 * 
 * Comportement :
 * 1. Charge tous les plans tarifaires depuis la DB
 * 2. Fetche tous les plans tarifaires depuis OpenPro
 * 3. Pour chaque plan tarifaire présent en DB mais absent d'OpenPro :
 *    - Crée automatiquement dans OpenPro via createRateType()
 *    - Met à jour id_type_tarif dans la DB après création
 */
export async function syncRateTypesOnStartup(env: Env): Promise<void> {
  console.log('[StartupSync] Starting rate types synchronization...');
  const SUPPLIER_ID = getSupplierId(env);

  try {
    const openProClient = getOpenProClient(env);

    // 1. Charger tous les plans tarifaires depuis la DB
    const dbRateTypes = await loadAllRateTypesFromDb(env);
    console.log(`[StartupSync] Found ${dbRateTypes.length} rate types in DB`);

    // 2. Fetcher tous les plans tarifaires depuis OpenPro
    const openProRateTypesResponse = await openProClient.listRateTypes(SUPPLIER_ID);
    const openProRateTypes = (openProRateTypesResponse as any)?.typeTarifs || [];

    console.log(`[StartupSync] Found ${openProRateTypes.length} rate types in OpenPro`);

    // Créer un Set des IDs OpenPro pour recherche rapide
    const openProRateTypeIds = new Set<number>();
    for (const rt of openProRateTypes) {
      const idTypeTarif = (rt as any).idTypeTarif;
      if (idTypeTarif) {
        openProRateTypeIds.add(Number(idTypeTarif));
      }
    }

    // 3. Pour chaque plan tarifaire en DB
    for (const dbRateType of dbRateTypes) {
      // Si le plan tarifaire a déjà un ID OpenPro, vérifier qu'il existe dans OpenPro
      if (dbRateType.id_type_tarif !== null) {
        if (!openProRateTypeIds.has(dbRateType.id_type_tarif)) {
          console.warn(`[StartupSync] Rate type with OpenPro ID ${dbRateType.id_type_tarif} exists in DB but not in OpenPro`);
        }
        continue; // Déjà synchronisé
      }

      // Plan tarifaire sans ID OpenPro : créer dans OpenPro
      try {
        // Parser le libellé JSON si présent
        let libelle: any = undefined;
        if (dbRateType.libelle) {
          try {
            libelle = JSON.parse(dbRateType.libelle);
          } catch {
            libelle = dbRateType.libelle;
          }
        }

        // Parser la description JSON si présente
        let description: any = undefined;
        if (dbRateType.description) {
          try {
            description = JSON.parse(dbRateType.description);
          } catch {
            description = dbRateType.description;
          }
        }

        // Créer dans OpenPro
        const createResult = await openProClient.createRateType(SUPPLIER_ID, {
          libelle,
          description,
          ordre: dbRateType.ordre ?? 0  // OpenPro requiert un nombre, utiliser 0 par défaut
        });

        // Extraire l'ID OpenPro retourné
        const idTypeTarif = (createResult as any)?.idTypeTarif || (createResult as any)?.data?.idTypeTarif;
        if (!idTypeTarif) {
          throw new Error('Could not extract idTypeTarif from OpenPro response');
        }

        // Mettre à jour la DB avec l'ID OpenPro
        await updateRateTypeOpenProId(dbRateType.id, Number(idTypeTarif), env);

        console.log(`[StartupSync] Created rate type in OpenPro with ID ${idTypeTarif} (internal ID: ${dbRateType.id})`);
      } catch (error) {
        addWarning({
          type: 'rate_type_creation_failed',
          message: `Échec de création du plan tarifaire (ID DB: ${dbRateType.id}) dans OpenPro: ${error instanceof Error ? error.message : 'Unknown error'}`,
          rateTypeId: dbRateType.id
        });
        console.error(`[StartupSync] Failed to create rate type ${dbRateType.id} in OpenPro:`, error);
        // Continuer avec les autres plans tarifaires même si un échoue
      }
    }

    console.log('[StartupSync] Rate types synchronization completed');
  } catch (error) {
    console.error('[StartupSync] Error during rate types synchronization:', error);
    // Ne pas faire échouer le démarrage si la synchronisation échoue
  }
}

/**
 * Synchronise les liens plans tarifaires/hébergements au démarrage
 * 
 * Comportement :
 * 1. Charge tous les liens depuis la DB
 * 2. Pour chaque hébergement avec un ID OpenPro :
 *    - Fetche les liens depuis OpenPro
 *    - Compare avec les liens en DB
 *    - Pour chaque lien présent en DB mais absent dans OpenPro :
 *      - Crée automatiquement le lien dans OpenPro
 * 3. Force tout écart dans OpenPro pour garantir la cohérence
 */
export async function syncRateTypeLinksOnStartup(env: Env): Promise<void> {
  console.log('[StartupSync] Starting rate type links synchronization...');
  const SUPPLIER_ID = getSupplierId(env);

  try {
    const openProClient = getOpenProClient(env);

    // 1. Charger tous les hébergements avec ID OpenPro
    const accommodations = await loadAllAccommodations(env);
    const accommodationsWithOpenPro = accommodations.filter(
      acc => acc.ids?.[PlateformeReservation.OpenPro]
    );

    console.log(`[StartupSync] Found ${accommodationsWithOpenPro.length} accommodations with OpenPro ID`);

    // 2. Pour chaque hébergement avec ID OpenPro
    for (const accommodation of accommodationsWithOpenPro) {
      const idOpenProStr = accommodation.ids?.[PlateformeReservation.OpenPro];
      if (!idOpenProStr) {
        continue;
      }

      const idOpenPro = parseInt(idOpenProStr, 10);
      if (isNaN(idOpenPro)) {
        continue;
      }

      try {
        // Charger les liens depuis la DB
        const dbLinks = await loadAccommodationRateTypeLinks(accommodation.id, env);

        // Fetcher les liens depuis OpenPro
        const openProLinksResponse = await openProClient.listAccommodationRateTypeLinks(SUPPLIER_ID, idOpenPro);
        const openProLinks = (openProLinksResponse as any)?.liste || [];
        const openProRateTypeIds = new Set<number>();
        for (const link of openProLinks) {
          const idTypeTarif = (link as any).idTypeTarif;
          if (idTypeTarif) {
            openProRateTypeIds.add(Number(idTypeTarif));
          }
        }

        // Comparer et créer les liens manquants dans OpenPro
        for (const dbLinkRateTypeId of dbLinks) {
          if (!openProRateTypeIds.has(dbLinkRateTypeId)) {
            // Lien présent en DB mais absent dans OpenPro : créer dans OpenPro
            try {
              await openProClient.linkRateTypeToAccommodation(SUPPLIER_ID, idOpenPro, dbLinkRateTypeId);
              console.log(`[StartupSync] Created link between accommodation ${accommodation.id} (OpenPro: ${idOpenPro}) and rate type ${dbLinkRateTypeId}`);
            } catch (error) {
              addWarning({
                type: 'link_creation_failed',
                message: `Échec de création du lien entre l'hébergement "${accommodation.nom}" (ID OpenPro: ${idOpenPro}) et le plan tarifaire ${dbLinkRateTypeId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                accommodationId: accommodation.id,
                rateTypeId: dbLinkRateTypeId
              });
              console.error(`[StartupSync] Failed to create link for accommodation ${accommodation.id} and rate type ${dbLinkRateTypeId}:`, error);
              // Continuer avec les autres liens même si un échoue
            }
          }
        }
      } catch (error) {
        console.error(`[StartupSync] Error processing links for accommodation ${accommodation.id}:`, error);
        // Continuer avec les autres hébergements même si un échoue
      }
    }

    console.log('[StartupSync] Rate type links synchronization completed');
  } catch (error) {
    console.error('[StartupSync] Error during rate type links synchronization:', error);
    // Ne pas faire échouer le démarrage si la synchronisation échoue
  }
}

