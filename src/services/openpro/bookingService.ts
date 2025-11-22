/**
 * Service de chargement des réservations
 * 
 * Ce fichier contient les fonctions pour charger les réservations
 * pour un hébergement depuis l'API OpenPro.
 */

import type { BookingDisplay } from '../../types/api.js';
import { PlateformeReservation } from '../../types/api.js';
import { getOpenProClient } from '../openProClient.js';
import type { Booking, DossierTransaction } from '../../../openpro-api-react/src/client/types.js';
import type { Env } from '../../index.js';

/**
 * Détermine la plateforme de réservation à partir des informations de transaction
 * 
 * @param transaction - Informations de transaction du dossier de réservation
 * @returns La plateforme de réservation ou Unknown si aucune transaction n'est présente
 */
function getPlateformeReservation(
  transaction?: DossierTransaction
): PlateformeReservation {
  if (!transaction) {
    return PlateformeReservation.Unknown;
  }

  // Priorité : Booking.com > Xotelia > OpenPro > Directe
  if (transaction.transactionBooking) {
    return PlateformeReservation.BookingCom;
  }
  
  if (transaction.transactionXotelia) {
    return PlateformeReservation.Xotelia;
  }
  
  if (transaction.transactionOpenSystem) {
    return PlateformeReservation.OpenPro;
  }
  
  if (transaction.transactionResaLocale) {
    return PlateformeReservation.Directe;
  }

  return PlateformeReservation.Unknown;
}

/**
 * Charge toutes les réservations pour un hébergement
 * 
 * Cette fonction récupère toutes les réservations du fournisseur depuis l'API OpenPro
 * et filtre celles qui correspondent à l'hébergement donné. Les réservations sont
 * transformées en BookingDisplay pour l'affichage dans le frontend.
 * 
 * Note: Toutes les réservations sont chargées (pas de filtre par dates), le frontend
 * se chargera de filtrer celles à afficher selon la plage de dates sélectionnée.
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param idHebergement - Identifiant de l'hébergement
 * @param env - Variables d'environnement Workers
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Tableau des réservations pour cet hébergement
 * @throws {Error} Peut lever une erreur si le chargement des réservations échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function loadBookingsForAccommodation(
  idFournisseur: number,
  idHebergement: number,
  env: Env,
  signal?: AbortSignal
): Promise<BookingDisplay[]> {
  const openProClient = getOpenProClient(env);
  // Charger toutes les réservations du fournisseur (pas de filtre par dates)
  const bookingList = await openProClient.listBookings(idFournisseur);
  if (signal?.aborted) throw new Error('Cancelled');
  
  const bookings: BookingDisplay[] = [];
  const dossiers = bookingList.dossiers ?? [];
  
  for (const dossier of dossiers) {
    const booking = dossier as Booking;
    
    // Filtrer par hébergement
    if (booking.hebergement?.idHebergement !== idHebergement) {
      continue;
    }
    
    // Vérifier que les dates sont présentes
    if (!booking.hebergement?.dateArrivee || !booking.hebergement?.dateDepart) {
      continue;
    }
    
    // Extraire toutes les informations du client
    let clientNom: string | undefined;
    let clientCivilite: string | undefined;
    let clientEmail: string | undefined;
    let clientTelephone: string | undefined;
    let clientRemarques: string | undefined;
    let clientAdresse: string | undefined;
    let clientCodePostal: string | undefined;
    let clientVille: string | undefined;
    let clientPays: string | undefined;
    let clientDateNaissance: string | undefined;
    let clientNationalite: string | undefined;
    let clientProfession: string | undefined;
    let clientSociete: string | undefined;
    let clientSiret: string | undefined;
    let clientTva: string | undefined;
    let clientLangue: string | undefined;
    let clientNewsletter: boolean | undefined;
    let clientCgvAcceptees: boolean | undefined;
    
    if (booking.client) {
      const parts: string[] = [];
      if (booking.client.prenom) parts.push(booking.client.prenom);
      if (booking.client.nom) parts.push(booking.client.nom);
      clientNom = parts.length > 0 ? parts.join(' ') : undefined;
      clientCivilite = booking.client.civilite;
      clientEmail = booking.client.email;
      clientTelephone = booking.client.telephone;
      clientRemarques = booking.client.remarques;
      clientAdresse = booking.client.adresse;
      clientCodePostal = booking.client.codePostal;
      clientVille = booking.client.ville;
      clientPays = booking.client.pays;
      clientDateNaissance = booking.client.dateNaissance;
      clientNationalite = booking.client.nationalite;
      clientProfession = booking.client.profession;
      clientSociete = booking.client.societe;
      clientSiret = booking.client.siret;
      clientTva = booking.client.tva;
      clientLangue = booking.client.langue;
      clientNewsletter = booking.client.newsletter;
      clientCgvAcceptees = booking.client.cgvAcceptees;
    }
    
    // Extraire le montant total et la devise
    const montantTotal = booking.paiement?.montantTotal;
    const devise = booking.paiement?.devise;
    
    // Extraire les informations de l'hébergement
    const nbPersonnes = booking.hebergement?.nbPersonnes;
    const nbNuits = booking.hebergement?.nbNuits;
    const typeTarifLibelle = booking.hebergement?.typeTarif?.libelle;
    
    // Extraire la date de création
    const dateCreation = booking.dateCreation;
    
    // Déterminer la plateforme de réservation
    const plateformeReservation = getPlateformeReservation(booking.transaction);
    
    bookings.push({
      idDossier: booking.idDossier ?? 0,
      idHebergement: booking.hebergement.idHebergement ?? idHebergement,
      dateArrivee: booking.hebergement.dateArrivee,
      dateDepart: booking.hebergement.dateDepart,
      reference: booking.reference,
      clientNom,
      clientCivilite,
      clientEmail,
      clientTelephone,
      clientRemarques,
      clientAdresse,
      clientCodePostal,
      clientVille,
      clientPays,
      clientDateNaissance,
      clientNationalite,
      clientProfession,
      clientSociete,
      clientSiret,
      clientTva,
      clientLangue,
      clientNewsletter,
      clientCgvAcceptees,
      montantTotal,
      nbPersonnes,
      nbNuits,
      typeTarifLibelle,
      devise,
      dateCreation,
      plateformeReservation
    });
  }
  
  return bookings;
}

