/**
 * Service de chargement du stock
 * 
 * Ce fichier contient les fonctions pour charger le stock disponible
 * pour un hébergement sur une plage de dates donnée.
 * 
 * NOTE: Le stock est maintenant chargé depuis la DB uniquement (source de vérité).
 */

import type { Env } from '../../index.js';
import { loadAccommodationStock } from './accommodationDataService.js';
import { findAccommodationByPlatformId } from './accommodationService.js';
import { PlateformeReservation } from '../../types/api.js';

/**
 * Charge le stock disponible pour un hébergement sur une plage de dates
 * 
 * Cette fonction charge le stock depuis la DB (source de vérité).
 * 
 * @param idFournisseur - Identifiant du fournisseur (non utilisé, conservé pour compatibilité)
 * @param idHebergement - Identifiant de l'hébergement (peut être number pour compatibilité ou string pour nouvelle structure)
 * @param debut - Date de début au format YYYY-MM-DD
 * @param fin - Date de fin au format YYYY-MM-DD
 * @param env - Variables d'environnement Workers
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Map du stock par date (clé: date YYYY-MM-DD, valeur: quantité disponible)
 * @throws {Error} Peut lever une erreur si le chargement du stock échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function loadStockForAccommodation(
  idFournisseur: number,
  idHebergement: number | string,
  debut: string,
  fin: string,
  env: Env,
  signal?: AbortSignal
): Promise<Record<string, number>> {
  if (signal?.aborted) throw new Error('Cancelled');
  
  // Si idHebergement est un number, chercher l'hébergement correspondant dans la DB
  let accommodationId: string;
  if (typeof idHebergement === 'number') {
    const accommodation = await findAccommodationByPlatformId(PlateformeReservation.OpenPro, String(idHebergement), env);
    if (!accommodation) {
      // Si l'hébergement n'existe pas dans la DB, retourner un stock vide
      console.warn(`[StockService] Accommodation with OpenPro ID ${idHebergement} not found in DB`);
      return {};
    }
    accommodationId = accommodation.id;
  } else {
    accommodationId = idHebergement;
  }
  
  // Charger le stock depuis la DB
  return await loadAccommodationStock(accommodationId, debut, fin, env);
}

