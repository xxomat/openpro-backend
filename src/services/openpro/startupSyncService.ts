/**
 * Service de synchronisation au démarrage
 * 
 * Ce service gère :
 * 1. La synchronisation des réservations OpenPro au démarrage
 * 2. L'export des données d'hébergement vers OpenPro au démarrage
 */

import type { Env } from '../../index.js';
import { getOpenProClient } from '../openProClient.js';
import { SUPPLIER_ID } from '../../config/supplier.js';
import { mapOpenProDossierToBooking } from './openProBookingService.js';
import { loadAllBookings, markBookingAsCancelled, updateBookingStatus } from './localBookingService.js';
import { BookingStatus, PlateformeReservation } from '../../types/api.js';
import { loadAllAccommodations } from './accommodationService.js';
import { exportAccommodationDataToOpenPro } from './accommodationDataService.js';

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

  try {
    const openProClient = getOpenProClient(env);

    // Charger toutes les réservations depuis OpenPro
    const openProBookingsResponse = await openProClient.listBookings(SUPPLIER_ID);
    const openProBookings = openProBookingsResponse.bookings || [];

    console.log(`[StartupSync] Found ${openProBookings.length} bookings in OpenPro`);

    // Charger toutes les réservations en DB
    const dbBookings = await loadAllBookings(env);
    const openProBookingsInDb = dbBookings.filter(b => b.reservationPlatform === PlateformeReservation.OpenPro);

    console.log(`[StartupSync] Found ${openProBookingsInDb.length} OpenPro bookings in DB`);

    // Map des réservations OpenPro par reference (idDossier)
    const openProBookingsMap = new Map<number, typeof openProBookings[0]>();
    for (const booking of openProBookings) {
      if (booking.idDossier) {
        openProBookingsMap.set(booking.idDossier, booking);
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
      if (!openProBooking.idDossier) {
        continue;
      }

      const reference = String(openProBooking.idDossier);
      const dbBooking = dbBookingsMap.get(reference);

      if (!dbBooking) {
        // Réservation absente en DB : insérer
        const mappedBooking = await mapOpenProDossierToBooking(openProBooking, env);
        
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
          openProBooking.client?.nom || null,
          openProBooking.client?.prenom || null,
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
          // Vérifier si les dates diffèrent
          const datesDiffer = 
            dbBooking.arrivalDate !== openProBooking.dateArrivee ||
            dbBooking.departureDate !== openProBooking.dateDepart;

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

