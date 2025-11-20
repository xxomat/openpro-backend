/**
 * Service de chargement et gestion des types de tarifs
 * 
 * Ce fichier contient les fonctions pour charger les types de tarifs disponibles,
 * les découvrir depuis les tarifs, et construire les structures finales de types.
 */

import { openProClient } from '../openProClient.js';
import type { Accommodation, RateType } from '../../types/api.js';
import type { AccommodationRateTypeLink, AccommodationRateTypeLinksResponse, ApiRateType, ApiTarif, RateTypeListResponse } from '../../types/apiTypes.js';
import { extractFrenchText } from './utils/rateUtils.js';

/**
 * Type interne pour représenter un type de tarif découvert lors du chargement
 * 
 * Ce type est utilisé pour accumuler les informations sur les types de tarifs
 * trouvés dans les réponses API, avant de les convertir en format interne RateType.
 */
export type DiscoveredRateType = {
  /** Identifiant unique du type de tarif */
  idTypeTarif: number;
  /** Libellé brut de l'API (peut être multilingue) */
  libelle?: unknown;
  /** Libellé français extrait et normalisé */
  label?: string;
  /** Description française extraite et normalisée */
  descriptionFr?: string;
  /** Ordre d'affichage du type de tarif */
  ordre?: number;
};

/**
 * Charge et découvre les types de tarifs disponibles pour un fournisseur
 * 
 * Cette fonction récupère tous les types de tarifs depuis l'API, filtre ceux qui sont
 * liés aux hébergements (via les liaisons), et extrait les libellés et descriptions
 * en français pour chaque type.
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param accommodationsList - Liste des hébergements pour déterminer les types de tarifs liés
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Map des types de tarifs découverts, indexée par idTypeTarif
 * @throws {Error} Peut lever une erreur si le chargement des types de tarifs échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function loadRateTypes(
  idFournisseur: number,
  accommodationsList: Accommodation[],
  signal?: AbortSignal
): Promise<Map<number, DiscoveredRateType>> {
  const discoveredRateTypes = new Map<number, DiscoveredRateType>();
  
  if (accommodationsList.length === 0) {
    return discoveredRateTypes;
  }
  
  try {
    const allRateTypesResponse = await openProClient.listRateTypes(idFournisseur);
    if (signal?.aborted) throw new Error('Cancelled');
    const apiRateTypesResponse = allRateTypesResponse as unknown as RateTypeListResponse;
    const allRateTypes: ApiRateType[] = apiRateTypesResponse.typeTarifs ?? [];
    
    const firstAcc = accommodationsList[0];
    const links = await openProClient.listAccommodationRateTypeLinks(idFournisseur, firstAcc.idHebergement);
    if (signal?.aborted) throw new Error('Cancelled');
    const apiLinksResponse = links as unknown as AccommodationRateTypeLinksResponse;
    const liaisons: AccommodationRateTypeLink[] = apiLinksResponse.liaisonHebergementTypeTarifs ?? apiLinksResponse.data?.liaisonHebergementTypeTarifs ?? [];
    const linkedIds = new Set(liaisons.map((l: AccommodationRateTypeLink) => Number(l.idTypeTarif)));
    
    for (const rateType of allRateTypes) {
      const id = Number(rateType.cleTypeTarif?.idTypeTarif ?? rateType.idTypeTarif);
      
      if (id && linkedIds.has(id)) {
        const descriptionFr = extractFrenchText(rateType.description);
        const libelleFr = extractFrenchText(rateType.libelle);
        
        if (!discoveredRateTypes.has(id)) {
          discoveredRateTypes.set(id, {
            idTypeTarif: id,
            libelle: rateType.libelle,
            label: libelleFr,
            descriptionFr: descriptionFr ?? libelleFr,
            ordre: rateType.ordre
          });
        }
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur lors du chargement des types de tarifs';
    console.error('Error fetching rate types:', errorMessage, error);
  }
  
  return discoveredRateTypes;
}

/**
 * Met à jour la map des types de tarifs découverts avec les informations d'un tarif
 * 
 * Si le type de tarif n'existe pas encore dans la map, il est ajouté avec toutes
 * ses informations. Si il existe déjà mais n'a pas de description française ou
 * a une description générique (commençant par "Type "), la description est mise à jour.
 * 
 * @param discoveredRateTypes - Map des types de tarifs déjà découverts (sera modifiée)
 * @param tarif - Objet tarif brut de l'API
 * @param idType - Identifiant du type de tarif
 * @param rateLabel - Libellé du tarif déjà extrait
 */
export function updateDiscoveredRateTypes(
  discoveredRateTypes: Map<number, DiscoveredRateType>,
  tarif: ApiTarif,
  idType: number,
  rateLabel: string | undefined
): void {
  if (!discoveredRateTypes.has(idType)) {
    const descriptionFr = extractFrenchText(tarif?.typeTarif?.description ?? tarif?.description);
    const ordre = tarif?.typeTarif?.ordre ?? tarif?.ordre;
    
    discoveredRateTypes.set(idType, {
      idTypeTarif: idType,
      libelle: tarif?.typeTarif?.libelle ?? tarif?.libelle,
      label: rateLabel,
      descriptionFr: descriptionFr ?? rateLabel ?? `Type ${idType}`,
      ordre: ordre != null ? Number(ordre) : undefined
    });
  } else {
    // Mettre à jour la description si elle manque ou est générique
    const existing = discoveredRateTypes.get(idType)!;
    if (!existing.descriptionFr || existing.descriptionFr.startsWith('Type ')) {
      const descriptionFr = extractFrenchText(tarif?.typeTarif?.description ?? tarif?.description);
      if (descriptionFr) {
        existing.descriptionFr = descriptionFr;
      }
    }
  }
}

/**
 * Construit les structures finales de types de tarifs à partir de la map des types découverts
 * 
 * Cette fonction transforme la map des types découverts en deux structures :
 * - Une map de labels indexée par idTypeTarif pour un accès rapide
 * - Une liste triée par ordre pour l'affichage dans les dropdowns
 * 
 * @param discoveredRateTypes - Map des types de tarifs découverts
 * @returns Objet contenant les labels des types de tarifs et la liste triée par ordre
 */
export function buildRateTypesList(discoveredRateTypes: Map<number, DiscoveredRateType>): {
  rateTypeLabels: Record<number, string>;
  rateTypesList: RateType[];
} {
  const rateTypeLabels: Record<number, string> = {};
  const rateTypesList: RateType[] = [];
  
  for (const [id, info] of discoveredRateTypes) {
    const displayLabel = info.descriptionFr ?? info.label ?? `Type ${id}`;
    rateTypeLabels[id] = displayLabel;
    rateTypesList.push({
      idTypeTarif: info.idTypeTarif,
      libelle: info.libelle,
      descriptionFr: info.descriptionFr,
      ordre: info.ordre
    });
  }
  
  // Trier par ordre (999 par défaut si non défini)
  rateTypesList.sort((a, b) => {
    const ordreA = a.ordre ?? 999;
    const ordreB = b.ordre ?? 999;
    return ordreA - ordreB;
  });
  
  return { rateTypeLabels, rateTypesList };
}

