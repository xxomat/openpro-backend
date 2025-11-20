/**
 * Service de chargement et traitement des tarifs
 * 
 * Ce fichier contient les fonctions pour charger les tarifs, promotions,
 * types de tarifs et durées minimales pour un hébergement, ainsi que le
 * traitement individuel de chaque tarif.
 */

import { openProClient } from '../openProClient.js';
import type { ApiTarif, RatesResponse } from '../../types/apiTypes.js';
import type { DiscoveredRateType } from './rateTypeService.js';
import { formatDate } from '../../utils/dateUtils.js';
import { extractPriceFromTarif, extractRateLabel } from './utils/rateUtils.js';
import { updateDiscoveredRateTypes } from './rateTypeService.js';

/**
 * Traite un tarif individuel et met à jour les maps de tarifs, promotions, types et durées minimales
 * 
 * Cette fonction applique un tarif à toutes les dates de sa période de validité,
 * en tenant compte des chevauchements avec la plage de dates demandée. Elle gère
 * deux cas : avec prix valide (met à jour tout) ou sans prix (met à jour seulement
 * les durées minimales).
 * 
 * @param tarif - Objet tarif brut de l'API
 * @param debut - Date de début demandée au format YYYY-MM-DD
 * @param fin - Date de fin demandée au format YYYY-MM-DD
 * @param mapRates - Map des tarifs par date et type (sera modifiée)
 * @param mapPromo - Map des promotions par date (sera modifiée)
 * @param mapRateTypes - Map des types de tarifs par date (sera modifiée)
 * @param mapDureeMin - Map des durées minimales par date (sera modifiée)
 * @param discoveredRateTypes - Map des types de tarifs découverts (sera modifiée)
 */
function processTarif(
  tarif: ApiTarif,
  debut: string,
  fin: string,
  mapRates: Record<string, Record<number, number>>,
  mapPromo: Record<string, boolean>,
  mapRateTypes: Record<string, string[]>,
  mapDureeMin: Record<string, number | null>,
  discoveredRateTypes: Map<number, DiscoveredRateType>
): void {
  const deb = tarif.debut ?? tarif.dateDebut ?? debut;
  const fe = tarif.fin ?? tarif.dateFin ?? fin;
  const startD = new Date(deb + 'T00:00:00');
  const endD = new Date(fe + 'T23:59:59');
  const requestedStart = new Date(debut + 'T00:00:00');
  const requestedEnd = new Date(fin + 'T23:59:59');
  
  // Ignorer les tarifs en dehors de la plage demandée
  if (endD < requestedStart || startD > requestedEnd) {
    return;
  }
  
  // Calculer la période effective (intersection entre la période du tarif et la plage demandée)
  const actualStart = startD > requestedStart ? startD : requestedStart;
  const actualEnd = endD < requestedEnd ? endD : requestedEnd;
  
  const idType = Number(tarif.idTypeTarif ?? tarif?.typeTarif?.idTypeTarif);
  const price = extractPriceFromTarif(tarif);
  const rateLabel = extractRateLabel(tarif, idType);
  const tHasPromo =
    Boolean(tarif?.promotion) ||
    Boolean(tarif?.promo) ||
    Boolean(tarif?.promotionActive) ||
    Boolean(tarif?.hasPromo);
  const dureeMinValue = tarif.dureeMin != null && typeof tarif.dureeMin === 'number' && tarif.dureeMin > 0 
    ? tarif.dureeMin 
    : null;
  
  // Mettre à jour les types de tarifs découverts
  if (idType) {
    updateDiscoveredRateTypes(discoveredRateTypes, tarif, idType, rateLabel);
  }
  
  // Appliquer le tarif à toutes les dates de la période effective
  if (idType && price != null && !isNaN(price)) {
    // Cas où on a un prix valide : on met à jour tarifs, promotions, types et durées minimales
    const cur = new Date(actualStart);
    while (cur <= actualEnd) {
      const key = formatDate(cur);
      if (!mapRates[key]) {
        mapRates[key] = {};
      }
      mapRates[key][idType] = price;
      
      if (tHasPromo) {
        mapPromo[key] = true;
      }
      
      if (rateLabel) {
        const arr = mapRateTypes[key] ?? [];
        if (!arr.includes(rateLabel)) {
          arr.push(rateLabel);
          mapRateTypes[key] = arr.slice(0, 2); // Garder max 2 types par date
        } else {
          mapRateTypes[key] = arr;
        }
      }
      
      if (dureeMinValue != null) {
        const existingDureeMin = mapDureeMin[key];
        if (existingDureeMin == null || dureeMinValue > existingDureeMin) {
          mapDureeMin[key] = dureeMinValue;
        }
      } else if (mapDureeMin[key] == null) {
        mapDureeMin[key] = null;
      }
      
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    // Cas où on n'a pas de prix valide : on met à jour seulement les durées minimales
    const cur = new Date(actualStart);
    while (cur <= actualEnd) {
      const key = formatDate(cur);
      if (dureeMinValue != null) {
        const existingDureeMin = mapDureeMin[key];
        if (existingDureeMin == null || dureeMinValue > existingDureeMin) {
          mapDureeMin[key] = dureeMinValue;
        }
      } else if (mapDureeMin[key] == null) {
        mapDureeMin[key] = null;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
}

/**
 * Charge les tarifs, promotions, types de tarifs et durées minimales pour un hébergement
 * 
 * Cette fonction récupère tous les tarifs d'un hébergement sur une plage de dates,
 * traite chaque tarif individuellement, et retourne les maps organisées par date.
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param idHebergement - Identifiant de l'hébergement
 * @param debut - Date de début au format YYYY-MM-DD
 * @param fin - Date de fin au format YYYY-MM-DD
 * @param discoveredRateTypes - Map des types de tarifs découverts (sera modifiée)
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Objet contenant les maps de tarifs, promotions, types et durées minimales
 * @throws {Error} Peut lever une erreur si le chargement des tarifs échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function loadRatesForAccommodation(
  idFournisseur: number,
  idHebergement: number,
  debut: string,
  fin: string,
  discoveredRateTypes: Map<number, DiscoveredRateType>,
  signal?: AbortSignal
): Promise<{
  rates: Record<string, Record<number, number>>;
  promo: Record<string, boolean>;
  rateTypes: Record<string, string[]>;
  dureeMin: Record<string, number | null>;
}> {
  const rates = await openProClient.getRates(idFournisseur, idHebergement, { debut, fin });
  if (signal?.aborted) throw new Error('Cancelled');
  
  const mapRates: Record<string, Record<number, number>> = {};
  const mapPromo: Record<string, boolean> = {};
  const mapRateTypes: Record<string, string[]> = {};
  const mapDureeMin: Record<string, number | null> = {};
  
  const apiResponse = rates as unknown as RatesResponse;
  const tarifs: ApiTarif[] = apiResponse.tarifs ?? apiResponse.periodes ?? [];
  
  for (const tarif of tarifs) {
    processTarif(tarif, debut, fin, mapRates, mapPromo, mapRateTypes, mapDureeMin, discoveredRateTypes);
  }
  
  return {
    rates: mapRates,
    promo: mapPromo,
    rateTypes: mapRateTypes,
    dureeMin: mapDureeMin
  };
}

