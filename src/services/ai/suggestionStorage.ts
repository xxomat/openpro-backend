/**
 * Stockage des suggestions IA
 * 
 * Ce fichier gère le stockage en mémoire des suggestions générées par l'IA.
 * En production, ce stockage devrait être migré vers une base de données.
 */

import type { PricingSuggestion } from '../../types/suggestions.js';

/**
 * Stockage en mémoire des suggestions (Map<id, PricingSuggestion>)
 * 
 * TODO: Migrer vers une base de données en production
 */
const suggestionsStore = new Map<string, PricingSuggestion>();

/**
 * Sauvegarde des suggestions dans le stockage
 * 
 * @param suggestions - Liste des suggestions à sauvegarder
 */
export async function saveSuggestions(suggestions: PricingSuggestion[]): Promise<void> {
  for (const suggestion of suggestions) {
    suggestionsStore.set(suggestion.id, suggestion);
  }
}

/**
 * Récupère les suggestions pour un fournisseur donné
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param status - Statut optionnel pour filtrer les suggestions
 * @returns Liste des suggestions correspondant aux critères
 */
export async function getSuggestionsBySupplier(
  idFournisseur: number,
  status?: 'pending' | 'applied' | 'rejected'
): Promise<PricingSuggestion[]> {
  const all = Array.from(suggestionsStore.values());
  let filtered = all.filter(s => s.idFournisseur === idFournisseur);
  
  if (status) {
    filtered = filtered.filter(s => s.status === status);
  }
  
  // Trier par date de création (plus récent en premier)
  return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Met à jour le statut d'une suggestion
 * 
 * @param id - Identifiant de la suggestion
 * @param status - Nouveau statut (applied ou rejected)
 * @returns La suggestion mise à jour ou null si non trouvée
 */
export async function updateSuggestionStatus(
  id: string,
  status: 'applied' | 'rejected'
): Promise<PricingSuggestion | null> {
  const suggestion = suggestionsStore.get(id);
  
  if (!suggestion) {
    return null;
  }
  
  suggestion.status = status;
  suggestionsStore.set(id, suggestion);
  
  return suggestion;
}

