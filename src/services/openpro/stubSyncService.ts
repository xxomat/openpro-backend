/**
 * Service de synchronisation avec le stub-server en mode test
 * 
 * Ce service envoie les réservations créées localement vers le stub-server
 * pour permettre les tests end-to-end. En production, cette synchronisation
 * sera gérée via iCal externe.
 */

import type { Env } from '../../index.js';
import type { BookingDisplay } from '../../types/api.js';

/**
 * Vérifie si on est en mode stub (localhost:3000)
 */
export function isStubMode(env: Env): boolean {
  return env.OPENPRO_BASE_URL.includes('localhost:3000') || 
         env.OPENPRO_BASE_URL.includes('127.0.0.1:3000');
}

/**
 * Convertit une réservation locale (BookingDisplay) en format dossier pour le stub-server
 */
function convertBookingToDossier(
  booking: BookingDisplay,
  idFournisseur: number
): Record<string, unknown> {
  // Calculer le nombre de nuits
  const dateArrivee = new Date(booking.dateArrivee);
  const dateDepart = new Date(booking.dateDepart);
  const nbNuits = Math.ceil((dateDepart.getTime() - dateArrivee.getTime()) / (1000 * 60 * 60 * 24));
  
  // Extraire nom et prénom du client
  const clientNomParts = booking.clientNom?.split(' ') || [];
  const clientPrenom = clientNomParts.length > 1 ? clientNomParts.slice(0, -1).join(' ') : undefined;
  const clientNom = clientNomParts.length > 0 ? clientNomParts[clientNomParts.length - 1] : undefined;
  
  return {
    idFournisseur,
    reference: booking.reference || `RES-${new Date().getFullYear()}-${String(booking.idDossier || Date.now()).padStart(3, '0')}`,
    dateCreation: booking.dateCreation || new Date().toISOString(),
    dateModification: booking.dateCreation || new Date().toISOString(),
    client: {
      civilite: booking.clientCivilite || 'M',
      nom: clientNom || '',
      prenom: clientPrenom || '',
      email: booking.clientEmail || '',
      telephone: booking.clientTelephone || '',
      remarques: booking.clientRemarques || '',
      adresse: booking.clientAdresse || '',
      codePostal: booking.clientCodePostal || '',
      ville: booking.clientVille || '',
      pays: booking.clientPays || '',
      dateNaissance: booking.clientDateNaissance || '',
      nationalite: booking.clientNationalite || '',
      profession: booking.clientProfession || '',
      societe: booking.clientSociete || '',
      siret: booking.clientSiret || '',
      tva: booking.clientTva || '',
      langue: booking.clientLangue || 'fr',
      newsletter: booking.clientNewsletter || false,
      cgvAcceptees: booking.clientCgvAcceptees || true
    },
    hebergement: {
      idHebergement: booking.idHebergement,
      nom: '', // Le nom sera récupéré par le stub-server depuis ses données
      dateArrivee: booking.dateArrivee,
      dateDepart: booking.dateDepart,
      nbNuits: booking.nbNuits || nbNuits,
      nbPersonnes: booking.nbPersonnes || 2,
      typeTarif: {
        idTypeTarif: 1001,
        libelle: booking.typeTarifLibelle || 'Tarif public',
        description: 'Tarif public annulable sans frais jusqu\'au jour de votre arrivée'
      }
    },
    paiement: {
      montantTotal: booking.montantTotal || 0,
      devise: booking.devise || 'EUR',
      transactions: []
    },
    transaction: {
      transactionResaLocale: {
        idTransaction: `TXN-LOC-${booking.idDossier || Date.now()}`,
        reference: `REF-LOC-${booking.reference || `RES-${new Date().getFullYear()}-${String(booking.idDossier || Date.now()).padStart(3, '0')}`}`,
        dateCreation: booking.dateCreation || new Date().toISOString(),
        dateModification: booking.dateCreation || new Date().toISOString(),
        montant: booking.montantTotal || 0,
        devise: booking.devise || 'EUR',
        statut: 'confirme',
        pointDeVente: 'Site web',
        utilisateur: 'client'
      }
    }
  };
}

/**
 * Envoie une réservation au stub-server si on est en mode test
 * 
 * @param booking - Réservation créée localement
 * @param idFournisseur - ID du fournisseur
 * @param env - Variables d'environnement
 */
