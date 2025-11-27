/**
 * Routes pour les suggestions IA
 * 
 * Adaptées pour Cloudflare Workers avec itty-router
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../index.js';
import { jsonResponse, errorResponse } from '../utils/cors.js';
import { getSuggestionsBySupplier, updateSuggestionStatus } from '../services/ai/suggestionStorage.js';
import { generatePricingSuggestions } from '../services/ai/suggestionEngine.js';
import { saveSuggestions } from '../services/ai/suggestionStorage.js';
import { getOpenProClient } from '../services/openProClient.js';
import { createLogger } from '../index.js';
import type { ISuggestionRequest } from '../types/suggestions.js';

/**
 * Normalise les données de tarifs depuis l'API vers un format simplifié
 */
function normalizeRates(rates: unknown): Record<string, number> {
  const normalized: Record<string, number> = {};
  const ratesData = rates as any;
  const tarifs = ratesData.tarifs || ratesData.periodes || [];
  
  for (const tarif of tarifs) {
    const prix = tarif.prix || tarif.tarifPax?.prix || tarif.prixPax?.prix;
    const debut = tarif.debut || tarif.dateDebut;
    const fin = tarif.fin || tarif.dateFin;
    
    if (debut && fin && prix != null) {
      const startDate = new Date(debut + 'T00:00:00');
      const endDate = new Date(fin + 'T23:59:59');
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().split('T')[0];
        normalized[dateKey] = Number(prix);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }
  }
  
  return normalized;
}

/**
 * Normalise les données de stock depuis l'API vers un format simplifié
 */
function normalizeStock(stock: unknown): Record<string, number> {
  const normalized: Record<string, number> = {};
  const stockData = stock as any;
  const jours = stockData.jours || stockData.stock || [];
  
  for (const j of jours) {
    const date = j.date || j.jour;
    const dispo = j.dispo || j.stock || 0;
    if (date) {
      normalized[String(date)] = Number(dispo);
    }
  }
  
  return normalized;
}

/**
 * Enregistre les routes des suggestions
 */
export function suggestionsRouter(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // GET /ai/suggestions/:idFournisseur
  router.get('/ai/suggestions/:idFournisseur', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const url = new URL(request.url);
    const status = url.searchParams.get('status') as 'pending' | 'applied' | 'rejected' | null;
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur: must be a number', 400);
    }
    
    try {
      const suggestions = await getSuggestionsBySupplier(idFournisseur, status || undefined, env);
      return jsonResponse({ suggestions });
    } catch (error) {
      logger.error('Error fetching suggestions', error);
      return errorResponse('Failed to fetch suggestions', 500);
    }
  });
  
  // PATCH /ai/suggestions/:id
  router.patch('/ai/suggestions/:id', async (request: IRequest) => {
    const { id } = request.params!;
    
    let body: { status: 'applied' | 'rejected' };
    try {
      body = await request.json();
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }
    
    const { status } = body;
    
    if (!status || (status !== 'applied' && status !== 'rejected')) {
      return errorResponse('status must be "applied" or "rejected"', 400);
    }
    
    try {
      const updated = await updateSuggestionStatus(id, status, env);
      
      if (!updated) {
        return errorResponse('Suggestion not found', 404);
      }
      
      return jsonResponse({ success: true, suggestion: updated });
    } catch (error) {
      logger.error('Error updating suggestion', error);
      return errorResponse('Failed to update suggestion', 500);
    }
  });
  
  // POST /ai/suggestions/:idFournisseur/generate
  router.post('/ai/suggestions/:idFournisseur/generate', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    
    let body: { idHebergement: number };
    try {
      body = await request.json();
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }
    
    const { idHebergement } = body;
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur: must be a number', 400);
    }
    
    if (!idHebergement || isNaN(idHebergement)) {
      return errorResponse('Invalid idHebergement: must be a number', 400);
    }
    
    try {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 90);
      
      const debut = today.toISOString().split('T')[0];
      const fin = endDate.toISOString().split('T')[0];
      
      const openProClient = getOpenProClient(env);
      
      // Charger les données contextuelles
      const [rates, stock] = await Promise.all([
        openProClient.getRates(idFournisseur, idHebergement, { debut, fin }),
        openProClient.getStock(idFournisseur, idHebergement, { debut, fin })
      ]);
      
      // Préparer la requête d'analyse
      const analysisRequest: ISuggestionRequest = {
        supplierId: idFournisseur,
        accommodationId: idHebergement,
        recentBookings: [],
        currentRates: normalizeRates(rates),
        currentStock: normalizeStock(stock),
      };
      
      // Générer les suggestions
      const suggestions = await generatePricingSuggestions(analysisRequest, env);
      await saveSuggestions(suggestions, env);
      
      return jsonResponse({ 
        message: 'Analyse terminée',
        suggestionsCount: suggestions.length
      });
    } catch (error) {
      logger.error('Error generating suggestions', error);
      return errorResponse('Failed to generate suggestions', 500);
    }
  });
}
