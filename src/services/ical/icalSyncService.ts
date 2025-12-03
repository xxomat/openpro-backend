/**
 * Service de synchronisation iCal
 * 
 * Ce service gère l'import et l'export iCal, ainsi que la gestion des URLs.
 */

import type { Env } from '../../index.js';
import { parseIcal, type IcalEvent } from './icalParser.js';
import { generateIcal } from './icalGenerator.js';
import { loadAllBookings } from '../openpro/localBookingService.js';
import { PlateformeReservation, BookingStatus } from '../../types/api.js';
import type { IIcalSyncConfig } from '../../types/api.js';

/**
 * Interface pour une ligne de configuration iCal en DB
 */
interface IcalSyncConfigRow {
  id: string;
  id_hebergement: string;
  platform: string;
  import_url: string | null;
  export_url: string | null;
  date_creation: string;
  date_modification: string;
}

/**
 * Synchronise les réservations depuis un flux iCal import
 * 
 * @param idHebergement - ID de l'hébergement
 * @param platform - Plateforme (ex: 'Booking.com')
 * @param env - Variables d'environnement Workers
 */
export async function syncIcalImport(
  idHebergement: string,
  platform: string,
  env: Env
): Promise<void> {
  // Charger la configuration iCal
  const config = await loadIcalSyncConfig(idHebergement, platform, env);
  
  if (!config || !config.importUrl) {
    console.log(`[iCalSync] No import URL configured for accommodation ${idHebergement} and platform ${platform}`);
    return;
  }

  try {
    // Télécharger le flux iCal
    const response = await fetch(config.importUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.status} ${response.statusText}`);
    }
    
    const icalContent = await response.text();
    
    // Parser le flux
    const events = parseIcal(icalContent);
    
    console.log(`[iCalSync] Parsed ${events.length} events from iCal for accommodation ${idHebergement}`);
    
    // Charger les réservations existantes pour cette plateforme
    const allBookings = await loadAllBookings(env);
    const existingBookings = allBookings.filter(
      b => b.reservationPlatform === (platform === 'Booking.com' ? PlateformeReservation.BookingCom : PlateformeReservation.Unknown)
        && typeof b.accommodationId === 'string' && b.accommodationId === idHebergement
    );
    
    const existingBookingsMap = new Map<string, typeof allBookings[0]>();
    for (const booking of existingBookings) {
      if (booking.reference) {
        existingBookingsMap.set(booking.reference, booking);
      }
    }
    
    // Traiter chaque événement iCal
    for (const event of events) {
      // Ignorer les événements annulés
      if (event.status === 'CANCELLED') {
        // Marquer la réservation correspondante comme annulée si elle existe
        const existing = existingBookingsMap.get(event.uid);
        if (existing && existing.bookingStatus !== BookingStatus.Cancelled) {
          const { SUPPLIER_ID } = await import('../../config/supplier.js');
          const { markBookingAsCancelled } = await import('../openpro/localBookingService.js');
          await markBookingAsCancelled(
            SUPPLIER_ID,
            existing.bookingId,
            env,
            typeof existing.accommodationId === 'string' ? undefined : existing.accommodationId,
            existing.arrivalDate,
            existing.departureDate
          );
          console.log(`[iCalSync] Marked booking ${event.uid} as cancelled`);
        }
        continue;
      }
      
      // Vérifier si la réservation existe déjà
      const existing = existingBookingsMap.get(event.uid);
      
      if (existing) {
        // Mettre à jour si les dates ont changé
        if (existing.arrivalDate !== event.dtstart || existing.departureDate !== event.dtend) {
          await env.DB.prepare(`
            UPDATE local_bookings
            SET date_arrivee = ?, date_depart = ?, date_modification = datetime('now')
            WHERE reference = ? AND reservation_platform = ?
          `).bind(event.dtstart, event.dtend, event.uid, platform === 'Booking.com' ? PlateformeReservation.BookingCom : PlateformeReservation.Unknown).run();
          console.log(`[iCalSync] Updated booking ${event.uid}`);
        }
      } else {
        // Créer une nouvelle réservation
        const { SUPPLIER_ID } = await import('../../config/supplier.js');
        const reservationPlatform = platform === 'Booking.com' ? PlateformeReservation.BookingCom : PlateformeReservation.Unknown;
        
        await env.DB.prepare(`
          INSERT INTO local_bookings (
            id_fournisseur, id_hebergement, date_arrivee, date_depart,
            reference, reservation_platform, booking_status,
            date_creation, date_modification
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          SUPPLIER_ID,
          idHebergement,
          event.dtstart,
          event.dtend,
          event.uid,
          reservationPlatform,
          BookingStatus.Confirmed
        ).run();
        
        console.log(`[iCalSync] Created new booking ${event.uid}`);
      }
    }
    
    // Marquer comme annulées les réservations absentes du flux iCal
    const eventUids = new Set(events.map(e => e.uid));
    for (const booking of existingBookings) {
      if (booking.reference && !eventUids.has(booking.reference) && booking.bookingStatus !== BookingStatus.Cancelled) {
        const { SUPPLIER_ID } = await import('../../config/supplier.js');
        const { markBookingAsCancelled } = await import('../openpro/localBookingService.js');
        await markBookingAsCancelled(
          SUPPLIER_ID,
          booking.bookingId,
          env,
          typeof booking.accommodationId === 'string' ? undefined : booking.accommodationId,
          booking.arrivalDate,
          booking.departureDate
        );
        console.log(`[iCalSync] Marked booking ${booking.reference} as cancelled (absent from iCal)`);
      }
    }
    
  } catch (error) {
    console.error(`[iCalSync] Error syncing iCal import for accommodation ${idHebergement}:`, error);
    throw error;
  }
}

