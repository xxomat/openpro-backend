/**
 * Service de chargement des hébergements
 * 
 * Ce fichier contient les fonctions pour charger la liste des hébergements
 * depuis l'API OpenPro et normaliser les données dans le format interne.
 */

import { getOpenProClient } from '../openProClient.js';
import type { IAccommodation } from '../../types/api.js';
import type { IAccommodationListResponse } from '../../types/apiTypes.js';
import type { Env } from '../../index.js';
import { transformAccommodationListResponse } from '../../utils/transformers.js';

/**
 * Charge la liste des hébergements pour un fournisseur donné
 * 
 * Cette fonction appelle l'API OpenPro pour récupérer les hébergements d'un fournisseur
 * et normalise les différentes structures de réponse possibles (API réelle vs stub)
 * vers le format interne avec noms camelCase.
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param env - Variables d'environnement Workers
 * @param signal - Signal d'annulation optionnel pour interrompre la requête
 * @returns Promise résolue avec la liste des hébergements normalisés
 * @throws {Error} Peut lever une erreur si le chargement des hébergements échoue
 * @throws {DOMException} Peut lever une AbortError si la requête est annulée
 */
export async function getAccommodations(
  idFournisseur: number,
  env: Env,
  signal?: AbortSignal
): Promise<IAccommodation[]> {
  const openProClient = getOpenProClient(env);
  const resp = await openProClient.listAccommodations(idFournisseur);
  if (signal?.aborted) throw new Error('Cancelled');
  
  // Transformer la réponse avec class-transformer
  const apiResponse = transformAccommodationListResponse(resp);
  const accommodationsList = apiResponse.accommodations ?? apiResponse.accommodationList ?? [];
  
  // Normaliser vers le format interne IAccommodation
  const items: IAccommodation[] = accommodationsList.map((x) => {
    const id = x.accommodationId ?? x.accommodationKey?.accommodationId;
    const name = x.accommodationName ?? x.name ?? '';
    return { accommodationId: Number(id), accommodationName: String(name) };
  });
  
  return items;
}
