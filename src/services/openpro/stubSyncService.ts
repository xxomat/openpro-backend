/**
 * Service de synchronisation avec le stub-server en mode test
 * 
 * Ce service envoie les réservations créées localement vers le stub-server
 * pour permettre les tests end-to-end. En production, cette synchronisation
 * sera gérée via iCal externe.
 */

import type { Env } from '../../index.js';
import type { IBookingDisplay } from '../../types/api.js';

/**
 * Type pour le payload de création de dossier envoyé au stub-server
 */
export interface DossierCreationPayload {
  idFournisseur: number;
  reference: string;
  dateCreation: string;
  dateModification: string;
  client: {
    civilite: string;
    nom: string;
    prenom?: string;
    email: string;
    telephone: string;
    remarques: string;
    adresse: string;
    codePostal: string;
    ville: string;
    pays: string;
    dateNaissance: string;
    nationalite: string;
    profession: string;
    societe: string;
    siret: string;
    tva: string;
    langue: string;
    newsletter: boolean;
    cgvAcceptees: boolean;
  };
  hebergement: {
    idHebergement: number;
    nom: string;
    dateArrivee: string;
    dateDepart: string;
    nbNuits: number;
    nbPersonnes: number;
    typeTarif: {
      idTypeTarif: number;
      libelle: string;
      description: string;
    };
  };
  paiement: {
    montantTotal: number;
    devise: string;
    transactions: unknown[];
  };
  transaction: {
    transactionResaLocale: {
      idTransaction: string;
      reference: string;
      dateCreation: string;
      dateModification: string;
      montant: number;
      devise: string;
      statut: string;
      pointDeVente: string;
      utilisateur: string;
    };
  };
}

/**
 * Vérifie si on est en mode stub (localhost:3000)
 */
export function isStubMode(env: Env): boolean {
  return env.OPENPRO_BASE_URL.includes('localhost:3000') || 
         env.OPENPRO_BASE_URL.includes('127.0.0.1:3000');
}

/**
 * Convertit une réservation locale (IBookingDisplay) en format dossier pour le stub-server
 */
