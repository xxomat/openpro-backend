/**
 * Service de gestion des réservations locales (Direct)
 * 
 * Ce fichier contient les fonctions pour charger et gérer les réservations
 * locales stockées dans D1, ainsi que la détection de leur état de synchronisation.
 * 
 * Note: Les réservations obsolètes (Direct dans OpenPro sans correspondance locale)
 * ne sont PAS stockées dans la DB. Elles sont détectées dynamiquement lors du chargement.
 */

import type { BookingDisplay } from '../../types/api.js';
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
  idHebergement: number,
  env: Env
): Promise<BookingDisplay[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM local_bookings
    WHERE id_fournisseur = ? AND id_hebergement = ?
    ORDER BY date_arrivee ASC
  `).bind(idFournisseur, idHebergement).all();

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
export async function loadAllLocalBookings(env: Env): Promise<BookingDisplay[]> {
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
  localBookings: BookingDisplay[],
  openProBookings: BookingDisplay[],
  env: Env
): Promise<{ syncedCount: number; pendingCount: number }> {
  let syncedCount = 0;
  let pendingCount = 0;

  for (const localBooking of localBookings) {
    // Vérifier si cette réservation locale a une correspondance dans OpenPro
    const match = openProBookings.find(opBooking => 
      opBooking.idHebergement === localBooking.idHebergement &&
      opBooking.dateArrivee === localBooking.dateArrivee &&
      opBooking.dateDepart === localBooking.dateDepart &&
      opBooking.plateformeReservation === PlateformeReservation.Directe
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
        localBooking.idHebergement,
        localBooking.dateArrivee,
        localBooking.dateDepart
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
  idFournisseur: number;
  idHebergement: number;
  dateArrivee: string; // Format: YYYY-MM-DD
  dateDepart: string;  // Format: YYYY-MM-DD
  clientNom?: string;
  clientPrenom?: string;
  clientEmail?: string;
  clientTelephone?: string;
  nbPersonnes?: number;
  montantTotal?: number;
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
): Promise<BookingDisplay> {
  // Valider les dates
  if (data.dateDepart <= data.dateArrivee) {
    throw new Error('date_depart must be greater than date_arrivee');
  }

  // Valider le nombre de personnes
  const nbPersonnes = data.nbPersonnes ?? 2;
  if (nbPersonnes <= 0) {
    throw new Error('nb_personnes must be greater than 0');
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
    data.idFournisseur,
    data.idHebergement,
    data.dateArrivee,
    data.dateDepart,
    data.clientNom || null,
    data.clientPrenom || null,
    data.clientEmail || null,
    data.clientTelephone || null,
    nbPersonnes,
    data.montantTotal || null,
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
    data.idFournisseur,
    data.idHebergement,
    data.dateArrivee,
    data.dateDepart
  ).first() as LocalBookingRow | null;

  if (!createdRow) {
    throw new Error('Failed to retrieve created booking');
  }

  return convertRowToBookingDisplay(createdRow);
}

/**
 * Convertit une ligne de DB en BookingDisplay
 * 
 * @param row - Ligne de la table local_bookings
 * @returns BookingDisplay correspondant
 */
function convertRowToBookingDisplay(row: LocalBookingRow): BookingDisplay {
  // Construire le nom complet du client
  const clientNomParts: string[] = [];
  if (row.client_prenom) clientNomParts.push(row.client_prenom);
  if (row.client_nom) clientNomParts.push(row.client_nom);
  const clientNom = clientNomParts.length > 0 ? clientNomParts.join(' ') : undefined;

  return {
    idDossier: 0, // Les réservations locales n'ont pas d'idDossier OpenPro
    idHebergement: row.id_hebergement,
    dateArrivee: row.date_arrivee,
    dateDepart: row.date_depart,
    reference: row.reference,
    clientNom,
    clientEmail: row.client_email,
    clientTelephone: row.client_telephone,
    nbPersonnes: row.nb_personnes,
    montantTotal: row.montant_total,
    dateCreation: row.date_creation,
    plateformeReservation: PlateformeReservation.Directe,
    isPendingSync: row.synced_at === null || row.synced_at === undefined,
    isObsolete: false // Les réservations dans la DB ne sont jamais obsolètes
  };
}

