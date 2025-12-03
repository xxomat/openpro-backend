/**
 * Service de chargement des réservations
 * 
 * Ce fichier contient les fonctions pour charger les réservations
 * pour un hébergement depuis la DB (approche DB-first).
 */

import type { IBookingDisplay } from '../../types/api.js';
import type { Env } from '../../index.js';
import { loadLocalBookingsForAccommodation } from './localBookingService.js';

/**
 * Charge toutes les réservations pour un hébergement depuis la DB
 * 
 * Cette fonction charge toutes les réservations stockées dans la DB pour l'hébergement donné.
 * La DB est la source de vérité pour toutes les réservations.
 * 
 * Note: Toutes les réservations sont chargées (pas de filtre par dates), le frontend
 * se chargera de filtrer celles à afficher selon la plage de dates sélectionnée.
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param accommodationId - Identifiant de l'hébergement
 * @param env - Variables d'environnement Workers
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Tableau des réservations pour cet hébergement
 * @throws {Error} Peut lever une erreur si le chargement des réservations échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function loadBookingsForAccommodation(
  idFournisseur: number,
  accommodationId: number,
  env: Env,
  signal?: AbortSignal
): Promise<IBookingDisplay[]> {
  if (signal?.aborted) throw new Error('Cancelled');
  
  // Charger toutes les réservations depuis la DB
  return await loadLocalBookingsForAccommodation(idFournisseur, accommodationId, env);
}