function convertBookingToDossier(
  booking: IBookingDisplay,
  idFournisseur: number
): DossierCreationPayload {
  // Calculer le nombre de nuits
  const arrivalDate = new Date(booking.arrivalDate);
  const departureDate = new Date(booking.departureDate);
  const numberOfNights = Math.ceil((departureDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Extraire nom et prénom du client
  const clientNameParts = booking.clientName?.split(' ') || [];
  const clientFirstName = clientNameParts.length > 1 ? clientNameParts.slice(0, -1).join(' ') : undefined;
  const clientLastName = clientNameParts.length > 0 ? clientNameParts[clientNameParts.length - 1] : undefined;
  
  return {
    idFournisseur,
    reference: booking.reference || `RES-${new Date().getFullYear()}-${String(booking.bookingId || Date.now()).padStart(3, '0')}`,
    dateCreation: booking.creationDate || new Date().toISOString(),
    dateModification: booking.creationDate || new Date().toISOString(),
    client: {
      civilite: booking.clientTitle || 'M',
      nom: clientLastName || '',
      prenom: clientFirstName || '',
      email: booking.clientEmail || '',
      telephone: booking.clientPhone || '',
      remarques: booking.clientNotes || '',
      adresse: booking.clientAddress || '',
      codePostal: booking.clientPostalCode || '',
      ville: booking.clientCity || '',
      pays: booking.clientCountry || '',
      dateNaissance: booking.clientBirthDate || '',
      nationalite: booking.clientNationality || '',
      profession: booking.clientProfession || '',
      societe: booking.clientCompany || '',
      siret: booking.clientSiret || '',
      tva: booking.clientVat || '',
      langue: booking.clientLanguage || 'fr',
      newsletter: booking.clientNewsletter || false,
      cgvAcceptees: booking.clientTermsAccepted || true
    },
    hebergement: {
      idHebergement: booking.accommodationId,
      nom: '', // Le nom sera récupéré par le stub-server depuis ses données
      dateArrivee: booking.arrivalDate,
      dateDepart: booking.departureDate,
      nbNuits: booking.numberOfNights || numberOfNights,
      nbPersonnes: booking.numberOfPersons || 2,
      typeTarif: {
        idTypeTarif: 1001,
        libelle: booking.rateTypeLabel || 'Tarif public',
        description: 'Tarif public annulable sans frais jusqu\'au jour de votre arrivée'
      }
    },
    paiement: {
      montantTotal: booking.totalAmount || 0,
      devise: booking.currency || 'EUR',
      transactions: []
    },
    transaction: {
      transactionResaLocale: {
        idTransaction: `TXN-LOC-${booking.bookingId || Date.now()}`,
        reference: `REF-LOC-${booking.reference || `RES-${new Date().getFullYear()}-${String(booking.bookingId || Date.now()).padStart(3, '0')}`}`,
        dateCreation: booking.creationDate || new Date().toISOString(),
        dateModification: booking.creationDate || new Date().toISOString(),
        montant: booking.totalAmount || 0,
        devise: booking.currency || 'EUR',
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
  booking: IBookingDisplay,
  idFournisseur: number,
  env: Env
): Promise<void> {
  // Ne rien faire si on n'est pas en mode stub
  if (!isStubMode(env)) {
    return;
  }
  
  try {
    const dossier = convertBookingToDossier(booking, idFournisseur);
    const url = `${env.OPENPRO_BASE_URL}/fournisseur/${idFournisseur}/dossiers`;
    const startTime = Date.now();
    
    // Logger l'appel OpenPro
    console.log(`[OpenPro API] POST ${url}`, { body: dossier });
    
    // Envoyer la requête POST au stub-server
    const response = await fetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `OsApiKey ${env.OPENPRO_API_KEY}`
        },
        body: JSON.stringify(dossier)
      }
    );
    
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OpenPro API] POST ${url} → ${response.status} (${duration}ms)`, { error: errorText });
      console.error(`[STUB SYNC] Failed to sync booking to stub-server: ${response.status} ${errorText}`);
      // Ne pas faire échouer la création de réservation si la sync échoue
      return;
    }
    
    const result = await response.json();
    if (result.ok === 1) {
      console.log(`[OpenPro API] POST ${url} → ${response.status} (${duration}ms)`);
      console.log(`[STUB SYNC] Successfully synced booking ${booking.idDossier} to stub-server`);
    } else {
      console.error(`[OpenPro API] POST ${url} → ${response.status} (${duration}ms)`, { error: result });
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
    const startTime = Date.now();
    
    // Logger l'appel OpenPro
    console.log(`[OpenPro API] DELETE ${url}`);
    console.log(`[STUB SYNC] Deleting booking ${idDossier} from stub-server at ${url}`);
    
    // Supprimer directement le dossier par ID
    const deleteResponse = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `OsApiKey ${env.OPENPRO_API_KEY}`
      }
    });
    
    const duration = Date.now() - startTime;
    
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error(`[OpenPro API] DELETE ${url} → ${deleteResponse.status} (${duration}ms)`, { error: errorText });
      console.error(`[STUB SYNC] Failed to delete booking ${idDossier} from stub-server: ${deleteResponse.status} ${errorText}`);
      return;
    }
    
    const result = await deleteResponse.json();
    console.log(`[OpenPro API] DELETE ${url} → ${deleteResponse.status} (${duration}ms)`);
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
    const url = `${env.OPENPRO_BASE_URL}/fournisseur/${idFournisseur}/dossiers`;
    const startTime = Date.now();
    
    // Logger l'appel OpenPro
    console.log(`[OpenPro API] GET ${url}`);
    
    const response = await fetch(
      url,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `OsApiKey ${env.OPENPRO_API_KEY}`
        }
      }
    );
    
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      console.error(`[OpenPro API] GET ${url} → ${response.status} (${duration}ms)`);
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
    const deleteUrl = `${env.OPENPRO_BASE_URL}/fournisseur/${idFournisseur}/dossiers/${matchingDossier.idDossier}`;
    const deleteStartTime = Date.now();
    
    // Logger l'appel OpenPro
    console.log(`[OpenPro API] DELETE ${deleteUrl}`);
    
    const deleteResponse = await fetch(
      deleteUrl,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `OsApiKey ${env.OPENPRO_API_KEY}`
        }
      }
    );
    
    const deleteDuration = Date.now() - deleteStartTime;
    
    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error(`[OpenPro API] DELETE ${deleteUrl} → ${deleteResponse.status} (${deleteDuration}ms)`, { error: errorText });
      console.error(`[STUB SYNC] Failed to delete booking from stub-server: ${deleteResponse.status} ${errorText}`);
      return;
    }
    
    console.log(`[OpenPro API] DELETE ${deleteUrl} → ${deleteResponse.status} (${deleteDuration}ms)`);
    console.log(`[STUB SYNC] Successfully deleted booking ${matchingDossier.idDossier} from stub-server`);
  } catch (error) {
    // Ne pas faire échouer la suppression si la sync stub échoue
    console.error('[STUB SYNC] Error deleting booking from stub-server:', error);
  }
}

