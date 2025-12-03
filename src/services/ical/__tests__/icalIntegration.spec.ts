/**
 * Tests d'intégration iCal avec base D1
 * 
 * Ces tests utilisent une vraie base D1 locale via wrangler
 * pour valider le cycle complet export -> import
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Env } from '../../../index.js';
import { getExportIcal, saveIcalSyncConfig } from '../icalSyncService.js';
import { parseIcal } from '../icalParser.js';
import { createAccommodation } from '../../openpro/accommodationService.js';
import { createLocalBooking } from '../../openpro/localBookingService.js';
import { loadAllBookings } from '../../openpro/localBookingService.js';
import { PlateformeReservation, BookingStatus } from '../../../types/api.js';
import { SUPPLIER_ID } from '../../../config/supplier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../../../../');

/**
 * Crée une base D1 locale et retourne un mock d'Env
 * Note: Ces tests nécessitent une vraie base D1 locale
 * Pour les exécuter, il faut d'abord appliquer le schéma avec:
 * wrangler d1 execute openpro-db --local --file=./schema.sql
 */
async function createTestEnv(): Promise<Env> {
  // Pour les tests, on va utiliser la base D1 locale existante
  // et s'assurer que le schéma est appliqué
  try {
    const schemaPath = join(rootDir, 'schema.sql');
    execSync(
      `npx wrangler d1 execute openpro-db --local --file=${schemaPath}`,
      { cwd: rootDir, stdio: 'pipe' }
    );
  } catch (error: any) {
    // Ignorer les erreurs si le schéma est déjà appliqué ou si la base n'existe pas
    const errorMsg = error.message || String(error);
    if (!errorMsg.includes('already exists') && 
        !errorMsg.includes('duplicate') &&
        !errorMsg.includes('no such column')) {
      console.warn('Warning: Could not apply schema:', errorMsg);
    }
  }

  // Note: Pour que ces tests fonctionnent vraiment, il faudrait utiliser
  // la vraie instance D1 via wrangler ou un mock plus sophistiqué
  // Pour l'instant, on va skip ces tests si la base n'est pas disponible
  throw new Error('D1 database not available in test environment. These tests require a real D1 database.');
}

describe.skip('iCal Integration Test - Round Trip with D1 (Legacy)', () => {
  // Ces tests sont skip car ils nécessitent une vraie base D1
  // Pour les activer, il faut:
  // 1. Appliquer le schéma: wrangler d1 execute openpro-db --local --file=./schema.sql
  // 2. Implémenter un vrai accès à la base D1 dans les tests
  
  let env: Env;
  let accommodationId: string;
  const platform = 'Booking.com';
  const baseUrl = 'http://localhost:8787';

  beforeEach(async () => {
    // env = await createTestEnv();
    // Pour l'instant, on skip ces tests
    return;
  });

  afterEach(async () => {
    // Nettoyer la base de test
    try {
      await env.DB.prepare('DELETE FROM local_bookings WHERE id_fournisseur = ?').bind(SUPPLIER_ID).run();
      await env.DB.prepare('DELETE FROM ical_sync_config WHERE id_hebergement = ?').bind(accommodationId).run();
      await env.DB.prepare('DELETE FROM accommodation_external_ids WHERE id_hebergement = ?').bind(accommodationId).run();
      await env.DB.prepare('DELETE FROM accommodations WHERE id = ?').bind(accommodationId).run();
    } catch (error) {
      // Ignorer les erreurs de nettoyage
      console.warn('Cleanup error:', error);
    }
  });

  it('should perform round-trip: export iCal, parse it, and verify data integrity', async () => {
    // Créer quelques réservations de test dans la DB
    await createLocalBooking({
      supplierId: SUPPLIER_ID,
      accommodationId: accommodationId,
      arrivalDate: '2025-06-01',
      departureDate: '2025-06-05',
      clientName: 'Jean',
      clientFirstName: 'Dupont',
      clientEmail: 'jean.dupont@example.com',
      clientPhone: '+33123456789',
      numberOfPersons: 2,
      totalAmount: 500,
      reference: 'booking-direct-1'
    }, env);

    await createLocalBooking({
      supplierId: SUPPLIER_ID,
      accommodationId: accommodationId,
      arrivalDate: '2025-06-10',
      departureDate: '2025-06-15',
      clientName: 'Marie',
      clientFirstName: 'Martin',
      clientEmail: 'marie.martin@example.com',
      numberOfPersons: 4,
      totalAmount: 800,
      reference: 'booking-openpro-1'
    }, env);

    // Créer une réservation Booking.com (qui sera exclue de l'export)
    await env.DB.prepare(`
      INSERT INTO local_bookings (
        id_fournisseur, id_hebergement, date_arrivee, date_depart,
        reference, reservation_platform, booking_status,
        date_creation, date_modification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      SUPPLIER_ID,
      accommodationId,
      '2025-06-20',
      '2025-06-25',
      'booking-bookingcom-1',
      PlateformeReservation.BookingCom,
      BookingStatus.Confirmed
    ).run();

    // Étape 1: Générer le flux iCal d'export
    const exportIcal = await getExportIcal(accommodationId, platform, env);
    
    expect(exportIcal).toContain('BEGIN:VCALENDAR');
    expect(exportIcal).toContain('END:VCALENDAR');
    
    // Vérifier que les réservations Booking.com sont exclues
    expect(exportIcal).not.toContain('booking-bookingcom-1');
    
    // Vérifier que les réservations Directe et OpenPro sont incluses
    expect(exportIcal).toContain('booking-direct-1');
    expect(exportIcal).toContain('booking-openpro-1');

    // Étape 2: Parser le flux iCal exporté
    const parsedEvents = parseIcal(exportIcal);
    
    expect(parsedEvents.length).toBe(2); // 2 réservations (Directe + OpenPro, pas Booking.com)
    
    // Vérifier les données parsées
    const directEvent = parsedEvents.find(e => e.uid === 'booking-direct-1');
    expect(directEvent).toBeDefined();
    if (directEvent) {
      expect(directEvent.dtstart).toBe('2025-06-01');
      expect(directEvent.dtend).toBe('2025-06-05');
      expect(directEvent.summary).toContain('Jean Dupont');
      expect(directEvent.description).toContain('jean.dupont@example.com');
    }
  });

  it('should exclude cancelled bookings from export', async () => {
    // Créer une réservation annulée
    await env.DB.prepare(`
      INSERT INTO local_bookings (
        id_fournisseur, id_hebergement, date_arrivee, date_depart,
        reference, reservation_platform, booking_status,
        date_creation, date_modification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      SUPPLIER_ID,
      accommodationId,
      '2025-07-01',
      '2025-07-05',
      'booking-cancelled-1',
      PlateformeReservation.Directe,
      BookingStatus.Cancelled
    ).run();

    // Exporter
    const exportIcal = await getExportIcal(accommodationId, platform, env);
    
    // Vérifier que la réservation annulée n'est pas dans l'export
    expect(exportIcal).not.toContain('booking-cancelled-1');
    
    // Parser et vérifier
    const parsedEvents = parseIcal(exportIcal);
    
    const cancelledEvent = parsedEvents.find(e => e.uid === 'booking-cancelled-1');
    expect(cancelledEvent).toBeUndefined();
  });
});

