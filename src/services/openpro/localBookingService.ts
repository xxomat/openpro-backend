/**
 * Service de gestion des réservations locales (Direct)
 * 
 * Ce fichier contient les fonctions pour charger et gérer les réservations
 * locales stockées dans D1, ainsi que la détection de leur état de synchronisation.
 * 
 * Note: Les réservations obsolètes (Direct dans OpenPro sans correspondance locale)
 * ne sont PAS stockées dans la DB. Elles sont détectées dynamiquement lors du chargement.
 */

import type { IBookingDisplay } from '../../types/api.js';
import { PlateformeReservation } from '../../types/api.js';
import type { Env } from '../../index.js';

/**
 * Interface pour une réservation locale en DB
 */
interface LocalBookingRow {
  id: string;
  id_fournisseur: number;
  id_hebergement: number;
  date_arrivee: string;
  date_depart: string;
  client_nom?: string;
  client_prenom?: string;
  client_email?: string;
  client_telephone?: string;
  nb_personnes?: number;
  montant_total?: number;
  reference?: string;
  date_creation: string;
  date_modification: string;
  synced_at?: string | null;
}

/**
 * Charge les réservations locales pour un hébergement donné
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param idHebergement - Identifiant de l'hébergement
 * @param env - Variables d'environnement Workers
 * @returns Tableau des réservations locales pour cet hébergement
 */
export async function loadLocalBookingsForAccommodation(
  idFournisseur: number,
  accommodationId: number,
  env: Env
): Promise<IBookingDisplay[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM local_bookings
    WHERE id_fournisseur = ? AND id_hebergement = ?
    ORDER BY date_arrivee ASC
  `).bind(idFournisseur, accommodationId).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  return (result.results as LocalBookingRow[]).map(row => convertRowToBookingDisplay(row));
}

/**
 * Charge toutes les réservations locales en attente de synchronisation
 * (pour le cron job)
 * 
 * @param env - Variables d'environnement Workers
 * @returns Tableau de toutes les réservations locales où synced_at IS NULL
 */
export async function loadAllLocalBookings(env: Env): Promise<IBookingDisplay[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM local_bookings
    WHERE synced_at IS NULL
    ORDER BY id_fournisseur, id_hebergement, date_arrivee ASC
  `).all();

  if (!result.results || result.results.length === 0) {
    return [];
  }

  return (result.results as LocalBookingRow[]).map(row => convertRowToBookingDisplay(row));
}

/**
 * Met à jour le statut de synchronisation des réservations locales
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param localBookings - Réservations locales à vérifier
 * @param openProBookings - Réservations récupérées depuis OpenPro
 * @param env - Variables d'environnement Workers
 * @returns Statistiques de synchronisation
 */
export async function updateSyncedStatusForLocalBookings(
  idFournisseur: number,
  localBookings: IBookingDisplay[],
  openProBookings: IBookingDisplay[],
  env: Env
): Promise<{ syncedCount: number; pendingCount: number }> {
  let syncedCount = 0;
  let pendingCount = 0;

  for (const localBooking of localBookings) {
    // Vérifier si cette réservation locale a une correspondance dans OpenPro
    const match = openProBookings.find(opBooking => 
      opBooking.accommodationId === localBooking.accommodationId &&
      opBooking.arrivalDate === localBooking.arrivalDate &&
      opBooking.departureDate === localBooking.departureDate &&
      opBooking.reservationPlatform === PlateformeReservation.Directe
    );

    if (match) {
      // Trouver l'ID de la réservation locale dans la DB et vérifier si synced_at est NULL
      const dbRow = await env.DB.prepare(`
        SELECT id, synced_at FROM local_bookings
        WHERE id_fournisseur = ? AND id_hebergement = ?
          AND date_arrivee = ? AND date_depart = ?
        LIMIT 1
      `).bind(
        idFournisseur,
        localBooking.accommodationId,
        localBooking.arrivalDate,
        localBooking.departureDate
      ).first() as { id: string; synced_at: string | null } | null;

      if (dbRow && (dbRow.synced_at === null || dbRow.synced_at === undefined)) {
        // Mettre à jour synced_at si pas déjà synchronisée
        await env.DB.prepare(`
          UPDATE local_bookings
          SET synced_at = datetime('now'), date_modification = datetime('now')
          WHERE id = ?
        `).bind(dbRow.id).run();
        syncedCount++;
      } else if (dbRow) {
        // Déjà synchronisée
        syncedCount++;
      }
    } else {
      pendingCount++;
    }
  }

  return { syncedCount, pendingCount };
}

