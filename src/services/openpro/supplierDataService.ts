/**
 * Service principal de chargement de données
 * 
 * Ce fichier orchestre le chargement de toutes les données nécessaires pour un fournisseur :
 * - Les hébergements
 * - Les types de tarifs disponibles
 * - Le stock pour chaque hébergement
 * - Les tarifs, promotions, types de tarifs et durées minimales pour chaque hébergement
 */

import type { Accommodation, SupplierData } from '../../types/api.js';
import { formatDate } from '../../utils/dateUtils.js';
import { getAccommodations } from './accommodationService.js';
import { loadStockForAccommodation } from './stockService.js';
import { loadRateTypes, buildRateTypesList } from './rateTypeService.js';
import { loadRatesForAccommodation } from './rateService.js';

/**
 * Charge toutes les données (stock, tarifs, types de tarifs) pour un fournisseur
 * et une liste d'hébergements donnés
 * 
 * Cette fonction orchestre le chargement de toutes les données nécessaires :
 * 1. Charge les types de tarifs disponibles pour le fournisseur
 * 2. Pour chaque hébergement :
 *    - Charge le stock disponible
 *    - Charge les tarifs, promotions, types de tarifs et durées minimales
 * 3. Construit les structures finales de types de tarifs
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param accommodationsList - Liste des hébergements pour lesquels charger les données
 * @param startDate - Date de début de la plage de dates (incluse)
 * @param endDate - Date de fin de la plage de dates (incluse)
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Promise résolue avec toutes les données chargées et structurées
 * @throws {Error} Peut lever une erreur si le chargement des données échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function getSupplierData(
  idFournisseur: number,
  accommodationsList: Accommodation[],
  startDate: Date,
  endDate: Date,
  signal?: AbortSignal
): Promise<SupplierData> {
  const nextStock: Record<number, Record<string, number>> = {};
  const nextRates: Record<number, Record<string, Record<number, number>>> = {};
  const nextPromo: Record<number, Record<string, boolean>> = {};
  const nextRateTypes: Record<number, Record<string, string[]>> = {};
  const nextDureeMin: Record<number, Record<string, number | null>> = {};
  const debut = formatDate(startDate);
  const fin = formatDate(endDate);
  
  // Charger les types de tarifs disponibles
  const discoveredRateTypes = await loadRateTypes(idFournisseur, accommodationsList, signal);
  
  // Charger les données pour chaque hébergement
  for (const acc of accommodationsList) {
    if (signal?.aborted) throw new Error('Cancelled');
    
    // Charger le stock
    const mapStock = await loadStockForAccommodation(idFournisseur, acc.idHebergement, debut, fin, signal);
    nextStock[acc.idHebergement] = mapStock;

    // Charger les tarifs, promotions, types et durées minimales
    try {
      const ratesData = await loadRatesForAccommodation(
        idFournisseur,
        acc.idHebergement,
        debut,
        fin,
        discoveredRateTypes,
        signal
      );
      
      nextRates[acc.idHebergement] = ratesData.rates;
      nextPromo[acc.idHebergement] = ratesData.promo;
      nextRateTypes[acc.idHebergement] = ratesData.rateTypes;
      nextDureeMin[acc.idHebergement] = ratesData.dureeMin;
    } catch {
      // Ignorer les erreurs de tarifs pour l'instant
    }
  }
  
  // Construire les structures finales de types de tarifs
  const { rateTypeLabels, rateTypesList } = buildRateTypesList(discoveredRateTypes);
  
  return {
    stock: nextStock,
    rates: nextRates,
    promo: nextPromo,
    rateTypes: nextRateTypes,
    dureeMin: nextDureeMin,
    rateTypeLabels,
    rateTypesList
  };
}

