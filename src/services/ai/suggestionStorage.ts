/**
 * Stockage des suggestions IA avec D1
 * 
 * Ce fichier gère le stockage des suggestions générées par l'IA dans D1 (SQLite).
 */

import type { PricingSuggestion } from '../../types/suggestions.js';
import type { Env } from '../../index.js';

/**
 * Sauvegarde des suggestions dans D1
 * 
 * @param suggestions - Liste des suggestions à sauvegarder
 * @param env - Variables d'environnement Workers
 */
export async function saveSuggestions(suggestions: PricingSuggestion[], env: Env): Promise<void> {
  if (!suggestions || suggestions.length === 0) {
    return;
  }
  
  // Préparer les requêtes d'insertion
  const statements = suggestions.map(suggestion => {
    return env.DB.prepare(`
      INSERT INTO ai_suggestions (
        id, id_fournisseur, id_hebergement, suggestion_type,
        status, suggested_data, rationale, confidence_score,
        date_created, date_modified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      suggestion.id,
      suggestion.idFournisseur,
      suggestion.idHebergement,
      'pricing', // Type de suggestion
      suggestion.status,
      JSON.stringify(suggestion), // Stocker toute la suggestion en JSON
      suggestion.rationale || null,
      suggestion.confidence || null,
      suggestion.createdAt.toISOString(),
      suggestion.createdAt.toISOString()
    );
  });
  
  // Exécuter toutes les insertions en batch
  await env.DB.batch(statements);
}

/**
 * Récupère les suggestions pour un fournisseur donné
 * 
 * @param idFournisseur - Identifiant du fournisseur
 * @param status - Statut optionnel pour filtrer les suggestions
 * @param env - Variables d'environnement Workers
 * @returns Liste des suggestions correspondant aux critères
 */
export async function getSuggestionsBySupplier(
  idFournisseur: number,
  status: 'pending' | 'applied' | 'rejected' | undefined,
  env: Env
): Promise<PricingSuggestion[]> {
  let query = `
    SELECT * FROM ai_suggestions
    WHERE id_fournisseur = ?
  `;
  const params: any[] = [idFournisseur];
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY date_created DESC';
  
  const result = await env.DB.prepare(query).bind(...params).all();
  
  if (!result.results) {
    return [];
  }
  
  // Convertir les résultats en PricingSuggestion
  return result.results.map((row: any) => {
    const suggestionData = JSON.parse(row.suggested_data);
    return {
      ...suggestionData,
      createdAt: new Date(row.date_created)
    } as PricingSuggestion;
  });
}

/**
 * Met à jour le statut d'une suggestion
 * 
 * @param id - Identifiant de la suggestion
 * @param status - Nouveau statut (applied ou rejected)
 * @param env - Variables d'environnement Workers
 * @returns La suggestion mise à jour ou null si non trouvée
 */
export async function updateSuggestionStatus(
  id: string,
  status: 'applied' | 'rejected',
  env: Env
): Promise<PricingSuggestion | null> {
  // Vérifier que la suggestion existe
  const existing = await env.DB.prepare(`
    SELECT suggested_data FROM ai_suggestions WHERE id = ?
  `).bind(id).first();
  
  if (!existing) {
    return null;
  }
  
  // Mettre à jour le statut
  await env.DB.prepare(`
    UPDATE ai_suggestions 
    SET status = ?, date_modified = ?
    WHERE id = ?
  `).bind(status, new Date().toISOString(), id).run();
  
  // Récupérer et retourner la suggestion mise à jour
  const updated = await env.DB.prepare(`
    SELECT * FROM ai_suggestions WHERE id = ?
  `).bind(id).first();
  
  if (!updated) {
    return null;
  }
  
  const suggestionData = JSON.parse((updated as any).suggested_data);
  return {
    ...suggestionData,
    status,
    createdAt: new Date((updated as any).date_created)
  } as PricingSuggestion;
}
