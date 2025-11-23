/**
 * Service de chargement des hébergements
 * 
 * Ce fichier contient les fonctions pour charger la liste des hébergements
 * depuis l'API OpenPro et normaliser les données dans le format interne.
 */

import { getOpenProClient } from '../openProClient.js';
import type { Accommodation } from '../../types/api.js';
import type { AccommodationListResponse, ApiAccommodation } from '../../types/apiTypes.js';
import type { Env } from '../../index.js';

/**
 * Charge la liste des hébergements pour un fournisseur donné
 * 
 * Cette fonction appelle l'API OpenPro pour récupérer les hébergements d'un fournisseur
 * et normalise les différentes structures de réponse possibles (API réelle vs stub)
 * vers le format interne { idHebergement, nomHebergement }.
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
): Promise<Accommodation[]> {
  const openProClient = getOpenProClient(env);
  const resp = await openProClient.listAccommodations(idFournisseur);
  if (signal?.aborted) throw new Error('Cancelled');
  
  // Normalize API/stub shapes to internal { idHebergement, nomHebergement }
  const apiResponse = resp as unknown as AccommodationListResponse;
  const accommodationsList: ApiAccommodation[] = apiResponse.hebergements ?? apiResponse.listeHebergement ?? [];
  
  const items: Accommodation[] = accommodationsList.map((x: ApiAccommodation) => {
    const id = x.idHebergement ?? x.cleHebergement?.idHebergement;
    const name = x.nomHebergement ?? x.nom ?? '';
    return { idHebergement: Number(id), nomHebergement: String(name) };
  });
  
  return items;
}

