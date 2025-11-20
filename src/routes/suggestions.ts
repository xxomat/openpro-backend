/**
 * Routes pour les suggestions IA
 * 
 * Ce fichier contient les routes API REST pour gérer les suggestions
 * générées par l'IA pour les ajustements de tarifs et durées minimales.
 */

import type { FastifyInstance } from 'fastify';
import { getSuggestionsBySupplier, updateSuggestionStatus } from '../services/ai/suggestionStorage.js';
import { generatePricingSuggestions } from '../services/ai/suggestionEngine.js';
import { saveSuggestions } from '../services/ai/suggestionStorage.js';
import { openProClient } from '../services/openProClient.js';
import { getAccommodations } from '../services/openpro/accommodationService.js';
import { loadRatesForAccommodation } from '../services/openpro/rateService.js';
import { loadStockForAccommodation } from '../services/openpro/stockService.js';

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
 * 
 * @param fastify - Instance Fastify
 */
export async function suggestionsRoutes(fastify: FastifyInstance) {
  // GET /api/suggestions/:idFournisseur
  fastify.get<{
    Params: { idFournisseur: string };
    Querystring: { status?: 'pending' | 'applied' | 'rejected' }
  }>('/:idFournisseur', async (request, reply) => {
    const idFournisseur = parseInt(request.params.idFournisseur, 10);
    const { status } = request.query;
    
    if (isNaN(idFournisseur)) {
      return reply.status(400).send({ 
        error: 'Invalid idFournisseur',
        message: 'idFournisseur must be a number'
      });
    }
    
    try {
      const suggestions = await getSuggestionsBySupplier(idFournisseur, status);
      return { suggestions };
    } catch (error) {
      fastify.log.error('Error fetching suggestions:', error);
      reply.status(500).send({ 
        error: 'Failed to fetch suggestions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // PATCH /api/suggestions/:id
  fastify.patch<{
    Params: { id: string };
    Body: { status: 'applied' | 'rejected' }
  }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;
    
    if (!status || (status !== 'applied' && status !== 'rejected')) {
      return reply.status(400).send({ 
        error: 'Invalid status',
        message: 'status must be "applied" or "rejected"'
      });
    }
    
    try {
      const updated = await updateSuggestionStatus(id, status);
      
      if (!updated) {
        return reply.status(404).send({ error: 'Suggestion not found' });
      }
      
      return { success: true, suggestion: updated };
    } catch (error) {
      fastify.log.error('Error updating suggestion:', error);
      reply.status(500).send({ 
        error: 'Failed to update suggestion',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // POST /api/suggestions/:idFournisseur/generate
  fastify.post<{
    Params: { idFournisseur: string };
    Body: { idHebergement: number }
  }>('/:idFournisseur/generate', async (request, reply) => {
    const idFournisseur = parseInt(request.params.idFournisseur, 10);
    const { idHebergement } = request.body;
    
    if (isNaN(idFournisseur)) {
      return reply.status(400).send({ 
        error: 'Invalid idFournisseur',
        message: 'idFournisseur must be a number'
      });
    }
    
    if (!idHebergement || isNaN(idHebergement)) {
      return reply.status(400).send({ 
        error: 'Invalid idHebergement',
        message: 'idHebergement must be a number'
      });
    }
    
    try {
      // Calculer la plage de dates (90 jours)
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 90);
      
      const debut = today.toISOString().split('T')[0];
      const fin = endDate.toISOString().split('T')[0];
      
      // Charger les données contextuelles
      const [rates, stock] = await Promise.all([
        openProClient.getRates(idFournisseur, idHebergement, { debut, fin }),
        openProClient.getStock(idFournisseur, idHebergement, { debut, fin })
      ]);
      
      // Préparer la requête d'analyse
      const analysisRequest = {
        idFournisseur,
        idHebergement,
        recentBookings: [], // Pour l'analyse manuelle, pas de réservations récentes
        currentRates: normalizeRates(rates),
        currentStock: normalizeStock(stock),
      };
      
      // Générer les suggestions
      const suggestions = await generatePricingSuggestions(analysisRequest);
      await saveSuggestions(suggestions);
      
      return { 
        message: 'Analyse terminée',
        suggestionsCount: suggestions.length
      };
    } catch (error) {
      fastify.log.error('Error generating suggestions:', error);
      reply.status(500).send({ 
        error: 'Failed to generate suggestions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