export async function syncBookingToStub(
  booking: BookingDisplay,
  idFournisseur: number,
  env: Env
): Promise<void> {
  // Ne rien faire si on n'est pas en mode stub
  if (!isStubMode(env)) {
    return;
  }
  
  try {
    const dossier = convertBookingToDossier(booking, idFournisseur);
    
    // Envoyer la requête POST au stub-server
    const response = await fetch(
      `${env.OPENPRO_BASE_URL}/fournisseur/${idFournisseur}/dossiers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `OsApiKey ${env.OPENPRO_API_KEY}`
        },
        body: JSON.stringify(dossier)
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[STUB SYNC] Failed to sync booking to stub-server: ${response.status} ${errorText}`);
      // Ne pas faire échouer la création de réservation si la sync échoue
      return;
    }
    
    const result = await response.json();
    if (result.ok === 1) {
      console.log(`[STUB SYNC] Successfully synced booking ${booking.idDossier} to stub-server`);
    } else {
      console.error(`[STUB SYNC] Stub-server returned ok=0:`, result);
    }
  } catch (error) {
    // Ne pas faire échouer la création de réservation si la sync échoue
    console.error('[STUB SYNC] Error syncing booking to stub-server:', error);
  }
}

/**
 * Supprime une réservation du stub-server directement par ID (plus simple et fiable)
 * 
 * @param idDossier - ID du dossier à supprimer
 * @param idFournisseur - ID du fournisseur
 * @param env - Variables d'environnement
 */
export async function deleteBookingFromStubById(
  idDossier: number,
  idFournisseur: number,
  env: Env
): Promise<void> {
  // Ne rien faire si on n'est pas en mode stub
  if (!isStubMode(env)) {
    console.log(`[STUB SYNC] Not in stub mode, skipping deletion of booking ${idDossier}`);
    return;
  }
  
  if (!idDossier || idDossier <= 0) {
    console.warn(`[STUB SYNC] Invalid idDossier (${idDossier}), skipping deletion`);
    return;
  }
  
  try {
    const url = `${env.OPENPRO_BASE_URL}/fournisseur/${idFournisseur}/dossiers/${idDossier}`;
    console.log(`[STUB SYNC] Deleting booking ${idDossier} from stub-server at ${url}`);
    
    // Supprimer directement le dossier par ID
    const deleteResponse = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `OsApiKey ${env.OPENPRO_API_KEY}`
      }
    });
    
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error(`[STUB SYNC] Failed to delete booking ${idDossier} from stub-server: ${deleteResponse.status} ${errorText}`);
      return;
    }
    
    const result = await deleteResponse.json();
    console.log(`[STUB SYNC] Successfully deleted booking ${idDossier} from stub-server`, result);
  } catch (error) {
    // Ne pas faire échouer la suppression si la sync stub échoue
    console.error(`[STUB SYNC] Error deleting booking ${idDossier} from stub-server:`, error);
    if (error instanceof Error) {
      console.error(`[STUB SYNC] Error stack:`, error.stack);
    }
  }
}

/**
 * Supprime une réservation du stub-server si on est en mode test
 * 
 * @param booking - Réservation à supprimer (LocalBookingRow avec les données)
 * @param idFournisseur - ID du fournisseur
 * @param env - Variables d'environnement
 */
export async function deleteBookingFromStub(
  booking: { id: string; id_fournisseur: number; id_hebergement: number; date_arrivee: string; date_depart: string },
  idFournisseur: number,
  env: Env
): Promise<void> {
  // Ne rien faire si on n'est pas en mode stub
  if (!isStubMode(env)) {
    return;
  }
  
  try {
    // Trouver le dossier correspondant dans le stub-server par les critères
    // (idFournisseur, idHebergement, dateArrivee, dateDepart)
    const response = await fetch(
      `${env.OPENPRO_BASE_URL}/fournisseur/${idFournisseur}/dossiers`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `OsApiKey ${env.OPENPRO_API_KEY}`
        }
      }
    );
    
    if (!response.ok) {
      console.error(`[STUB SYNC] Failed to fetch bookings from stub-server: ${response.status}`);
      return;
    }
    
    const result = await response.json();
    // La réponse du stub server est: { ok: 1, data: { meta: {...}, dossiers: [...] } }
    const bookings = result.data?.dossiers || result.data || [];
    
    // Trouver le dossier correspondant
    const matchingDossier = bookings.find((d: any) => {
      const hebergement = d.hebergement;
      return hebergement &&
             hebergement.idHebergement === booking.id_hebergement &&
             hebergement.dateArrivee === booking.date_arrivee &&
             hebergement.dateDepart === booking.date_depart;
    });
    
    if (!matchingDossier) {
      console.log(`[STUB SYNC] Booking not found in stub-server for deletion (may have already been deleted)`);
      return;
    }
    
    // Supprimer le dossier du stub-server
    const deleteResponse = await fetch(
      `${env.OPENPRO_BASE_URL}/fournisseur/${idFournisseur}/dossiers/${matchingDossier.idDossier}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `OsApiKey ${env.OPENPRO_API_KEY}`
        }
      }
    );
    
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error(`[STUB SYNC] Failed to delete booking from stub-server: ${deleteResponse.status} ${errorText}`);
      return;
    }
    
    console.log(`[STUB SYNC] Successfully deleted booking ${matchingDossier.idDossier} from stub-server`);
  } catch (error) {
    // Ne pas faire échouer la suppression si la sync stub échoue
    console.error('[STUB SYNC] Error deleting booking from stub-server:', error);
  }
}

