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
import { getAccommodations } from './accommodationService.js';
import { loadStockForAccommodation } from './stockService.js';
import { buildRateTypesList } from './rateTypeService.js';
import { loadRateTypes as loadRateTypesFromDb } from './rateTypeDbService.js';
import { loadRatesForAccommodation } from './rateService.js';
import { loadBookingsForAccommodation } from './bookingService.js';
import { loadLocalBookingsForAccommodation } from './localBookingService.js';
import { getOpenProClient } from '../openProClient.js';
import type { Env } from '../../index.js';
import { transformAccommodationRateTypeLinksResponse } from '../../utils/transformers.js';

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
  const nextStock: Record<number, Record<string, number>> = {};
  const nextRates: Record<number, Record<string, Record<number, number>>> = {};
  const nextPromo: Record<number, Record<string, boolean>> = {};
  const nextRateTypes: Record<number, Record<string, string[]>> = {};
  const nextDureeMin: Record<number, Record<string, Record<number, number | null>>> = {};
  const nextArriveeAutorisee: Record<number, Record<string, Record<number, boolean>>> = {};
  const nextBookings: Record<number, import('../../types/api.js').IBookingDisplay[]> = {};
  const nextRateTypeLinks: Record<number, number[]> = {};
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
    
    // Charger les liaisons entre hébergement et types de tarif
    try {
      const openProClient = getOpenProClient(env);
      const linksResponse = await openProClient.listAccommodationRateTypeLinks(idFournisseur, acc.accommodationId);
      if (signal?.aborted) throw new Error('Cancelled');
      
      // Transformer la réponse avec class-transformer
      const apiLinksResponse = transformAccommodationRateTypeLinksResponse(linksResponse);
      const liaisons = apiLinksResponse.accommodationRateTypeLinks ?? apiLinksResponse.data?.accommodationRateTypeLinks ?? [];
      
      // Extraire les IDs des types de tarif liés
      nextRateTypeLinks[acc.accommodationId] = liaisons
        .map((l) => Number(l.rateTypeId))
        .filter((id: number) => !isNaN(id));
    } catch {
      // Ignorer les erreurs de liaisons, initialiser avec un array vide
      nextRateTypeLinks[acc.accommodationId] = [];
    }
    
    // Charger le stock
    const mapStock = await loadStockForAccommodation(idFournisseur, acc.accommodationId, debut, fin, env, signal);
    nextStock[acc.accommodationId] = mapStock;

    // Charger les tarifs, promotions, types et durées minimales
    try {
      const ratesData = await loadRatesForAccommodation(
        idFournisseur,
        acc.accommodationId,
        debut,
        fin,
        discoveredRateTypes,
        env,
        signal
      );
      
      nextRates[acc.accommodationId] = ratesData.rates;
      nextPromo[acc.accommodationId] = ratesData.promo;
      nextRateTypes[acc.accommodationId] = ratesData.rateTypes;
      nextDureeMin[acc.accommodationId] = ratesData.dureeMin;
      nextArriveeAutorisee[acc.accommodationId] = ratesData.arriveeAutorisee;
    } catch (error) {
      // Logger l'erreur pour le débogage mais continuer
      console.error(`Error loading rates for accommodation ${acc.accommodationId}:`, error);
      // Initialiser avec des objets vides pour éviter undefined
      nextRates[acc.accommodationId] = {};
      nextPromo[acc.accommodationId] = {};
      nextRateTypes[acc.accommodationId] = {};
      nextDureeMin[acc.accommodationId] = {};
      nextArriveeAutorisee[acc.accommodationId] = {};
    }

    // Charger les réservations (toutes les réservations, pas de filtre par dates)
    try {
      // Charger les réservations locales pour cet hébergement
      const localBookings = await loadLocalBookingsForAccommodation(
        idFournisseur,
        acc.accommodationId,
        env
      );
      
      // Charger les réservations OpenPro et fusionner avec les locales
      const bookings = await loadBookingsForAccommodation(
        idFournisseur,
        acc.accommodationId,
        env,
        signal,
        localBookings
      );
      nextBookings[acc.accommodationId] = bookings;
    } catch {
      // Ignorer les erreurs de réservations pour l'instant
      nextBookings[acc.accommodationId] = [];
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