/**
 * Génère l'URL d'export iCal
 */
export function generateExportUrl(
  baseUrl: string,
  idHebergement: string,
  platform: string
): string {
  return `${baseUrl}/api/ical/export/${idHebergement}/${encodeURIComponent(platform)}`;
}

/**
 * Récupère le flux iCal d'export
 * 
 * @param idHebergement - ID de l'hébergement
 * @param platform - Plateforme cible
 * @param env - Variables d'environnement Workers
 * @returns Contenu du flux iCal
 */
export async function getExportIcal(
  idHebergement: string,
  platform: string,
  env: Env
): Promise<string> {
  // Charger toutes les réservations pour cet hébergement
  const allBookings = await loadAllBookings(env);
  const bookingsForAccommodation = allBookings.filter(
    b => typeof b.accommodationId === 'string' && b.accommodationId === idHebergement
  );
  
  // Générer le flux iCal (exclut automatiquement les réservations de la plateforme cible)
  return generateIcal(bookingsForAccommodation, platform);
}

/**
 * Charge une configuration iCal
 */
export async function loadIcalSyncConfig(
  idHebergement: string,
  platform: string,
  env: Env
): Promise<IIcalSyncConfig | null> {
  const row = await env.DB.prepare(`
    SELECT * FROM ical_sync_config
    WHERE id_hebergement = ? AND platform = ?
  `).bind(idHebergement, platform).first() as IcalSyncConfigRow | null;
  
  if (!row) {
    return null;
  }
  
  return {
    id: row.id,
    idHebergement: row.id_hebergement,
    platform: row.platform,
    importUrl: row.import_url || undefined,
    exportUrl: row.export_url || undefined,
    dateCreation: row.date_creation,
    dateModification: row.date_modification
  };
}

/**
 * Sauvegarde une configuration iCal
 */
export async function saveIcalSyncConfig(
  config: {
    idHebergement: string;
    platform: string;
    importUrl?: string;
    exportUrl?: string;
  },
  baseUrl: string,
  env: Env
): Promise<IIcalSyncConfig> {
  const now = new Date().toISOString();
  
  // Vérifier si la configuration existe déjà
  const existing = await env.DB.prepare(`
    SELECT id FROM ical_sync_config
    WHERE id_hebergement = ? AND platform = ?
  `).bind(config.idHebergement, config.platform).first();
  
  // Générer l'URL d'export si non fournie
  const exportUrl = config.exportUrl || generateExportUrl(baseUrl, config.idHebergement, config.platform);
  
  if (existing) {
    // Mettre à jour
    await env.DB.prepare(`
      UPDATE ical_sync_config
      SET import_url = ?, export_url = ?, date_modification = ?
      WHERE id_hebergement = ? AND platform = ?
    `).bind(
      config.importUrl || null,
      exportUrl,
      now,
      config.idHebergement,
      config.platform
    ).run();
    
    return (await loadIcalSyncConfig(config.idHebergement, config.platform, env))!;
  } else {
    // Créer
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO ical_sync_config (id, id_hebergement, platform, import_url, export_url, date_creation, date_modification)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      config.idHebergement,
      config.platform,
      config.importUrl || null,
      exportUrl,
      now,
      now
    ).run();
    
    return (await loadIcalSyncConfig(config.idHebergement, config.platform, env))!;
  }
}

/**
 * Supprime une configuration iCal
 */
export async function deleteIcalSyncConfig(
  idHebergement: string,
  platform: string,
  env: Env
): Promise<boolean> {
  const result = await env.DB.prepare(`
    DELETE FROM ical_sync_config
    WHERE id_hebergement = ? AND platform = ?
  `).bind(idHebergement, platform).run();
  
  return result.success && (result.meta.changes || 0) > 0;
}

/**
 * Charge toutes les configurations iCal pour un hébergement
 */
export async function loadAllIcalSyncConfigs(
  idHebergement: string,
  env: Env
): Promise<IIcalSyncConfig[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM ical_sync_config
    WHERE id_hebergement = ?
    ORDER BY platform ASC
  `).bind(idHebergement).all();
  
  if (!result.results || result.results.length === 0) {
    return [];
  }
  
  return (result.results as IcalSyncConfigRow[]).map(row => ({
    id: row.id,
    idHebergement: row.id_hebergement,
    platform: row.platform,
    importUrl: row.import_url || undefined,
    exportUrl: row.export_url || undefined,
    dateCreation: row.date_creation,
    dateModification: row.date_modification
  }));
}

