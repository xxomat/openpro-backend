/**
 * Service de transformation des modifications bulk en format OpenPro
 * 
 * Ce fichier contient la logique pour transformer les modifications bulk
 * reçues du frontend en périodes tarifaires au format attendu par l'API OpenPro.
 */

import type { RequeteTarifModif, TarifModif } from '../../../openpro-api-react/src/client/types.js';

/**
 * Type pour une date modifiée dans la requête bulk
 */
export interface BulkUpdateDate {
  date: string;              // YYYY-MM-DD
  rateTypeId?: number;       // présent si tarif modifié
  price?: number;            // présent si tarif modifié
  minDuration?: number | null;  // présent si minDuration modifiée (nouveau format)
  dureeMin?: number | null;  // présent si dureeMin modifiée (ancien format, pour compatibilité)
  arrivalAllowed?: boolean; // présent si arrivalAllowed modifié (nouveau format)
  arriveeAutorisee?: boolean; // présent si arriveeAutorisee modifié (ancien format, pour compatibilité)
}

/**
 * Type pour un hébergement avec ses dates modifiées
 */
export interface BulkUpdateAccommodation {
  accommodationId: number;
  dates: BulkUpdateDate[];
}

/**
 * Type pour la requête bulk update
 */
export interface BulkUpdateRequest {
  accommodations: BulkUpdateAccommodation[];
}

/**
 * Groupe les dates contiguës avec les mêmes valeurs en périodes
 * 
 * @param dates - Tableau de dates triées par ordre chronologique
 * @returns Tableau de périodes avec debut/fin
 */
function groupDatesIntoPeriods(dates: BulkUpdateDate[]): Array<{
  debut: string;
  fin: string;
  rateTypeId?: number;
  price?: number;
  dureeMin?: number | null;
  arriveeAutorisee?: boolean;
}> {
  if (dates.length === 0) return [];
  
  const periods: Array<{
    debut: string;
    fin: string;
    rateTypeId?: number;
    price?: number;
    dureeMin?: number | null;
    arriveeAutorisee?: boolean;
  }> = [];
  
  let currentPeriod: {
    debut: string;
    fin: string;
    rateTypeId?: number;
    price?: number;
    dureeMin?: number | null;
    arriveeAutorisee?: boolean;
  } | null = null;
  
  for (const date of dates) {
    // Normaliser les noms (accepter les deux formats)
    const dureeMin = date.minDuration ?? date.dureeMin;
    const arriveeAutorisee = date.arrivalAllowed ?? date.arriveeAutorisee;
    
    const key = `${date.rateTypeId ?? 'none'}-${date.price ?? 'none'}-${dureeMin ?? 'none'}-${arriveeAutorisee ?? 'none'}`;
    
    if (currentPeriod === null) {
      // Démarrer une nouvelle période
      currentPeriod = {
        debut: date.date,
        fin: date.date,
        rateTypeId: date.rateTypeId,
        price: date.price,
        dureeMin: dureeMin,
        arriveeAutorisee: arriveeAutorisee
      };
    } else {
      const currentKey = `${currentPeriod.rateTypeId ?? 'none'}-${currentPeriod.price ?? 'none'}-${currentPeriod.dureeMin ?? 'none'}-${currentPeriod.arriveeAutorisee ?? 'none'}`;
      
      // Vérifier si on peut étendre la période courante
      if (key === currentKey && isConsecutiveDate(currentPeriod.fin, date.date)) {
        // Étendre la période
        currentPeriod.fin = date.date;
      } else {
        // Finaliser la période courante et en démarrer une nouvelle
        periods.push(currentPeriod);
        currentPeriod = {
          debut: date.date,
          fin: date.date,
          rateTypeId: date.rateTypeId,
          price: date.price,
          dureeMin: dureeMin,
          arriveeAutorisee: arriveeAutorisee
        };
      }
    }
  }
  
  // Ajouter la dernière période
  if (currentPeriod !== null) {
    periods.push(currentPeriod);
  }
  
  return periods;
}

/**
 * Vérifie si deux dates sont consécutives (différence d'un jour)
 */
function isConsecutiveDate(date1: string, date2: string): boolean {
  const d1 = new Date(date1 + 'T00:00:00');
  const d2 = new Date(date2 + 'T00:00:00');
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays === 1;
}

/**
 * Transforme une période en format TarifModif pour l'API OpenPro
 * 
 * @param period - Période avec debut/fin et valeurs
 * @returns Objet TarifModif au format attendu par l'API
 */
function transformPeriodToTarifModif(period: {
  debut: string;
  fin: string;
  rateTypeId?: number;
  price?: number;
  dureeMin?: number | null;
  arriveeAutorisee?: boolean;
}): TarifModif | null {
  // Si aucune modification de tarif, durée minimale, ni arrivée autorisée, ignorer
  if (period.rateTypeId === undefined && period.dureeMin === undefined && period.arriveeAutorisee === undefined) {
    return null;
  }
  
  // Si modification de tarif sans rateTypeId, ignorer
  if (period.price !== undefined && period.rateTypeId === undefined) {
    return null;
  }
  
  // Si seulement dureeMin ou arriveeAutorisee est modifié, on doit avoir un rateTypeId (fourni par le frontend)
  // Si on n'a pas de rateTypeId, ignorer
  if (period.rateTypeId === undefined) {
    return null;
  }
  
  // Construire le tarifPax à partir du prix
  const tarifPax: Record<string, unknown> = {};
  if (period.price !== undefined) {
    tarifPax.listeTarifPaxOccupation = [
      {
        type: 'defaut',
        prix: period.price
      }
    ];
  } else {
    // Si pas de prix mais qu'on a un rateTypeId, utiliser une structure vide
    // Cela permet de modifier seulement dureeMin ou arriveeAutorisee sans modifier le prix
    tarifPax.listeTarifPaxOccupation = [];
  }
  
  return {
    idTypeTarif: period.rateTypeId, // On sait qu'il est défini grâce à la vérification ci-dessus
    debut: period.debut,
    fin: period.fin,
    ouvert: true,
    dureeMin: period.dureeMin !== undefined ? (period.dureeMin ?? 1) : 1, // Utiliser la valeur modifiée ou 1 par défaut
    dureeMax: 30,
    arriveeAutorisee: period.arriveeAutorisee !== undefined ? period.arriveeAutorisee : true, // Utiliser la valeur modifiée ou true par défaut
    departAutorise: true,
    tarifPax
  };
}

/**
 * Transforme les modifications bulk en format RequeteTarifModif pour l'API OpenPro
 * 
 * @param accommodation - Hébergement avec ses dates modifiées
 * @returns Requête au format OpenPro ou null si aucune modification valide
 */
export function transformBulkToOpenProFormat(
  accommodation: BulkUpdateAccommodation
): RequeteTarifModif | null {
  // Trier les dates par ordre chronologique
  const sortedDates = [...accommodation.dates].sort((a, b) => a.date.localeCompare(b.date));
  
  // Grouper les dates en périodes contiguës
  const periods = groupDatesIntoPeriods(sortedDates);
  
  // Transformer chaque période en TarifModif
  const tarifs: TarifModif[] = [];
  for (const period of periods) {
    const tarif = transformPeriodToTarifModif(period);
    if (tarif !== null) {
      tarifs.push(tarif);
    }
  }
  
  if (tarifs.length === 0) {
    return null;
  }
  
  return { tarifs };
}

