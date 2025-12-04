/**
 * Service principal de chargement de données
 * 
 * Ce fichier orchestre le chargement de toutes les données nécessaires pour un fournisseur :
 * - Les hébergements
 * - Les types de tarifs disponibles
 * - Le stock pour chaque hébergement
 * - Les tarifs, promotions, types de tarifs et durées minimales pour chaque hébergement
 */

import type { IAccommodation, ISupplierData } from '../../types/api.js';
import { formatDate } from '../../utils/dateUtils.js';
import { PlateformeReservation } from '../../types/api.js';
import { loadStockForAccommodation } from './stockService.js';
import { buildRateTypesList } from './rateTypeService.js';
import { loadRateTypes as loadRateTypesFromDb } from './rateTypeDbService.js';
import { loadRatesForAccommodation } from './rateService.js';
import { loadBookingsForAccommodation } from './bookingService.js';
import { loadAccommodationRateTypeLinks } from './rateTypeDbService.js';
import type { Env } from '../../index.js';

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
 * @param env - Variables d'environnement Workers
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Promise résolue avec toutes les données chargées et structurées
 * @throws {Error} Peut lever une erreur si le chargement des données échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function getSupplierData(
  idFournisseur: number,
  accommodationsList: IAccommodation[],
  startDate: Date,
  endDate: Date,
  env: Env,
  signal?: AbortSignal
): Promise<ISupplierData> {
  const nextStock: Record<string, Record<string, number>> = {}; // Clé: accommodationId (GUID DB)
  const nextRates: Record<string, Record<string, Record<number, number>>> = {}; // Clé: accommodationId (GUID DB)
  const nextPromo: Record<string, Record<string, boolean>> = {}; // Clé: accommodationId (GUID DB)
  const nextRateTypes: Record<string, Record<string, string[]>> = {}; // Clé: accommodationId (GUID DB)
  const nextDureeMin: Record<string, Record<string, Record<number, number | null>>> = {}; // Clé: accommodationId (GUID DB)
  const nextArriveeAutorisee: Record<string, Record<string, Record<number, boolean>>> = {}; // Clé: accommodationId (GUID DB)
  const nextBookings: Record<string, import('../../types/api.js').IBookingDisplay[]> = {}; // Clé: accommodationId (GUID DB)
  const nextRateTypeLinks: Record<string, number[]> = {}; // Clé: accommodationId (GUID DB)
  const debut = formatDate(startDate);
  const fin = formatDate(endDate);
  
  // Charger les types de tarifs disponibles depuis la DB (DB-first)
  const dbRateTypes = await loadRateTypesFromDb(env);
  
  // Transformer IRateType[] en Map<number, DiscoveredRateType> pour compatibilité
  const discoveredRateTypes = new Map<number, { rateTypeId: number; label: unknown; labelFr?: string; descriptionFr?: string; order?: number }>();
  for (const rt of dbRateTypes) {
    // Extraire le texte français depuis le label multilingue
    let labelFr: string | undefined;
    if (rt.label && Array.isArray(rt.label)) {
      const frenchLabel = rt.label.find((item: any) => item.langue === 'fr' || item.langue === 'FR');
      labelFr = frenchLabel?.texte;
    } else if (rt.label && typeof rt.label === 'object' && rt.label !== null) {
      labelFr = (rt.label as any).fr || (rt.label as any).FR;
    }
    
    discoveredRateTypes.set(rt.rateTypeId, {
      rateTypeId: rt.rateTypeId,
      label: rt.label,
      labelFr,
      descriptionFr: rt.descriptionFr ?? labelFr,
      order: rt.order
    });
  }
  
  // Charger les données pour chaque hébergement
  for (const acc of accommodationsList) {
    if (signal?.aborted) throw new Error('Cancelled');
    
    // Utiliser l'ID DB (GUID) comme clé pour toutes les structures
    const accommodationId = acc.id; // GUID DB
    
    // Charger les liaisons entre hébergement et types de tarif depuis la DB
    try {
      if (signal?.aborted) throw new Error('Cancelled');
      
      // Charger les liens depuis la DB (utiliser l'ID interne)
      const rateTypeIds = await loadAccommodationRateTypeLinks(accommodationId, env);
      nextRateTypeLinks[accommodationId] = rateTypeIds;
    } catch {
      // Ignorer les erreurs de liaisons, initialiser avec un array vide
      nextRateTypeLinks[accommodationId] = [];
    }
    
    // Extraire l'ID OpenPro pour les services qui en ont encore besoin (temporaire)
    const idOpenPro = acc.ids[PlateformeReservation.OpenPro];
    const accommodationIdNum = idOpenPro ? parseInt(idOpenPro, 10) : undefined;
    
    // Charger le stock
    if (accommodationIdNum && !isNaN(accommodationIdNum)) {
      const mapStock = await loadStockForAccommodation(idFournisseur, accommodationIdNum, debut, fin, env, signal);
      nextStock[accommodationId] = mapStock;
    } else {
      nextStock[accommodationId] = {};
    }

    // Charger les tarifs, promotions, types et durées minimales
    try {
      const ratesData = await loadRatesForAccommodation(
        idFournisseur,
        accommodationId, // Passer le GUID DB
        debut,
        fin,
        discoveredRateTypes,
        env,
        signal
      );
      
      nextRates[accommodationId] = ratesData.rates;
      nextPromo[accommodationId] = ratesData.promo;
      nextRateTypes[accommodationId] = ratesData.rateTypes;
      nextDureeMin[accommodationId] = ratesData.dureeMin;
      nextArriveeAutorisee[accommodationId] = ratesData.arriveeAutorisee;
    } catch (error) {
      // Logger l'erreur pour le débogage mais continuer
      console.error(`Error loading rates for accommodation ${accommodationId}:`, error);
      // Initialiser avec des objets vides pour éviter undefined
      nextRates[accommodationId] = {};
      nextPromo[accommodationId] = {};
      nextRateTypes[accommodationId] = {};
      nextDureeMin[accommodationId] = {};
      nextArriveeAutorisee[accommodationId] = {};
    }

    // Charger les réservations (toutes les réservations, pas de filtre par dates)
    try {
      // Charger les réservations depuis la DB (DB-first)
      const bookings = await loadBookingsForAccommodation(
        idFournisseur,
        accommodationId, // Passer le GUID DB
        env,
        signal
      );
      nextBookings[accommodationId] = bookings;
    } catch {
      // Ignorer les erreurs de réservations pour l'instant
      nextBookings[accommodationId] = [];
    }
  }
  
  // Construire les structures finales de types de tarifs
  const { rateTypeLabels, rateTypesList } = buildRateTypesList(discoveredRateTypes);
  
  return {
    stock: nextStock,
    rates: nextRates,
    promo: nextPromo,
    rateTypes: nextRateTypes,
    minDuration: nextDureeMin,
    arrivalAllowed: nextArriveeAutorisee,
    rateTypeLabels,
    rateTypesList,
    bookings: nextBookings,
    rateTypeLinksByAccommodation: nextRateTypeLinks
  };
}
