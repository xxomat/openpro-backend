/**
 * Service de chargement du stock
 * 
 * Ce fichier contient les fonctions pour charger le stock disponible
 * pour un hébergement sur une plage de dates donnée.
 */

import { getOpenProClient } from '../openProClient.js';
import type { Env } from '../../index.js';

/**
 * Charge le stock disponible pour un hébergement sur une plage de dates
 * 
 * Cette fonction récupère le stock depuis l'API OpenPro et normalise les différentes
 * structures de réponse possibles vers une map simple date -> quantité.
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param idHebergement - Identifiant de l'hébergement
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
  idHebergement: number,
  debut: string,
  fin: string,
  env: Env,
  signal?: AbortSignal
): Promise<Record<string, number>> {
  const openProClient = getOpenProClient(env);
  const stock = await openProClient.getStock(idFournisseur, idHebergement, {
    debut,
    fin,
    start: debut,
    end: fin
  } as unknown as { debut?: string; fin?: string });
  if (signal?.aborted) throw new Error('Cancelled');
  
  const mapStock: Record<string, number> = {};
  // Format OpenPro : { listeStock: [{ date, valeur }] }
  // Compatibilité avec ancien format : { jours: [{ date, dispo }] } ou { stock: [{ jour, stock }] }
  const stockArray = (stock as any).listeStock ?? (stock as any).stock ?? (stock as any).jours ?? [];
  for (const j of stockArray) {
    const date = j.date ?? j.jour;
    const valeur = j.valeur ?? j.dispo ?? j.stock ?? 0;
    if (date) {
      mapStock[String(date)] = Number(valeur ?? 0);
    }
  }
  return mapStock;
}

