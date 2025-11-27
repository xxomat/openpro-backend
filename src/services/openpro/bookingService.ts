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
import { 
  updateSyncedStatusForLocalBookings
} from './localBookingService.js';

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
 * Si des réservations locales sont fournies, elles sont fusionnées avec les réservations OpenPro :
 * - Les réservations locales qui correspondent à une réservation OpenPro sont remplacées par la version OpenPro
 * - Les réservations locales sans correspondance sont ajoutées avec isPendingSync: true
 * - Les réservations Direct dans OpenPro sans correspondance locale sont marquées comme obsolètes
 * 
 * Note: Toutes les réservations sont chargées (pas de filtre par dates), le frontend
 * se chargera de filtrer celles à afficher selon la plage de dates sélectionnée.
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param idHebergement - Identifiant de l'hébergement
 * @param env - Variables d'environnement Workers
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @param localBookings - Réservations locales optionnelles à fusionner
 * @returns Tableau des réservations pour cet hébergement
 * @throws {Error} Peut lever une erreur si le chargement des réservations échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function loadBookingsForAccommodation(
  idFournisseur: number,
  idHebergement: number,
  env: Env,
  signal?: AbortSignal,
  localBookings?: BookingDisplay[]
): Promise<BookingDisplay[]> {
  const openProClient = getOpenProClient(env);
  // Charger toutes les réservations du fournisseur (pas de filtre par dates)
  const bookingList = await openProClient.listBookings(idFournisseur);
  if (signal?.aborted) throw new Error('Cancelled');
  
  const bookings: BookingDisplay[] = [];
  // Le nouveau format retourne une liste de résumés (BookingSummary)
  // Il faut charger les détails complets pour chaque résumé
  const summaries = bookingList.liste ?? [];
  
  for (const summary of summaries) {
    // Charger les détails complets du dossier
    const dossier = await openProClient.getBooking(summary.cleDossier.idFournisseur, summary.cleDossier.idDossier);
    if (signal?.aborted) throw new Error('Cancelled');
    
    // Le nouveau format retourne directement le dossier (BookingDossier)
    // Il peut y avoir plusieurs hébergements dans listeHebergement
    const listeHebergement = dossier.listeHebergement ?? [];
    
    for (const hebergementItem of listeHebergement) {
      // Filtrer par hébergement
      if (hebergementItem.cleHebergement?.idHebergement !== idHebergement) {
        continue;
      }
      
      // Vérifier que les dates sont présentes
      if (!hebergementItem.sejour?.debut || !hebergementItem.sejour?.fin) {
        continue;
      }
      
      // Extraire toutes les informations du contact
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
      
      if (dossier.contact) {
        const parts: string[] = [];
        if (dossier.contact.prenom) parts.push(dossier.contact.prenom);
        if (dossier.contact.nom) parts.push(dossier.contact.nom);
        clientNom = parts.length > 0 ? parts.join(' ') : undefined;
        // Note: contact n'a pas de civilite dans le nouveau format
        clientEmail = dossier.contact.email;
        clientTelephone = dossier.contact.telephone1;
        clientRemarques = dossier.contact.remarques ?? undefined;
        clientAdresse = dossier.contact.adresse;
        clientCodePostal = dossier.contact.codePostal;
        clientVille = dossier.contact.ville;
        clientPays = dossier.contact.pays;
        // Note: contact n'a pas dateNaissance, nationalite, profession dans le nouveau format
        clientSociete = dossier.contact.societe ?? undefined;
        // Note: contact n'a pas siret, tva, langue, newsletter, cgvAcceptees dans le nouveau format
      }
      
      // Extraire le montant et la devise
      const montantTotal = hebergementItem.montant;
      const devise = dossier.devise;
      
      // Extraire les informations de l'hébergement
      const nbPersonnes = hebergementItem.pax?.nbPers;
      // Calculer le nombre de nuits à partir des dates
      const dateArrivee = hebergementItem.sejour.debut;
      const dateDepart = hebergementItem.sejour.fin;
      const nbNuits = dateArrivee && dateDepart 
        ? Math.ceil((new Date(dateDepart).getTime() - new Date(dateArrivee).getTime()) / (1000 * 60 * 60 * 24))
        : undefined;
      const typeTarifLibelle = hebergementItem.tarif?.typeTarif?.libelle;
      
      // Extraire la date de création
      const dateCreation = dossier.dateCreation;
      
      // Déterminer la plateforme de réservation et extraire la référence
      // Adapter getPlateformeReservation pour le nouveau format de transaction
      let plateformeReservation = PlateformeReservation.Unknown;
      let reference: string | undefined = undefined;
      
      if (dossier.transaction) {
        if (dossier.transaction.transactionResaLocale) {
          plateformeReservation = PlateformeReservation.Directe;
          // Pour ResaLocale, on peut utiliser idTransaction ou reference si disponible
          const resaLocale = dossier.transaction.transactionResaLocale as any;
          reference = resaLocale?.reference || resaLocale?.idTransaction || undefined;
        } else if (dossier.transaction.transactionBooking) {
          plateformeReservation = PlateformeReservation.BookingCom;
          // Pour Booking, on peut utiliser confirmationCode ou reference si disponible
          const booking = dossier.transaction.transactionBooking as any;
          reference = booking?.confirmationCode || booking?.reference || booking?.idTransaction || undefined;
        } else if (dossier.transaction.transactionXotelia) {
          plateformeReservation = PlateformeReservation.Xotelia;
          // Pour Xotelia, on peut utiliser reference ou idTransaction si disponible
          const xotelia = dossier.transaction.transactionXotelia as any;
          reference = xotelia?.reference || xotelia?.idTransaction || undefined;
        } else if (dossier.transaction.transactionOpenSystem) {
          plateformeReservation = PlateformeReservation.OpenPro;
          // Pour OpenSystem, utiliser idReservation (c'est la référence principale)
          reference = dossier.transaction.transactionOpenSystem.idReservation || undefined;
        }
      }
      
      bookings.push({
        idDossier: dossier.cleDossier.idDossier,
        idHebergement: hebergementItem.cleHebergement.idHebergement,
        dateArrivee: hebergementItem.sejour.debut,
        dateDepart: hebergementItem.sejour.fin,
        reference,
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
        plateformeReservation,
        isPendingSync: false,
        isObsolete: false
      });
    }
  }
  
  // Si des réservations locales sont fournies, les fusionner
  if (localBookings && localBookings.length > 0) {
    // Filtrer les réservations Direct depuis OpenPro
    const openProDirectBookings = bookings.filter(b => 
      b.plateformeReservation === PlateformeReservation.Directe
    );
    
    // Mettre à jour synced_at pour les réservations locales synchronisées
    await updateSyncedStatusForLocalBookings(
      idFournisseur,
      localBookings,
      openProDirectBookings,
      env
    );
    
    // Note: Les réservations obsolètes sont détectées dynamiquement ci-dessous
    // Elles ne sont PAS stockées dans la DB, seulement marquées avec isObsolete: true
    
    // Fusionner les réservations
    const mergedBookings: BookingDisplay[] = [];
    const processedLocalIds = new Set<string>();
    
    // D'abord, ajouter toutes les réservations OpenPro
    for (const openProBooking of bookings) {
      if (openProBooking.plateformeReservation === PlateformeReservation.Directe) {
        // Vérifier si cette réservation Direct correspond à une réservation locale
        const localMatch = localBookings.find(localBooking =>
          localBooking.idHebergement === openProBooking.idHebergement &&
          localBooking.dateArrivee === openProBooking.dateArrivee &&
          localBooking.dateDepart === openProBooking.dateDepart
        );
        
        if (localMatch) {
          // Garder la version OpenPro (plus complète), marquer comme synchronisée
          mergedBookings.push({
            ...openProBooking,
            isPendingSync: false,
            isObsolete: false
          });
          // Marquer la réservation locale comme traitée
          processedLocalIds.add(`${localMatch.idHebergement}-${localMatch.dateArrivee}-${localMatch.dateDepart}`);
        } else {
          // Réservation Direct dans OpenPro sans correspondance locale = obsolète
          mergedBookings.push({
            ...openProBooking,
            isPendingSync: false,
            isObsolete: true
          });
        }
      } else {
        // Réservation non-Directe, l'ajouter telle quelle
        mergedBookings.push(openProBooking);
      }
    }
    
    // Ensuite, ajouter les réservations locales qui n'ont pas de correspondance OpenPro
    for (const localBooking of localBookings) {
      const localId = `${localBooking.idHebergement}-${localBooking.dateArrivee}-${localBooking.dateDepart}`;
      if (!processedLocalIds.has(localId)) {
        // Pas de correspondance OpenPro, ajouter avec isPendingSync: true
        mergedBookings.push({
          ...localBooking,
          isPendingSync: localBooking.isPendingSync ?? true,
          isObsolete: false
        });
      }
    }
    
    return mergedBookings;
  }
  
  // Si pas de réservations locales, toutes les réservations Direct depuis OpenPro sont obsolètes
  // (elles n'ont pas de correspondance locale dans la DB)
  return bookings.map(booking => {
    if (booking.plateformeReservation === PlateformeReservation.Directe) {
      return {
        ...booking,
        isPendingSync: false,
        isObsolete: true // Pas de réservation locale = obsolète
      };
    }
    return booking; // Les réservations non-Directe restent inchangées
  });
}

