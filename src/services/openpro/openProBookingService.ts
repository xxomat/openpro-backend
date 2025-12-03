/**
 * Service de mapping des réservations OpenPro vers le format DB
 * 
 * Ce service convertit les données de réservation OpenPro (dossiers) en format
 * compatible avec la base de données locale.
 */

import type { Booking } from '@openpro-api-react/client/types.js';
import type { IBookingDisplay } from '../../types/api.js';
import { PlateformeReservation, BookingStatus } from '../../types/api.js';
import { findAccommodationByOpenProId } from './accommodationService.js';
import type { Env } from '../../index.js';

/**
 * Mappe un dossier OpenPro vers le format IBookingDisplay
 * 
 * @param dossier - Dossier OpenPro
 * @param env - Variables d'environnement Workers
 * @returns IBookingDisplay correspondant
 */
export async function mapOpenProDossierToBooking(
  dossier: Booking,
  env: Env
): Promise<IBookingDisplay> {
  // Construire le nom complet du client
  const clientNameParts: string[] = [];
  const client = dossier.client as any;
  if (client?.prenom) clientNameParts.push(client.prenom);
  if (client?.nom) clientNameParts.push(client.nom);
  const clientName = clientNameParts.length > 0 ? clientNameParts.join(' ') : undefined;

  // Trouver l'hébergement correspondant dans la DB
  let accommodationId: number | string = (dossier.idHebergement as any) || 0;
  if (dossier.idHebergement) {
    const accommodation = await findAccommodationByOpenProId((dossier.idHebergement as any), env);
    if (accommodation) {
      accommodationId = accommodation.id; // Utiliser l'ID interne de la DB
    }
  }

  // Déterminer l'état de la réservation
  // Par défaut, on considère les réservations OpenPro comme "Confirmed"
  let bookingStatus: BookingStatus = BookingStatus.Confirmed;
  
  // Si le dossier a un statut d'annulation, marquer comme "Cancelled"
  // (à adapter selon la structure réelle des données OpenPro)
  const statut = (dossier.statut as any);
  if (statut === 'annule' || statut === 'annulé' || statut === 'annulee') {
    bookingStatus = BookingStatus.Cancelled;
  }

  // Utiliser idDossier comme reference
  const reference = (dossier.idDossier as any) ? String(dossier.idDossier) : undefined;

  return {
    bookingId: (dossier.idDossier as any) || 0,
    accommodationId,
    arrivalDate: (dossier.dateArrivee as any) || '',
    departureDate: (dossier.dateDepart as any) || '',
    reference,
    clientName,
    clientTitle: client?.civilite,
    clientEmail: client?.email,
    clientPhone: client?.telephone,
    clientNotes: client?.remarques,
    clientAddress: client?.adresse,
    clientPostalCode: client?.codePostal,
    clientCity: client?.ville,
    clientCountry: client?.pays,
    clientBirthDate: client?.dateNaissance,
    clientNationality: client?.nationalite,
    clientProfession: client?.profession,
    clientCompany: client?.societe,
    clientSiret: client?.siret,
    clientVat: client?.tvaIntracommunautaire,
    clientLanguage: client?.langue,
    clientNewsletter: client?.newsletter,
    clientTermsAccepted: client?.cgvAcceptees,
    totalAmount: (dossier.montant as any) || undefined,
    numberOfPersons: (dossier.nbPersonnes as any) || undefined,
    numberOfNights: (dossier.nbNuits as any) || undefined,
    rateTypeLabel: (dossier.typeTarif as any)?.libelle,
    currency: (dossier.devise as any),
    creationDate: (dossier.dateCreation as any),
    reservationPlatform: PlateformeReservation.OpenPro,
    bookingStatus,
    isPendingSync: false,
    isObsolete: false
  };
}

