/**
 * Routes pour les webhooks OpenPro
 * 
 * Ce fichier contient les routes pour recevoir les webhooks de l'API OpenPro,
 * notamment les notifications de nouvelles réservations qui déclenchent
 * l'analyse IA pour générer des suggestions.
 */

import type { FastifyInstance } from 'fastify';
import { openProClient } from '../services/openProClient.js';
import { generatePricingSuggestions } from '../services/ai/suggestionEngine.js';
import { saveSuggestions } from '../services/ai/suggestionStorage.js';
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
 * 
 * TODO: Implémenter le chargement depuis une base de données
 */
async function loadRecentBookings(idFournisseur: number, idHebergement: number): Promise<BookingAnalysis[]> {
  // Pour l'instant, retourner un tableau vide
  // En production, charger depuis une base de données
  return [];
}

/**
 * Enregistre les routes des webhooks
 * 
 * @param fastify - Instance Fastify
 */
export async function webhooksRoutes(fastify: FastifyInstance) {
  // POST /api/webhooks/openpro/booking
  fastify.post<{
    Body: {
      evenement?: string;
      idDossier: number;
      idFournisseur: number;
      idHebergement: number;
      dateArrivee: string;
      dateDepart: string;
      montant: number;
    }
  }>('/openpro/booking', async (request, reply) => {
    const booking = request.body;
    
    fastify.log.info(`Webhook reçu: nouvelle réservation ${booking.idDossier}`);
    
    try {
      // Calculer la plage de dates pour charger les données contextuelles (90 jours)
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 90);
      
      const debut = today.toISOString().split('T')[0];
      const fin = endDate.toISOString().split('T')[0];
      
      // Charger les données contextuelles en parallèle
      const [rates, stock, recentBookings] = await Promise.all([
        openProClient.getRates(booking.idFournisseur, booking.idHebergement, { debut, fin }),
        openProClient.getStock(booking.idFournisseur, booking.idHebergement, { debut, fin }),
        loadRecentBookings(booking.idFournisseur, booking.idHebergement)
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
      generatePricingSuggestions(analysisRequest)
        .then(suggestions => {
          saveSuggestions(suggestions);
          fastify.log.info(`${suggestions.length} suggestions générées pour hébergement ${booking.idHebergement}`);
        })
        .catch(err => {
          fastify.log.error('Erreur génération suggestions:', err);
        });
      
      // Réponse rapide au webhook
      return { received: true, message: 'Analyse en cours' };
      
    } catch (error) {
      fastify.log.error('Erreur traitement webhook:', error);
      reply.status(500).send({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

