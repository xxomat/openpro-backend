/**
 * Service de chargement et traitement des tarifs
 * 
 * Ce fichier contient les fonctions pour charger les tarifs, promotions,
 * types de tarifs et durées minimales pour un hébergement, ainsi que le
 * traitement individuel de chaque tarif.
 * 
 * NOTE: Les tarifs sont maintenant chargés depuis la DB uniquement (source de vérité).
 */

import type { Env } from '../../index.js';
import type { DiscoveredRateType } from './rateTypeService.js';
import { formatDate } from '../../utils/dateUtils.js';
import { updateDiscoveredRateTypes } from './rateTypeService.js';
import { loadAccommodationData } from './accommodationDataService.js';
import { findAccommodationByOpenProId, findAccommodationByPlatformId } from './accommodationService.js';
import { loadRateTypesForAccommodation } from './rateTypeDbService.js';
import { PlateformeReservation } from '../../types/api.js';

/**
 * Traite un tarif individuel et met à jour les maps de tarifs, promotions, types et durées minimales
 * 
 * Cette fonction applique un tarif à toutes les dates de sa période de validité,
 * en tenant compte des chevauchements avec la plage de dates demandée. Elle gère
 * deux cas : avec prix valide (met à jour tout) ou sans prix (met à jour seulement
 * les durées minimales).
 * 
 * @param tarif - Objet tarif transformé avec interface IApiTarif
 * @param debut - Date de début demandée au format YYYY-MM-DD
 * @param fin - Date de fin demandée au format YYYY-MM-DD
 * @param mapRates - Map des tarifs par date et type (sera modifiée)
 * @param mapPromo - Map des promotions par date (sera modifiée)
 * @param mapRateTypes - Map des types de tarifs par date (sera modifiée)
 * @param mapDureeMin - Map des durées minimales par date et type de tarif (sera modifiée)
 * @param mapArriveeAutorisee - Map des arrivées autorisées par date et type de tarif (sera modifiée)
 * @param discoveredRateTypes - Map des types de tarifs découverts (sera modifiée)
 */
