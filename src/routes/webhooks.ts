/**
 * Routes pour les webhooks OpenPro
 * 
 * Adaptées pour Cloudflare Workers avec itty-router
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../index.js';
import { jsonResponse, errorResponse } from '../utils/cors.js';
import { getOpenProClient } from '../services/openProClient.js';
import { generatePricingSuggestions } from '../services/ai/suggestionEngine.js';
import { saveSuggestions } from '../services/ai/suggestionStorage.js';
import { createLogger } from '../index.js';
import type { BookingAnalysis } from '../types/suggestions.js';

/**
 * Normalise les données de tarifs depuis l'API vers un format simplifié
 */
function normalizeRates(rates: unknown): Record<string, number> {
  const normalized: Record<string, number> = {};
  const ratesData = rates as any;
  const tarifs = ratesData.tarifs || ratesData.periodes || [];
  
  for (const tarif of tarifs) {
    const debut = tarif.debut || tarif.dateDebut;
    const fin = tarif.fin || tarif.dateFin;
    const prix = tarif.prix || tarif.tarifPax?.prix || tarif.prixPax?.prix;
    
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
 * Charge les réservations récentes pour un hébergement
 */
async function loadRecentBookings(
  idFournisseur: number,
  idHebergement: number,
  env: Env
): Promise<BookingAnalysis[]> {
  // TODO: Charger depuis D1 les réservations locales + OpenPro
  return [];
}

/**
 * Enregistre les routes des webhooks
 */
export function webhooksRouter(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // POST /api/webhooks/openpro/booking
  router.post('/api/webhooks/openpro/booking', async (request: IRequest) => {
    let booking: {
      evenement?: string;
      idDossier: number;
      idFournisseur: number;
      idHebergement: number;
      dateArrivee: string;
      dateDepart: string;
      montant: number;
    };
    
    try {
      booking = await request.json();
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }
    
    logger.info(`Webhook reçu: nouvelle réservation ${booking.idDossier}`);
    
    try {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 90);
      
      const debut = today.toISOString().split('T')[0];
      const fin = endDate.toISOString().split('T')[0];
      
      const openProClient = getOpenProClient(env);
      
      // Charger les données contextuelles en parallèle
      const [rates, stock, recentBookings] = await Promise.all([
        openProClient.getRates(booking.idFournisseur, booking.idHebergement, { debut, fin }),
        openProClient.getStock(booking.idFournisseur, booking.idHebergement, { debut, fin }),
        loadRecentBookings(booking.idFournisseur, booking.idHebergement, env)
      ]);
      
      // Préparer les données pour l'analyse
      const analysisRequest = {
        idFournisseur: booking.idFournisseur,
        idHebergement: booking.idHebergement,
        recentBookings: [
          ...recentBookings,
          {
            idDossier: booking.idDossier,
            idFournisseur: booking.idFournisseur,
            idHebergement: booking.idHebergement,
            dateArrivee: booking.dateArrivee,
            dateDepart: booking.dateDepart,
            montant: booking.montant,
            timestamp: new Date()
          }
        ],
        currentRates: normalizeRates(rates),
        currentStock: normalizeStock(stock),
      };
      
      // Générer les suggestions via IA (asynchrone, ne bloque pas le webhook)
      // Utiliser waitUntil pour continuer l'exécution après la réponse
      generatePricingSuggestions(analysisRequest, env)
        .then(suggestions => {
          return saveSuggestions(suggestions, env);
        })
        .then(() => {
          logger.info(`Suggestions générées pour hébergement ${booking.idHebergement}`);
        })
        .catch(err => {
          logger.error('Erreur génération suggestions', err);
        });
      
      // Réponse rapide au webhook
      return jsonResponse({ received: true, message: 'Analyse en cours' });
      
    } catch (error) {
      logger.error('Erreur traitement webhook', error);
      return errorResponse(
        'Internal server error',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });
}
