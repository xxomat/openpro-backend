/**
 * Service de génération iCal
 * 
 * Ce service génère des flux iCal depuis les réservations en DB,
 * en excluant les réservations de la plateforme cible.
 */

import type { IBookingDisplay } from '../../types/api.js';
import { PlateformeReservation, BookingStatus } from '../../types/api.js';

/**
 * Génère un flux iCal depuis les réservations
 * 
 * @param bookings - Réservations à exporter
 * @param platform - Plateforme cible (les réservations de cette plateforme seront exclues)
 * @returns Contenu du flux iCal
 */
export function generateIcal(
  bookings: IBookingDisplay[],
  platform: string
): string {
  // Filtrer les réservations (exclure celles de la plateforme cible)
  const bookingsToExport = bookings.filter(booking => {
    // Exclure les réservations de la plateforme cible
    const platformEnum = platform === 'Booking.com' ? PlateformeReservation.BookingCom
      : platform === 'Directe' ? PlateformeReservation.Directe
      : platform === 'OpenPro' ? PlateformeReservation.OpenPro
      : platform === 'Xotelia' ? PlateformeReservation.Xotelia
      : null;
    
    if (platformEnum && booking.reservationPlatform === platformEnum) {
      return false;
    }
    
    // Exclure les réservations annulées
    if (booking.bookingStatus === BookingStatus.Cancelled) {
      return false;
    }
    return true;
  });

  // Générer le contenu iCal
  const lines: string[] = [];
  
  // En-tête iCal
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//OpenPro Backend//iCal Generator//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  
  // Générer un événement pour chaque réservation
  for (const booking of bookingsToExport) {
    lines.push('BEGIN:VEVENT');
    
    // UID (utiliser la référence si disponible, sinon générer)
    const uid = booking.reference || `booking-${booking.bookingId}@openpro.local`;
    lines.push(`UID:${uid}`);
    
    // Dates (format iCal: YYYYMMDD)
    const dtstart = booking.arrivalDate.replace(/-/g, '');
    const dtend = booking.departureDate.replace(/-/g, '');
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
    lines.push(`DTEND;VALUE=DATE:${dtend}`);
    
    // Résumé
    const summary = booking.clientName || `Réservation ${booking.bookingId}`;
    lines.push(`SUMMARY:${escapeIcalText(summary)}`);
    
    // Description
    const descriptionParts: string[] = [];
    if (booking.clientName) {
      descriptionParts.push(`Client: ${booking.clientName}`);
    }
    if (booking.clientEmail) {
      descriptionParts.push(`Email: ${booking.clientEmail}`);
    }
    if (booking.clientPhone) {
      descriptionParts.push(`Téléphone: ${booking.clientPhone}`);
    }
    if (booking.numberOfPersons) {
      descriptionParts.push(`Personnes: ${booking.numberOfPersons}`);
    }
    if (booking.totalAmount) {
      descriptionParts.push(`Montant: ${booking.totalAmount}€`);
    }
    if (descriptionParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcalText(descriptionParts.join('\\n'))}`);
    }
    
    // Statut
    lines.push('STATUS:CONFIRMED');
    
    // Date de création
    if (booking.creationDate) {
      const dtstamp = booking.creationDate.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      lines.push(`DTSTAMP:${dtstamp}Z`);
    }
    
    lines.push('END:VEVENT');
  }
  
  // Pied de page iCal
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n');
}

/**
 * Échappe le texte pour iCal
 */
function escapeIcalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

