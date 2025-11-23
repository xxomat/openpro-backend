/**
 * Service de chargement des réservations
 * 
 * Ce fichier contient les fonctions pour charger les réservations
 * pour un hébergement depuis l'API OpenPro.
 */

import type { BookingDisplay } from '../../types/api.js';
import { getOpenProClient } from '../openProClient.js';
import type { Booking } from '../../../openpro-api-react/src/client/types.js';
import type { Env } from '../../index.js';

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
    
    // Construire le nom du client
    let clientNom: string | undefined;
    if (booking.client) {
      const parts: string[] = [];
      if (booking.client.prenom) parts.push(booking.client.prenom);
      if (booking.client.nom) parts.push(booking.client.nom);
      clientNom = parts.length > 0 ? parts.join(' ') : undefined;
    }
    
    // Extraire le montant total
    const montantTotal = booking.paiement?.montantTotal;
    
    // Extraire le nombre de personnes
    const nbPersonnes = booking.hebergement?.nbPersonnes;
    
    bookings.push({
      idDossier: booking.idDossier ?? 0,
      idHebergement: booking.hebergement.idHebergement ?? idHebergement,
      dateArrivee: booking.hebergement.dateArrivee,
      dateDepart: booking.hebergement.dateDepart,
      reference: booking.reference,
      clientNom,
      montantTotal,
      nbPersonnes
    });
  }
  
  return bookings;
}

