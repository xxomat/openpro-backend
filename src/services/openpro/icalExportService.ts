/**
 * Service d'export iCal des réservations locales
 * 
 * Ce service génère des fichiers iCalendar (RFC 5545) à partir des réservations locales
 * stockées dans la base de données D1.
 */

import type { BookingDisplay } from '../../types/api.js';
import type { Env } from '../../index.js';
import { loadAllLocalBookingsForSupplier } from './localBookingService.js';

/**
 * Génère un fichier iCal à partir des réservations locales d'un fournisseur
 */
export async function generateIcalFile(
  idFournisseur: number,
  env: Env,
  filters?: { debut?: string; fin?: string; idHebergement?: number }
): Promise<string> {
  // Charger toutes les réservations locales du fournisseur
  const bookings = await loadAllLocalBookingsForSupplier(idFournisseur, env);
  
  // Filtrer les réservations selon les critères
  let filteredBookings = bookings;
  
  if (filters?.idHebergement) {
    filteredBookings = filteredBookings.filter(b => b.idHebergement === filters.idHebergement);
  }
  
  if (filters?.debut) {
    const debutDate = new Date(filters.debut + 'T00:00:00');
    filteredBookings = filteredBookings.filter(b => {
      const arriveeDate = new Date(b.dateArrivee + 'T00:00:00');
      return arriveeDate >= debutDate;
    });
  }
  
  if (filters?.fin) {
    const finDate = new Date(filters.fin + 'T23:59:59');
    filteredBookings = filteredBookings.filter(b => {
      const arriveeDate = new Date(b.dateArrivee + 'T00:00:00');
      return arriveeDate <= finDate;
    });
  }
  
  // Générer le contenu iCal
  return generateIcalContent(filteredBookings, idFournisseur);
}

/**
 * Génère le contenu iCal à partir d'une liste de réservations
 */
function generateIcalContent(bookings: BookingDisplay[], idFournisseur: number): string {
  const lines: string[] = [];
  
  // En-tête du calendrier
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//OpenPro Backend//iCal Export//FR');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  
  // Générer un événement pour chaque réservation
  for (const booking of bookings) {
    lines.push(...generateVEvent(booking, idFournisseur));
  }
  
  // Fin du calendrier
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n') + '\r\n';
}

/**
 * Génère un événement VEVENT pour une réservation
 */
function generateVEvent(booking: BookingDisplay, idFournisseur: number): string[] {
  const lines: string[] = [];
  
  lines.push('BEGIN:VEVENT');
  
  // UID unique
  const uid = `local-booking-${idFournisseur}-${booking.idDossier}@openpro-backend`;
  lines.push(`UID:${uid}`);
  
  // Dates (format YYYYMMDD)
  const dtStart = formatIcalDate(booking.dateArrivee);
  const dtEnd = formatIcalDate(booking.dateDepart);
  lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
  lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
  
  // Summary (nom du client + référence)
  const clientName = booking.clientNom || 'Client inconnu';
  const reference = booking.reference || `RES-${booking.idDossier}`;
  const summary = `${clientName} - ${reference}`;
  lines.push(`SUMMARY:${escapeIcalText(summary)}`);
  
  // Description (détails de la réservation)
  const description = buildDescription(booking);
  lines.push(`DESCRIPTION:${escapeIcalText(description)}`);
  
  // Status
  lines.push('STATUS:CONFIRMED');
  
  // Dates de création et modification
  if (booking.dateCreation) {
    const created = formatIcalDateTime(booking.dateCreation);
    lines.push(`CREATED:${created}`);
  }
  
  if (booking.dateCreation) {
    // Utiliser dateCreation comme LAST-MODIFIED si pas de dateModification
    const lastModified = formatIcalDateTime(booking.dateCreation);
    lines.push(`LAST-MODIFIED:${lastModified}`);
  }
  
  // Timestamp de création de l'événement iCal
  const dtStamp = formatIcalDateTime(new Date().toISOString());
  lines.push(`DTSTAMP:${dtStamp}`);
  
  lines.push('END:VEVENT');
  
  return lines;
}

/**
 * Construit la description d'une réservation pour l'événement iCal
 */
function buildDescription(booking: BookingDisplay): string {
  const parts: string[] = [];
  
  parts.push(`Hébergement ID: ${booking.idHebergement}`);
  
  if (booking.nbPersonnes) {
    parts.push(`Nombre de personnes: ${booking.nbPersonnes}`);
  }
  
  if (booking.nbNuits) {
    parts.push(`Nombre de nuits: ${booking.nbNuits}`);
  }
  
  if (booking.montantTotal) {
    const devise = booking.devise || 'EUR';
    parts.push(`Montant: ${booking.montantTotal} ${devise}`);
  }
  
  if (booking.clientEmail) {
    parts.push(`Email: ${booking.clientEmail}`);
  }
  
  if (booking.clientTelephone) {
    parts.push(`Téléphone: ${booking.clientTelephone}`);
  }
  
  if (booking.typeTarifLibelle) {
    parts.push(`Type de tarif: ${booking.typeTarifLibelle}`);
  }
  
  return parts.join('\\n');
}

/**
 * Formate une date au format iCal (YYYYMMDD)
 */
function formatIcalDate(dateStr: string): string {
  // dateStr est au format YYYY-MM-DD
  return dateStr.replace(/-/g, '');
}

/**
 * Formate une date/heure au format iCal (YYYYMMDDTHHMMSSZ)
 */
function formatIcalDateTime(dateStr: string): string {
  // dateStr est au format ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
  const date = new Date(dateStr);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Échappe le texte pour le format iCal
 * Les caractères spéciaux doivent être échappés selon RFC 5545
 */
function escapeIcalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

