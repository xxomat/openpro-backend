/**
 * Tests d'intégration iCal avec vraie base D1 locale
 * 
 * Ces tests utilisent better-sqlite3 pour accéder directement au fichier SQLite
 * de la base D1 locale créée par wrangler.
 * 
 * Prérequis:
 * - La base D1 locale doit exister (créée automatiquement par wrangler dev)
 * - Le schéma doit être appliqué: npm run d1:migrate:local
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';
import type { Env } from '../../../index.js';
import { getExportIcal } from '../icalSyncService.js';
import { parseIcal } from '../icalParser.js';
import { createAccommodation } from '../../openpro/accommodationService.js';
import { createLocalBooking } from '../../openpro/localBookingService.js';
import { PlateformeReservation, BookingStatus } from '../../../types/api.js';
import { getSupplierId } from '../../../config/supplier.js';
import { createD1TestDatabase } from './d1TestHelper.js';

const __dirname = new URL('.', import.meta.url).pathname;
const rootDir = join(__dirname, '../../../../');

describe('iCal Integration Test - Real D1 Database', () => {
  let env: Env;
  let accommodationId: string;
  const platform = 'Booking.com';
  const testSupplierId = 999999;

  beforeAll(async () => {
    // S'assurer que le schéma est appliqué
    try {
      execSync(
        `npx wrangler d1 execute openpro-db --local --file=${join(rootDir, 'schema.sql')}`,
        { cwd: rootDir, stdio: 'pipe' }
      );
    } catch (error: any) {
      // Ignorer les erreurs si le schéma est déjà appliqué
      const errorMsg = error.message || String(error);
      if (!errorMsg.includes('already exists') && !errorMsg.includes('duplicate')) {
        console.warn('Warning: Could not apply schema:', errorMsg);
      }
    }

    // Créer un wrapper D1 qui accède directement au fichier SQLite
    const db = createD1TestDatabase();
    
    env = {
      DB: db,
      OPENPRO_API_KEY: 'test-key',
      OPENPRO_BASE_URL: 'http://localhost:3000',
      FRONTEND_URL: 'http://localhost:4321',
      AI_PROVIDER: 'openai',
      SUPPLIER_ID: '47186',
    };

    // Créer un hébergement de test
    const accommodation = await createAccommodation({
      nom: 'Test Accommodation iCal',
      ids: {
        [PlateformeReservation.Directe]: `test-acc-direct-${Date.now()}`,
        [PlateformeReservation.OpenPro]: '47186'
      }
    }, env);
    
    accommodationId = accommodation.id;
  });

  afterAll(async () => {
    // Nettoyer les données de test
    try {
      await env.DB.prepare('DELETE FROM local_bookings WHERE id_fournisseur = ?').bind(testSupplierId).run();
      await env.DB.prepare('DELETE FROM ical_sync_config WHERE id_hebergement = ?').bind(accommodationId).run();
      await env.DB.prepare('DELETE FROM accommodation_external_ids WHERE id_hebergement = ?').bind(accommodationId).run();
      await env.DB.prepare('DELETE FROM accommodations WHERE id = ?').bind(accommodationId).run();
    } catch (error) {
      // Ignorer les erreurs de nettoyage
      console.warn('Cleanup error:', error);
    }
  });

  it('should export iCal and verify Booking.com bookings are excluded', async () => {
    // Créer des réservations de test
    await createLocalBooking({
      supplierId: testSupplierId,
      accommodationId: accommodationId,
      arrivalDate: '2025-06-01',
      departureDate: '2025-06-05',
      clientName: 'Jean',
      clientFirstName: 'Dupont',
      clientEmail: 'jean.dupont@example.com',
      clientPhone: '+33123456789',
      numberOfPersons: 2,
      totalAmount: 500,
      reference: 'booking-direct-test-1'
    }, env);

    // Créer une réservation Booking.com (sera exclue)
    await env.DB.prepare(`
      INSERT INTO local_bookings (
        id_fournisseur, id_hebergement, date_arrivee, date_depart,
        reference, reservation_platform, booking_status,
        date_creation, date_modification
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      testSupplierId,
      accommodationId,
      '2025-06-20',
      '2025-06-25',
      'booking-bookingcom-test-1',
      PlateformeReservation.BookingCom,
      BookingStatus.Confirmed
    ).run();

    // Exporter
    const exportIcal = await getExportIcal(accommodationId, platform, env);
    
    // Vérifier le format iCal
    expect(exportIcal).toContain('BEGIN:VCALENDAR');
    expect(exportIcal).toContain('END:VCALENDAR');
    
    // Vérifier que Booking.com est exclu
    expect(exportIcal).not.toContain('booking-bookingcom-test-1');
    
    // Vérifier que Directe est inclus
    expect(exportIcal).toContain('booking-direct-test-1');

    // Parser et vérifier
    const parsedEvents = parseIcal(exportIcal);
    expect(parsedEvents.length).toBe(1);
    expect(parsedEvents[0].uid).toBe('booking-direct-test-1');
    expect(parsedEvents[0].dtstart).toBe('2025-06-01');
    expect(parsedEvents[0].dtend).toBe('2025-06-05');
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
      testSupplierId,
      accommodationId,
      '2025-07-01',
      '2025-07-05',
      'booking-cancelled-test-1',
      PlateformeReservation.Directe,
      BookingStatus.Cancelled
    ).run();

    // Exporter
    const exportIcal = await getExportIcal(accommodationId, platform, env);
    
    // Vérifier que la réservation annulée n'est pas dans l'export
    expect(exportIcal).not.toContain('booking-cancelled-test-1');
    
    // Parser et vérifier
    const parsedEvents = parseIcal(exportIcal);
    const cancelledEvent = parsedEvents.find(e => e.uid === 'booking-cancelled-test-1');
    expect(cancelledEvent).toBeUndefined();
  });
});