/**
 * Interface pour les données de création d'une réservation locale
 */
export interface CreateLocalBookingData {
  supplierId: number;
  accommodationId: number;
  arrivalDate: string; // Format: YYYY-MM-DD
  departureDate: string;  // Format: YYYY-MM-DD
  clientName?: string;
  clientFirstName?: string;
  clientEmail?: string;
  clientPhone?: string;
  numberOfPersons?: number;
  totalAmount?: number;
  reference?: string;
}

/**
 * Crée une nouvelle réservation locale dans la DB
 * 
 * @param data - Données de la réservation à créer
 * @param env - Variables d'environnement Workers
 * @returns La réservation créée au format BookingDisplay
 * @throws {Error} Si la création échoue (dates invalides, contraintes DB, etc.)
 */
export async function createLocalBooking(
  data: CreateLocalBookingData,
  env: Env
): Promise<IBookingDisplay> {
  // Valider les dates
  if (data.departureDate <= data.arrivalDate) {
    throw new Error('departureDate must be greater than arrivalDate');
  }

  // Valider le nombre de personnes
  const numberOfPersons = data.numberOfPersons ?? 2;
  if (numberOfPersons <= 0) {
    throw new Error('numberOfPersons must be greater than 0');
  }

  // Insérer la réservation dans la DB
  // L'ID sera généré automatiquement par SQLite
  await env.DB.prepare(`
    INSERT INTO local_bookings (
      id_fournisseur,
      id_hebergement,
      date_arrivee,
      date_depart,
      client_nom,
      client_prenom,
      client_email,
      client_telephone,
      nb_personnes,
      montant_total,
      reference,
      synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    data.supplierId,
    data.accommodationId,
    data.arrivalDate,
    data.departureDate,
    data.clientName || null,
    data.clientFirstName || null,
    data.clientEmail || null,
    data.clientPhone || null,
    numberOfPersons,
    data.totalAmount || null,
    data.reference || null
  ).run();

  // Récupérer la réservation créée en utilisant les critères uniques
  // (plus fiable que last_row_id en D1)
  const createdRow = await env.DB.prepare(`
    SELECT * FROM local_bookings
    WHERE id_fournisseur = ? AND id_hebergement = ? 
      AND date_arrivee = ? AND date_depart = ?
      AND date_creation >= datetime('now', '-1 second')
    ORDER BY date_creation DESC
    LIMIT 1
  `).bind(
    data.supplierId,
    data.accommodationId,
    data.arrivalDate,
    data.departureDate
  ).first() as LocalBookingRow | null;

  if (!createdRow) {
    throw new Error('Failed to retrieve created booking');
  }

  return convertRowToBookingDisplay(createdRow);
}

/**
 * Convertit une ligne de DB en IBookingDisplay
 * 
 * @param row - Ligne de la table local_bookings
 * @returns IBookingDisplay correspondant
 */
function convertRowToBookingDisplay(row: LocalBookingRow): IBookingDisplay {
  // Construire le nom complet du client
  const clientNameParts: string[] = [];
  if (row.client_prenom) clientNameParts.push(row.client_prenom);
  if (row.client_nom) clientNameParts.push(row.client_nom);
  const clientName = clientNameParts.length > 0 ? clientNameParts.join(' ') : undefined;

  // Utiliser l'ID interne de la DB comme bookingId pour identifier les réservations locales
  // Convertir l'ID hexadécimal en nombre (premiers caractères) pour compatibilité avec bookingId
  let bookingId = 0;
  try {
    // Utiliser une partie de l'ID hexadécimal comme identifiant numérique
    // On prend les 8 premiers caractères hex et on les convertit en nombre
    const hexPart = row.id.substring(0, 8);
    bookingId = parseInt(hexPart, 16);
  } catch {
    // Si la conversion échoue, utiliser 0
    bookingId = 0;
  }

  return {
    bookingId, // ID interne de la DB converti en nombre pour identifier les réservations locales
    accommodationId: row.id_hebergement,
    arrivalDate: row.date_arrivee,
    departureDate: row.date_depart,
    reference: row.reference,
    clientName,
    clientEmail: row.client_email,
    clientPhone: row.client_telephone,
    numberOfPersons: row.nb_personnes,
    totalAmount: row.montant_total,
    creationDate: row.date_creation,
    reservationPlatform: PlateformeReservation.Directe,
    isPendingSync: row.synced_at === null || row.synced_at === undefined,
    isObsolete: false // Les réservations dans la DB ne sont jamais obsolètes
  };
}

/**
 * Trouve une réservation locale par son ID interne de la DB (converti depuis bookingId)
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param bookingId - ID de la réservation (bookingId converti depuis l'ID interne)
 * @param env - Variables d'environnement Workers
 * @returns La réservation locale trouvée ou null si non trouvée
 */
async function findLocalBookingByIdDossier(
  idFournisseur: number,
  bookingId: number,
  env: Env
): Promise<LocalBookingRow | null> {
  // Pour les réservations locales, on utilise une approche hybride :
  // On cherche toutes les réservations du fournisseur et on compare l'ID converti
  const result = await env.DB.prepare(`
    SELECT * FROM local_bookings
    WHERE id_fournisseur = ?
    ORDER BY date_creation DESC
  `).bind(idFournisseur).all();

  if (!result.results || result.results.length === 0) {
    return null;
  }

  // Parcourir les résultats pour trouver celle dont l'ID converti correspond
  // On essaie plusieurs méthodes de conversion pour être plus robuste
  for (const row of result.results as LocalBookingRow[]) {
    try {
      // Méthode 1: 8 premiers caractères hex convertis en nombre
      if (row.id.length >= 8) {
        const hexPart = row.id.substring(0, 8);
        const rowBookingId = parseInt(hexPart, 16);
        if (rowBookingId === bookingId) {
          return row;
        }
      }
      
      // Méthode 2: 8 caractères suivants (si la première méthode ne fonctionne pas)
      if (row.id.length >= 16) {
        const hexPart2 = row.id.substring(8, 16);
        const rowBookingId2 = parseInt(hexPart2, 16);
        if (rowBookingId2 === bookingId) {
          return row;
        }
      }
      
      // Méthode 3: Hash simple basé sur la longueur et les caractères
      const hashId = row.id.length * 1000 + row.id.charCodeAt(0) * 100 + 
                     (row.id.length > 1 ? row.id.charCodeAt(row.id.length - 1) : 0);
      if (hashId === bookingId) {
        return row;
      }
    } catch {
      // Ignorer les erreurs de conversion
    }
  }

  return null;
}

/**
 * Trouve une réservation locale par une combinaison unique de critères
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param accommodationId - Identifiant de l'hébergement
 * @param arrivalDate - Date d'arrivée (YYYY-MM-DD)
 * @param departureDate - Date de départ (YYYY-MM-DD)
 * @param env - Variables d'environnement Workers
 * @returns La réservation locale trouvée ou null si non trouvée
 */
async function findLocalBookingByCriteria(
  idFournisseur: number,
  accommodationId: number,
  arrivalDate: string,
  departureDate: string,
  env: Env
): Promise<LocalBookingRow | null> {
  const result = await env.DB.prepare(`
    SELECT * FROM local_bookings
    WHERE id_fournisseur = ? 
      AND id_hebergement = ?
      AND date_arrivee = ?
      AND date_depart = ?
    LIMIT 1
  `).bind(idFournisseur, accommodationId, arrivalDate, departureDate).first();

  return (result as LocalBookingRow) || null;
}

/**
 * Supprime une réservation locale de la DB
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param bookingId - ID de la réservation (bookingId converti depuis l'ID interne)
 * @param env - Variables d'environnement Workers
 * @param accommodationId - Identifiant de l'hébergement (optionnel, pour une recherche plus précise)
 * @param arrivalDate - Date d'arrivée (optionnel, pour une recherche plus précise)
 * @param departureDate - Date de départ (optionnel, pour une recherche plus précise)
 * @returns True si la réservation a été supprimée, false sinon
 * @throws {Error} Si la suppression échoue
 */
export async function deleteLocalBooking(
  idFournisseur: number,
  bookingId: number,
  env: Env,
  accommodationId?: number,
  arrivalDate?: string,
  departureDate?: string
): Promise<{ success: boolean; deletedBooking: LocalBookingRow | null }> {
  let booking: LocalBookingRow | null = null;

  // Si on a les critères complets, utiliser la recherche par critères (plus fiable)
  if (accommodationId !== undefined && arrivalDate && departureDate) {
    booking = await findLocalBookingByCriteria(idFournisseur, accommodationId, arrivalDate, departureDate, env);
  }
  
  // Sinon, essayer par ID converti
  if (!booking) {
    booking = await findLocalBookingByIdDossier(idFournisseur, bookingId, env);
  }
  
  if (!booking) {
    return { success: false, deletedBooking: null };
  }

  // Supprimer la réservation
  await env.DB.prepare(`
    DELETE FROM local_bookings
    WHERE id = ?
  `).bind(booking.id).run();

  return { success: true, deletedBooking: booking };
}

