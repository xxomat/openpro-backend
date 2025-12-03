/**
 * Service de chargement et gestion des types de tarifs
 * 
 * Ce fichier contient les fonctions pour charger les types de tarifs disponibles,
 * les découvrir depuis les tarifs, et construire les structures finales de types.
 */

import { getOpenProClient } from '../openProClient.js';
import type { Env } from '../../index.js';
import type { IAccommodation, IRateType } from '../../types/api.js';
import type { IApiRateType, IApiTarif, IRateTypeListResponse } from '../../types/apiTypes.js';
import { extractFrenchText } from './utils/rateUtils.js';
import { transformRateTypeListResponse } from '../../utils/transformers.js';

/**
 * Type interne pour représenter un type de tarif découvert lors du chargement
 * 
 * Ce type est utilisé pour accumuler les informations sur les types de tarifs
 * trouvés dans les réponses API, avant de les convertir en format interne IRateType.
 */
export type DiscoveredRateType = {
  /** Identifiant unique du type de tarif */
  rateTypeId: number;
  /** Libellé brut de l'API (peut être multilingue) */
  label?: unknown;
  /** Libellé français extrait et normalisé */
  labelFr?: string;
  /** Description française extraite et normalisée */
  descriptionFr?: string;
  /** Ordre d'affichage du type de tarif */
  order?: number;
};

/**
 * Charge et découvre les types de tarifs disponibles pour un fournisseur
 * 
 * @deprecated Cette fonction charge depuis OpenPro et ne doit plus être utilisée.
 * Utiliser `loadRateTypes` depuis `rateTypeDbService.ts` à la place (DB-first).
 * 
 * Cette fonction récupère tous les types de tarifs depuis l'API, filtre ceux qui sont
 * liés aux hébergements (via les liaisons), et extrait les libellés et descriptions
 * en français pour chaque type.
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param accommodationsList - Liste des hébergements pour déterminer les types de tarifs liés
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Map des types de tarifs découverts, indexée par rateTypeId
 * @throws {Error} Peut lever une erreur si le chargement des types de tarifs échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 * @deprecated Utiliser `loadRateTypes` depuis `rateTypeDbService.ts` à la place
 */
export async function loadRateTypes(
  idFournisseur: number,
  accommodationsList: IAccommodation[],
  env: Env,
  signal?: AbortSignal
): Promise<Map<number, DiscoveredRateType>> {
  const discoveredRateTypes = new Map<number, DiscoveredRateType>();
  
  if (accommodationsList.length === 0) {
    return discoveredRateTypes;
  }
  
  try {
    const openProClient = getOpenProClient(env);
    const allRateTypesResponse = await openProClient.listRateTypes(idFournisseur);
    if (signal?.aborted) throw new Error('Cancelled');
    
    // Transformer la réponse avec class-transformer
    const apiRateTypesResponse = transformRateTypeListResponse(allRateTypesResponse);
    const allRateTypes = apiRateTypesResponse.rateTypes ?? [];
    
    // Retourner TOUS les types de tarif, pas seulement ceux liés
    // Cela permet d'afficher tous les types de tarif dans le sélecteur principal
    for (const rateType of allRateTypes) {
      const id = rateType.rateTypeKey?.rateTypeId ?? rateType.rateTypeId;
      
      if (id) {
        const descriptionFr = extractFrenchText(rateType.description);
        const labelFr = extractFrenchText(rateType.label);
        
        if (!discoveredRateTypes.has(id)) {
          discoveredRateTypes.set(id, {
            rateTypeId: id,
            label: rateType.label,
            labelFr: labelFr,
            descriptionFr: descriptionFr ?? labelFr,
            order: rateType.order
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
 * @param tarif - Objet tarif transformé avec interface IApiTarif
 * @param rateTypeId - Identifiant du type de tarif
 * @param rateLabel - Libellé du tarif déjà extrait
 */
export function updateDiscoveredRateTypes(
  discoveredRateTypes: Map<number, DiscoveredRateType>,
  tarif: IApiTarif,
  rateTypeId: number,
  rateLabel: string | undefined
): void {
  if (!discoveredRateTypes.has(rateTypeId)) {
    const descriptionFr = extractFrenchText(tarif?.rateType?.description ?? tarif?.description);
    const order = tarif?.rateType?.order ?? tarif?.order;
    
    discoveredRateTypes.set(rateTypeId, {
      rateTypeId: rateTypeId,
      label: tarif?.rateType?.label ?? tarif?.label,
      labelFr: rateLabel,
      descriptionFr: descriptionFr ?? rateLabel ?? `Type ${rateTypeId}`,
      order: order != null ? Number(order) : undefined
    });
  } else {
    // Mettre à jour la description si elle manque ou est générique
    const existing = discoveredRateTypes.get(rateTypeId)!;
    if (!existing.descriptionFr || existing.descriptionFr.startsWith('Type ')) {
      const descriptionFr = extractFrenchText(tarif?.rateType?.description ?? tarif?.description);
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
 * - Une map de labels indexée par rateTypeId pour un accès rapide
 * - Une liste triée par ordre pour l'affichage dans les dropdowns
 * 
 * @param discoveredRateTypes - Map des types de tarifs découverts
 * @returns Objet contenant les labels des types de tarifs et la liste triée par ordre
 */
export function buildRateTypesList(discoveredRateTypes: Map<number, DiscoveredRateType>): {
  rateTypeLabels: Record<number, string>;
  rateTypesList: IRateType[];
} {
  const rateTypeLabels: Record<number, string> = {};
  const rateTypesList: IRateType[] = [];
  
  for (const [id, info] of discoveredRateTypes) {
    const displayLabel = info.descriptionFr ?? info.labelFr ?? `Type ${id}`;
    rateTypeLabels[id] = displayLabel;
    rateTypesList.push({
      rateTypeId: info.rateTypeId,
      label: info.label,
      descriptionFr: info.descriptionFr,
      order: info.order
    });
  }
  
  // Trier par ordre (999 par défaut si non défini)
  rateTypesList.sort((a, b) => {
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    return orderA - orderB;
  });
  
  return { rateTypeLabels, rateTypesList };
}
