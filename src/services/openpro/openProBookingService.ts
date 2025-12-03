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
  const dossierData = dossier as any;
  
  // Extraire les dates depuis le premier hébergement
  // Note: Un dossier peut avoir plusieurs hébergements, on prend le premier
  const listeHebergement = dossierData.listeHebergement || [];
  const firstHebergement = listeHebergement[0];
  
  if (!firstHebergement?.sejour?.debut || !firstHebergement?.sejour?.fin) {
    throw new Error('Missing sejour dates in booking dossier');
  }

  const arrivalDate = firstHebergement.sejour.debut;
  const departureDate = firstHebergement.sejour.fin;

  // Construire le nom complet du client depuis contact
  const clientNameParts: string[] = [];
  const contact = dossierData.contact;
  if (contact?.prenom) clientNameParts.push(contact.prenom);
  if (contact?.nom) clientNameParts.push(contact.nom);
  const clientName = clientNameParts.length > 0 ? clientNameParts.join(' ') : undefined;

  // Trouver l'hébergement correspondant dans la DB
  let accommodationId: number | string = firstHebergement.cleHebergement?.idHebergement || 0;
  if (firstHebergement.cleHebergement?.idHebergement) {
    const accommodation = await findAccommodationByOpenProId(
      firstHebergement.cleHebergement.idHebergement, 
      env
    );
    if (accommodation) {
      accommodationId = accommodation.id; // Utiliser l'ID interne de la DB
    }
  }

  // Déterminer l'état de la réservation
  // Par défaut, on considère les réservations OpenPro comme "Confirmed"
  let bookingStatus: BookingStatus = BookingStatus.Confirmed;
  
  // Si le dossier a un statut d'annulation, marquer comme "Cancelled"
  const statut = dossierData.statut;
  if (statut === 'annule' || statut === 'annulé' || statut === 'annulee') {
    bookingStatus = BookingStatus.Cancelled;
  }

  // Utiliser idDossier comme reference
  const reference = dossierData.cleDossier?.idDossier 
    ? String(dossierData.cleDossier.idDossier) 
    : undefined;

  // Extraire le montant et autres infos depuis le premier hébergement
  const totalAmount = firstHebergement.montant;
  const numberOfPersons = firstHebergement.pax?.nbPers;
  const numberOfNights = arrivalDate && departureDate 
    ? Math.ceil((new Date(departureDate).getTime() - new Date(arrivalDate).getTime()) / (1000 * 60 * 60 * 24))
    : undefined;

  return {
    bookingId: dossierData.cleDossier?.idDossier || 0,
    accommodationId,
    arrivalDate,
    departureDate,
    reference,
    clientName,
    clientTitle: contact?.civilite,
    clientEmail: contact?.email,
    clientPhone: contact?.telephone1,
    clientNotes: contact?.remarques ?? undefined,
    clientAddress: contact?.adresse,
    clientPostalCode: contact?.codePostal,
    clientCity: contact?.ville,
    clientCountry: contact?.pays,
    clientBirthDate: contact?.dateNaissance,
    clientNationality: contact?.nationalite,
    clientProfession: contact?.profession,
    clientCompany: contact?.societe ?? undefined,
    clientSiret: contact?.siret,
    clientVat: contact?.tvaIntracommunautaire,
    clientLanguage: contact?.langue,
    clientNewsletter: contact?.newsletter,
    clientTermsAccepted: contact?.cgvAcceptees,
    totalAmount,
    numberOfPersons,
    numberOfNights,
    rateTypeLabel: firstHebergement.tarif?.typeTarif?.libelle,
    currency: dossierData.devise,
    creationDate: dossierData.dateCreation,
    reservationPlatform: PlateformeReservation.OpenPro,
    bookingStatus,
    isPendingSync: false,
    isObsolete: false
  };
}