function processTarif(
  tarif: IApiTarif,
  debut: string,
  fin: string,
  mapRates: Record<string, Record<number, number>>,
  mapPromo: Record<string, boolean>,
  mapRateTypes: Record<string, string[]>,
  mapDureeMin: Record<string, Record<number, number | null>>,
  mapArriveeAutorisee: Record<string, Record<number, boolean>>,
  discoveredRateTypes: Map<number, DiscoveredRateType>
): void {
  // Lire les dates du tarif (utiliser les noms camelCase)
  // L'API peut retourner "fin " avec un espace comme clé de propriété, donc on doit chercher
  // dans toutes les clés de l'objet pour trouver "fin" ou "fin "
  const deb = String(tarif.startDate ?? tarif.startDateAlt ?? '').trim();
  // Chercher "fin" dans les clés de l'objet (peut être "fin" ou "fin " avec espace)
  // Note: Après transformation, on utilise endDate, mais on doit aussi gérer le JSON brut
  const fe = String(
    tarif.endDate ?? 
    tarif.endDateAlt ?? 
    (tarif as any)['fin'] ?? 
    (tarif as any)['fin '] ?? 
    (tarif as any)['dateFin'] ?? 
    (tarif as any)['dateFin '] ?? 
    ''
  ).trim();
  
  // Si le tarif n'a pas de dates explicites, ignorer
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
  
  const rateTypeId = tarif.rateTypeId ?? tarif?.rateType?.rateTypeId;
  const idType = rateTypeId ? Number(rateTypeId) : undefined;
  const price = extractPriceFromTarif(tarif);
  const rateLabel = extractRateLabel(tarif, idType);
  const tHasPromo =
    Boolean(tarif?.promotion) ||
    Boolean(tarif?.promo) ||
    Boolean(tarif?.promotionActive) ||
    Boolean(tarif?.hasPromo);
  const minDurationValue = tarif.minDuration != null && typeof tarif.minDuration === 'number' && tarif.minDuration > 0 
    ? tarif.minDuration 
    : null;
  const arrivalAllowedValue = tarif.arrivalAllowed !== undefined 
    ? Boolean(tarif.arrivalAllowed) 
    : true; // Par défaut true si non défini
  
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
      
      if (minDurationValue != null && idType) {
        if (!mapDureeMin[key]) {
          mapDureeMin[key] = {};
        }
        mapDureeMin[key][idType] = minDurationValue;
      }
      
      if (idType) {
        if (!mapArriveeAutorisee[key]) {
          mapArriveeAutorisee[key] = {};
        }
        mapArriveeAutorisee[key][idType] = arrivalAllowedValue;
      }
      
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    // Cas où on n'a pas de prix valide : on met à jour seulement les durées minimales et arrivée autorisée
    const cur = new Date(actualStart);
    while (cur <= actualEnd) {
      const key = formatDate(cur);
      if (minDurationValue != null && idType) {
        if (!mapDureeMin[key]) {
          mapDureeMin[key] = {};
        }
        mapDureeMin[key][idType] = minDurationValue;
      }
      if (idType) {
        if (!mapArriveeAutorisee[key]) {
          mapArriveeAutorisee[key] = {};
        }
        mapArriveeAutorisee[key][idType] = arrivalAllowedValue;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
}

/**
 * Charge les tarifs, promotions, types de tarifs et durées minimales pour un hébergement
 * 
 * Cette fonction charge tous les tarifs d'un hébergement depuis la DB (source de vérité)
 * et retourne les maps organisées par date.
 * 
 * @param idFournisseur - Identifiant du fournisseur (non utilisé, conservé pour compatibilité)
 * @param idHebergement - Identifiant de l'hébergement (peut être number pour compatibilité ou string pour nouvelle structure)
 * @param debut - Date de début au format YYYY-MM-DD
 * @param fin - Date de fin au format YYYY-MM-DD
 * @param discoveredRateTypes - Map des types de tarifs découverts (sera modifiée)
 * @param env - Variables d'environnement Workers
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Objet contenant les maps de tarifs, promotions, types et durées minimales
 * @throws {Error} Peut lever une erreur si le chargement des tarifs échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function loadRatesForAccommodation(
  idFournisseur: number,
  idHebergement: number | string,
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
  arriveeAutorisee: Record<string, Record<number, boolean>>;
}> {
  if (signal?.aborted) throw new Error('Cancelled');
  
  // Si idHebergement est un number, chercher l'hébergement correspondant dans la DB
  let accommodationId: string;
  if (typeof idHebergement === 'number') {
    const accommodation = await findAccommodationByPlatformId(PlateformeReservation.OpenPro, String(idHebergement), env);
    if (!accommodation) {
      // Si l'hébergement n'existe pas dans la DB, retourner des maps vides
      console.warn(`[RateService] Accommodation with OpenPro ID ${idHebergement} not found in DB`);
      return {
        rates: {},
        promo: {},
        rateTypes: {},
        dureeMin: {},
        arriveeAutorisee: {}
      };
    }
    accommodationId = accommodation.id;
  } else {
    accommodationId = idHebergement;
  }
  
  // Charger les données tarifaires depuis la DB
  const data = await loadAccommodationData(accommodationId, debut, fin, env);
  
  // Charger les plans tarifaires liés pour obtenir les libellés
  const rateTypes = await loadRateTypesForAccommodation(accommodationId, env);
  const rateTypeLabels = new Map<number, string>();
  for (const rt of rateTypes) {
    if (rt.rateTypeId && rt.label) {
      let label: string | undefined;
      if (typeof rt.label === 'string') {
        label = rt.label;
      } else if (Array.isArray(rt.label)) {
        // Format tableau: [{ langue: 'fr', texte: '...' }]
        const frenchLabel = rt.label.find((item: { langue?: string; texte?: string }) => 
          item.langue === 'fr' || item.langue === 'FR'
        );
        label = frenchLabel?.texte;
      } else if (typeof rt.label === 'object' && rt.label !== null) {
        // Format objet: { fr: '...', en: '...' }
        const labelObj = rt.label as Record<string, string>;
        label = labelObj.fr || labelObj.FR || labelObj['fr'] || labelObj['FR'];
      }
      // Fallback sur descriptionFr si disponible
      if (!label && rt.descriptionFr) {
        label = rt.descriptionFr;
      }
      // Dernier fallback: utiliser l'ID
      if (!label) {
        label = `Type ${rt.rateTypeId}`;
      }
      rateTypeLabels.set(rt.rateTypeId, label);
    }
  }
  
  const mapRates: Record<string, Record<number, number>> = {};
  const mapPromo: Record<string, boolean> = {};
  const mapRateTypes: Record<string, string[]> = {};
  const mapDureeMin: Record<string, Record<number, number | null>> = {};
  const mapArriveeAutorisee: Record<string, Record<number, boolean>> = {};
  
  // Transformer les données de la DB en format compatible
  for (const [date, rateDataByType] of Object.entries(data)) {
    for (const [idTypeTarifStr, rateData] of Object.entries(rateDataByType)) {
      const idTypeTarif = parseInt(idTypeTarifStr, 10);
      if (isNaN(idTypeTarif)) continue;
      
      // Prix
      if (rateData.prix_nuitee != null) {
        if (!mapRates[date]) {
          mapRates[date] = {};
        }
        mapRates[date][idTypeTarif] = rateData.prix_nuitee;
      }
      
      // Durée minimale
      if (rateData.duree_minimale != null) {
        if (!mapDureeMin[date]) {
          mapDureeMin[date] = {};
        }
        mapDureeMin[date][idTypeTarif] = rateData.duree_minimale;
      }
      
      // Arrivée autorisée
      if (rateData.arrivee_autorisee !== null) {
        if (!mapArriveeAutorisee[date]) {
          mapArriveeAutorisee[date] = {};
        }
        mapArriveeAutorisee[date][idTypeTarif] = rateData.arrivee_autorisee === true || rateData.arrivee_autorisee === 1;
      }
      
      // Type de tarif (libellé)
      const label = rateTypeLabels.get(idTypeTarif);
      if (label && typeof label === 'string') {
        if (!mapRateTypes[date]) {
          mapRateTypes[date] = [];
        }
        if (!mapRateTypes[date].includes(label)) {
          mapRateTypes[date].push(label);
          mapRateTypes[date] = mapRateTypes[date].slice(0, 2); // Garder max 2 types par date
        }
      }
      
      // Mettre à jour discoveredRateTypes
      if (label) {
        const discovered: DiscoveredRateType = {
          rateTypeId: idTypeTarif,
          label: label,
          labelFr: label,
          order: undefined
        };
        discoveredRateTypes.set(idTypeTarif, discovered);
      }
    }
  }
  
  return {
    rates: mapRates,
    promo: mapPromo, // Les promotions ne sont pas gérées dans la DB pour l'instant
    rateTypes: mapRateTypes,
    dureeMin: mapDureeMin,
    arriveeAutorisee: mapArriveeAutorisee
  };
}
