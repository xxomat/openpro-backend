/**
 * Routes pour les suggestions IA
 * 
 * Adaptées pour Cloudflare Workers avec itty-router
 */

import type { IRequest } from 'itty-router';
import type { Router } from 'itty-router';
import type { Env, RequestContext } from '../index.js';
import { jsonResponse, errorResponse } from '../utils/cors.js';
import { getSuggestionsBySupplier, updateSuggestionStatus } from '../services/ai/suggestionStorage.js';
import { generatePricingSuggestions } from '../services/ai/suggestionEngine.js';
import { saveSuggestions } from '../services/ai/suggestionStorage.js';
import { loadAccommodationData } from '../services/openpro/accommodationDataService.js';
import { loadAccommodationData } from '../services/openpro/accommodationDataService.js';
import { loadStockForAccommodation } from '../services/openpro/stockService.js';
import { findAccommodationByOpenProId } from '../services/openpro/accommodationService.js';
import { createLogger } from '../index.js';
import type { ISuggestionRequest } from '../types/suggestions.js';

/**
 * Normalise les données de tarifs depuis la DB vers un format simplifié
 */
function normalizeRatesFromDb(data: Record<string, Record<number, any>>): Record<string, number> {
  const normalized: Record<string, number> = {};
  
  // Prendre le premier type de tarif disponible pour chaque date
  for (const [date, rateTypes] of Object.entries(data)) {
    const firstRateType = Object.values(rateTypes)[0];
    if (firstRateType && firstRateType.prix_nuitee != null) {
      normalized[date] = Number(firstRateType.prix_nuitee);
    }
  }
  
  return normalized;
}

/**
 * Normalise les données de stock depuis la DB vers un format simplifié
 */
function normalizeStockFromDb(stock: Record<string, number>): Record<string, number> {
  // Le stock est déjà au bon format depuis loadStockForAccommodation
  return stock;
}

/**
 * Enregistre les routes des suggestions
 */
export function suggestionsRouter(router: typeof Router.prototype, env: Env, ctx: RequestContext) {
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
      
      // Trouver l'ID interne de l'hébergement depuis son ID OpenPro
      const accommodation = await findAccommodationByOpenProId(idHebergement, env);
      if (!accommodation) {
        return errorResponse(`Accommodation with OpenPro ID ${idHebergement} not found`, 404);
      }
      
      // Charger les données contextuelles depuis la DB
      const [ratesData, stock] = await Promise.all([
        loadAccommodationData(accommodation.id, debut, fin, env),
        loadStockForAccommodation(idFournisseur, idHebergement, debut, fin, env)
      ]);
      
      // Préparer la requête d'analyse
      const analysisRequest: ISuggestionRequest = {
        supplierId: idFournisseur,
        accommodationId: idHebergement,
        recentBookings: [],
        currentRates: normalizeRatesFromDb(ratesData),
        currentStock: normalizeStockFromDb(stock),
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
