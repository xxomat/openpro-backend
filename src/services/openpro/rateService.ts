/**
 * Service de chargement et traitement des tarifs
 * 
 * Ce fichier contient les fonctions pour charger les tarifs, promotions,
 * types de tarifs et durées minimales pour un hébergement, ainsi que le
 * traitement individuel de chaque tarif.
 */

import { getOpenProClient } from '../openProClient.js';
import type { Env } from '../../index.js';
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
 * @param mapDureeMin - Map des durées minimales par date et type de tarif (sera modifiée)
 * @param discoveredRateTypes - Map des types de tarifs découverts (sera modifiée)
 */
function processTarif(
  tarif: ApiTarif,
  debut: string,
  fin: string,
  mapRates: Record<string, Record<number, number>>,
  mapPromo: Record<string, boolean>,
  mapRateTypes: Record<string, string[]>,
  mapDureeMin: Record<string, Record<number, number | null>>,
  discoveredRateTypes: Map<number, DiscoveredRateType>
): void {
  // Lire les dates du tarif (gérer le cas où "fin " a un espace à la fin)
  // IMPORTANT : Ne pas utiliser les paramètres debut/fin comme fallback car chaque tarif
  // doit avoir ses propres dates explicites dans la réponse API
  // L'API peut retourner "fin " avec un espace comme clé de propriété, donc on doit chercher
  // dans toutes les clés de l'objet pour trouver "fin" ou "fin "
  const deb = String(tarif.debut ?? tarif.dateDebut ?? '').trim();
  // Chercher "fin" dans les clés de l'objet (peut être "fin" ou "fin " avec espace)
  const fe = String(
    tarif.fin ?? 
    tarif.dateFin ?? 
    (tarif as any)['fin '] ?? 
    (tarif as any)['dateFin '] ?? 
    ''
  ).trim();
  
  // Si le tarif n'a pas de dates explicites, ignorer (ne pas utiliser debut/fin comme fallback)
  if (!deb || !fe) {
    return;
  }
  
  const startD = new Date(deb + 'T00:00:00');
  const endD = new Date(fe + 'T23:59:59');
  const requestedStart = new Date(debut + 'T00:00:00');
  const requestedEnd = new Date(fin + 'T23:59:59');
  
  // Vérifier que les dates sont valides
  if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
    return;
  }
  
  // Ignorer les tarifs en dehors de la plage demandée
  if (endD < requestedStart || startD > requestedEnd) {
    return;
  }
  
  // Calculer la période effective (intersection entre la période du tarif et la plage demandée)
  // Chaque tarif de l'API a généralement debut = fin (une seule date), donc actualStart = actualEnd
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
      
      if (dureeMinValue != null && idType) {
        if (!mapDureeMin[key]) {
          mapDureeMin[key] = {};
        }
        mapDureeMin[key][idType] = dureeMinValue;
      }
      
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    // Cas où on n'a pas de prix valide : on met à jour seulement les durées minimales
    const cur = new Date(actualStart);
    while (cur <= actualEnd) {
      const key = formatDate(cur);
      if (dureeMinValue != null && idType) {
        if (!mapDureeMin[key]) {
          mapDureeMin[key] = {};
        }
        mapDureeMin[key][idType] = dureeMinValue;
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
  env: Env,
  signal?: AbortSignal
): Promise<{
  rates: Record<string, Record<number, number>>;
  promo: Record<string, boolean>;
  rateTypes: Record<string, string[]>;
  dureeMin: Record<string, Record<number, number | null>>;
}> {
  const openProClient = getOpenProClient(env);
  // Ne pas passer de paramètres de date à getRates selon la documentation API
  const rates = await openProClient.getRates(idFournisseur, idHebergement);
  if (signal?.aborted) throw new Error('Cancelled');
  
  const mapRates: Record<string, Record<number, number>> = {};
  const mapPromo: Record<string, boolean> = {};
  const mapRateTypes: Record<string, string[]> = {};
  const mapDureeMin: Record<string, Record<number, number | null>> = {};
  
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

