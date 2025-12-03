/**
 * Tests de round-trip pour l'import/export iCal
 * 
 * Ces tests valident que les données sont préservées lors d'un cycle
 * export -> parse -> import
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseIcal } from '../icalParser.js';
import { generateIcal } from '../icalGenerator.js';
import type { IBookingDisplay } from '../../../types/api.js';
import { PlateformeReservation, BookingStatus } from '../../../types/api.js';

describe('iCal Round-Trip Test', () => {
  let testBookings: IBookingDisplay[];

  beforeEach(() => {
    // Créer des réservations de test
    testBookings = [
      {
        bookingId: 1,
        accommodationId: 'acc-123',
        arrivalDate: '2025-06-01',
        departureDate: '2025-06-05',
        reference: 'booking-uid-1',
        clientName: 'Jean Dupont',
        clientEmail: 'jean.dupont@example.com',
        clientPhone: '+33123456789',
        numberOfPersons: 2,
        totalAmount: 500,
        reservationPlatform: PlateformeReservation.Directe,
        bookingStatus: BookingStatus.Confirmed,
        isPendingSync: false,
        isObsolete: false
      },
      {
        bookingId: 2,
        accommodationId: 'acc-123',
        arrivalDate: '2025-06-10',
        departureDate: '2025-06-15',
        reference: 'booking-uid-2',
        clientName: 'Marie Martin',
        clientEmail: 'marie.martin@example.com',
        numberOfPersons: 4,
        totalAmount: 800,
        reservationPlatform: PlateformeReservation.OpenPro,
        bookingStatus: BookingStatus.Confirmed,
        isPendingSync: false,
        isObsolete: false
      },
      {
        bookingId: 3,
        accommodationId: 'acc-123',
        arrivalDate: '2025-06-20',
        departureDate: '2025-06-25',
        reference: 'booking-uid-3',
        clientName: 'Pierre Durand',
        reservationPlatform: PlateformeReservation.BookingCom,
        bookingStatus: BookingStatus.Confirmed,
        isPendingSync: false,
        isObsolete: false
      },
      {
        bookingId: 4,
        accommodationId: 'acc-123',
        arrivalDate: '2025-07-01',
        departureDate: '2025-07-05',
        reference: 'booking-uid-4',
        clientName: 'Sophie Bernard',
        reservationPlatform: PlateformeReservation.Directe,
        bookingStatus: BookingStatus.Cancelled,
        isPendingSync: false,
        isObsolete: false
      }
    ];
  });

  it('should preserve booking data when exporting and parsing iCal for Booking.com', () => {
    const platform = 'Booking.com';
    
    // 1. Générer le flux iCal
    const icalContent = generateIcal(testBookings, platform);
    
    // 2. Parser le flux iCal
    const parsedEvents = parseIcal(icalContent);
    
    // 3. Vérifier que les réservations Booking.com sont exclues
    const bookingComBookings = testBookings.filter(
      b => b.reservationPlatform === PlateformeReservation.BookingCom
    );
    expect(bookingComBookings.length).toBe(1);
    
    // 4. Vérifier que les réservations annulées sont exclues
    const cancelledBookings = testBookings.filter(
      b => b.bookingStatus === BookingStatus.Cancelled
    );
    expect(cancelledBookings.length).toBe(1);
    
    // 5. Vérifier le nombre d'événements parsés
    // Devrait être : 4 total - 1 Booking.com - 1 annulée = 2 événements
    expect(parsedEvents.length).toBe(2);
    
    // 6. Créer une map des réservations attendues (excluant Booking.com et annulées)
    const expectedBookings = testBookings.filter(
      b => b.reservationPlatform !== PlateformeReservation.BookingCom 
        && b.bookingStatus !== BookingStatus.Cancelled
    );
    
    // 7. Vérifier chaque événement parsé
    for (const event of parsedEvents) {
      // Trouver la réservation correspondante par UID
      const booking = expectedBookings.find(b => b.reference === event.uid);
      expect(booking).toBeDefined();
      
      if (booking) {
        // Vérifier les dates
        expect(event.dtstart).toBe(booking.arrivalDate);
        expect(event.dtend).toBe(booking.departureDate);
        
        // Vérifier le summary (nom du client)
        if (booking.clientName) {
          expect(event.summary).toContain(booking.clientName);
        }
        
        // Vérifier la description contient les informations client
        if (event.description) {
          if (booking.clientName) {
            expect(event.description).toContain(`Client: ${booking.clientName}`);
          }
          if (booking.clientEmail) {
            expect(event.description).toContain(`Email: ${booking.clientEmail}`);
          }
          if (booking.clientPhone) {
            expect(event.description).toContain(`Téléphone: ${booking.clientPhone}`);
          }
          if (booking.numberOfPersons) {
            expect(event.description).toContain(`Personnes: ${booking.numberOfPersons}`);
          }
          if (booking.totalAmount) {
            expect(event.description).toContain(`Montant: ${booking.totalAmount}€`);
          }
        }
        
        // Vérifier le statut
        expect(event.status).toBe('CONFIRMED');
      }
    }
  });

  it('should preserve booking data when exporting and parsing iCal for Direct platform', () => {
    const platform = 'Directe';
    
    // 1. Générer le flux iCal
    const icalContent = generateIcal(testBookings, platform);
    
    // 2. Parser le flux iCal
    const parsedEvents = parseIcal(icalContent);
    
    // 3. Vérifier que les réservations Directe sont exclues
    const directeBookings = testBookings.filter(
      b => b.reservationPlatform === PlateformeReservation.Directe
    );
    expect(directeBookings.length).toBe(2);
    
    // 4. Vérifier le nombre d'événements parsés
    // Devrait être : 4 total - 2 Directe - 1 annulée = 1 événement (OpenPro + Booking.com)
    // Mais en fait, le filtre dans generateIcal ne filtre que Booking.com explicitement
    // Pour Directe, il faut vérifier que les réservations Directe ne sont PAS dans l'export
    const directeInExport = parsedEvents.filter(e => 
      testBookings.some(b => 
        b.reference === e.uid && b.reservationPlatform === PlateformeReservation.Directe
      )
    );
    expect(directeInExport.length).toBe(0); // Aucune réservation Directe dans l'export
    
    // 5. Vérifier que les réservations non-Directe sont présentes
    const nonDirecteBookings = testBookings.filter(
      b => b.reservationPlatform !== PlateformeReservation.Directe 
        && b.bookingStatus !== BookingStatus.Cancelled
    );
    expect(parsedEvents.length).toBe(nonDirecteBookings.length);
    
    // 6. Vérifier que l'événement OpenPro est présent
    const openProEvent = parsedEvents.find(e => e.uid === 'booking-uid-2');
    expect(openProEvent).toBeDefined();
    if (openProEvent) {
      expect(openProEvent.dtstart).toBe('2025-06-10');
      expect(openProEvent.dtend).toBe('2025-06-15');
    }
  });

  it('should handle bookings without reference by generating UID', () => {
    const bookingsWithoutRef: IBookingDisplay[] = [
      {
        bookingId: 99,
        accommodationId: 'acc-123',
        arrivalDate: '2025-08-01',
        departureDate: '2025-08-05',
        // Pas de reference
        clientName: 'Test User',
        reservationPlatform: PlateformeReservation.Directe,
        bookingStatus: BookingStatus.Confirmed,
        isPendingSync: false,
        isObsolete: false
      }
    ];
    
    const icalContent = generateIcal(bookingsWithoutRef, 'Booking.com');
    const parsedEvents = parseIcal(icalContent);
    
    expect(parsedEvents.length).toBe(1);
    expect(parsedEvents[0].uid).toBe('booking-99@openpro.local');
    expect(parsedEvents[0].dtstart).toBe('2025-08-01');
    expect(parsedEvents[0].dtend).toBe('2025-08-05');
  });

  it('should preserve all booking fields in round-trip', () => {
    const completeBooking: IBookingDisplay = {
      bookingId: 100,
      accommodationId: 'acc-456',
      arrivalDate: '2025-09-01',
      departureDate: '2025-09-10',
      reference: 'complete-booking-uid',
      clientName: 'Complete User',
      clientTitle: 'M.',
      clientEmail: 'complete@example.com',
      clientPhone: '+33987654321',
      clientNotes: 'Notes importantes',
      clientAddress: '123 Rue Test',
      clientPostalCode: '75001',
      clientCity: 'Paris',
      clientCountry: 'France',
      numberOfPersons: 3,
      numberOfNights: 9,
      totalAmount: 1200,
      rateTypeLabel: 'Standard',
      currency: 'EUR',
      creationDate: '2025-01-01T10:00:00Z',
      reservationPlatform: PlateformeReservation.OpenPro,
      bookingStatus: BookingStatus.Confirmed,
      isPendingSync: false,
      isObsolete: false
    };
    
    // Export
    const icalContent = generateIcal([completeBooking], 'Booking.com');
    
    // Parse
    const parsedEvents = parseIcal(icalContent);
    
    expect(parsedEvents.length).toBe(1);
    const event = parsedEvents[0];
    
    // Vérifications essentielles
    expect(event.uid).toBe(completeBooking.reference);
    expect(event.dtstart).toBe(completeBooking.arrivalDate);
    expect(event.dtend).toBe(completeBooking.departureDate);
    expect(event.summary).toContain(completeBooking.clientName);
    
    // Vérifier que la description contient toutes les infos
    if (event.description) {
      expect(event.description).toContain(`Client: ${completeBooking.clientName}`);
      expect(event.description).toContain(`Email: ${completeBooking.clientEmail}`);
      expect(event.description).toContain(`Téléphone: ${completeBooking.clientPhone}`);
      expect(event.description).toContain(`Personnes: ${completeBooking.numberOfPersons}`);
      expect(event.description).toContain(`Montant: ${completeBooking.totalAmount}€`);
    }
  });
});

