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
import type { IBookingAnalysis, ISuggestionRequest } from '../types/suggestions.js';

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
 * Normalise les données de stock depuis la DB ou l'API vers un format simplifié
 */
function normalizeStock(stock: unknown): Record<string, number> {
  // Si c'est déjà un Record<string, number> (depuis la DB), le retourner tel quel
  if (stock && typeof stock === 'object' && !Array.isArray(stock)) {
    const stockRecord = stock as Record<string, unknown>;
    // Vérifier si c'est déjà au format attendu (clés sont des dates)
    if (Object.keys(stockRecord).every(key => /^\d{4}-\d{2}-\d{2}$/.test(key))) {
      return stockRecord as Record<string, number>;
    }
  }
  
  // Sinon, normaliser depuis l'ancien format API
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
  _supplierId: number,
  _accommodationId: number,
  _env: Env
): Promise<IBookingAnalysis[]> {
  // TODO: Charger depuis D1 les réservations locales + OpenPro
  return [];
}

/**
 * Enregistre les routes des webhooks
 */
export function webhooksRouter(router: typeof Router.prototype, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // GET /api/webhooks/openpro/booking?idFournisseur=X&idDossier=Y
  router.get('/api/webhooks/openpro/booking', async (request: IRequest) => {
    const url = new URL(request.url);
    const idFournisseur = url.searchParams.get('idFournisseur');
    const idDossier = url.searchParams.get('idDossier');
    
    if (!idFournisseur || !idDossier) {
      return errorResponse('Missing idFournisseur or idDossier', 400);
    }
    
    const idFournisseurNum = parseInt(idFournisseur, 10);
    const idDossierNum = parseInt(idDossier, 10);
    
    if (isNaN(idFournisseurNum) || isNaN(idDossierNum)) {
      return errorResponse('Invalid idFournisseur or idDossier', 400);
    }
    
    // Vérifier que idFournisseur correspond à SUPPLIER_ID
    const { getSupplierId } = await import('../config/supplier.js');
    const SUPPLIER_ID = getSupplierId(env);
    if (idFournisseurNum !== SUPPLIER_ID) {
      return errorResponse('Invalid supplier ID', 403);
    }
    
    logger.info(`Webhook GET reçu: réservation ${idDossierNum} pour fournisseur ${idFournisseurNum}`);
    
    try {
      const openProClient = getOpenProClient(env);
      
      // Récupérer le dossier depuis OpenPro
      const dossier = await openProClient.getBooking(idFournisseurNum, idDossierNum);
      
      // Mapper vers le format DB
      const { mapOpenProDossierToBooking } = await import('../services/openpro/openProBookingService.js');
      const mappedBooking = await mapOpenProDossierToBooking(dossier, env);
      
      // Vérifier si la réservation existe déjà en DB
      const existing = await env.DB.prepare(`
        SELECT id, booking_status FROM local_bookings
        WHERE reference = ? AND reservation_platform = 'OpenPro'
        LIMIT 1
      `).bind(idDossier).first() as { id: string; booking_status: string } | null;
      
      if (existing) {
        // Mettre à jour si nécessaire (sauf si déjà annulée)
        if (existing.booking_status !== 'Cancelled') {
          await env.DB.prepare(`
            UPDATE local_bookings
            SET id_hebergement = ?, date_arrivee = ?, date_depart = ?,
                client_nom = ?, client_prenom = ?, client_email = ?, client_telephone = ?,
                nb_personnes = ?, montant_total = ?,
                date_modification = datetime('now')
            WHERE id = ?
          `).bind(
            mappedBooking.accommodationId,
            mappedBooking.arrivalDate,
            mappedBooking.departureDate,
            mappedBooking.clientName?.split(' ').slice(1).join(' ') || null, // nom
            mappedBooking.clientName?.split(' ')[0] || null, // prénom
            mappedBooking.clientEmail || null,
            mappedBooking.clientPhone || null,
            mappedBooking.numberOfPersons || 2,
            mappedBooking.totalAmount || null,
            existing.id
          ).run();
          
          logger.info(`Réservation ${idDossierNum} mise à jour en DB`);
        }
      } else {
        // Insérer en DB
        const { BookingStatus, PlateformeReservation } = await import('../types/api.js');
        
        await env.DB.prepare(`
          INSERT INTO local_bookings (
            id_fournisseur, id_hebergement, date_arrivee, date_depart,
            client_nom, client_prenom, client_email, client_telephone,
            nb_personnes, montant_total, reference,
            reservation_platform, booking_status,
            date_creation, date_modification
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          SUPPLIER_ID,
          mappedBooking.accommodationId,
          mappedBooking.arrivalDate,
          mappedBooking.departureDate,
          mappedBooking.clientName?.split(' ').slice(1).join(' ') || null, // nom
          mappedBooking.clientName?.split(' ')[0] || null, // prénom
          mappedBooking.clientEmail || null,
          mappedBooking.clientPhone || null,
          mappedBooking.numberOfPersons || 2,
          mappedBooking.totalAmount || null,
          idDossier,
          PlateformeReservation.OpenPro,
          BookingStatus.Confirmed
        ).run();
        
        logger.info(`Réservation ${idDossierNum} insérée en DB`);
      }
      
      return jsonResponse({ received: true, message: 'Booking processed' });
      
    } catch (error) {
      logger.error('Erreur traitement webhook GET', error);
      return errorResponse(
        'Internal server error',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });
  
  // POST /api/webhooks/openpro/booking (ancien format, conservé pour compatibilité)
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
      
      // Trouver l'ID interne de l'hébergement depuis son ID OpenPro
      const { findAccommodationByOpenProId } = await import('../services/openpro/accommodationService.js');
      const accommodation = await findAccommodationByOpenProId(booking.idHebergement, env);
      if (!accommodation) {
        logger.warn(`Accommodation with OpenPro ID ${booking.idHebergement} not found in DB`);
        // Continuer quand même avec les données disponibles
      }
      
      // Charger les données contextuelles depuis la DB
      const { loadAccommodationData } = await import('../services/openpro/accommodationDataService.js');
      const { loadStockForAccommodation } = await import('../services/openpro/stockService.js');
      
      const [ratesData, stock, recentBookings] = await Promise.all([
        accommodation 
          ? loadAccommodationData(accommodation.id, debut, fin, env)
          : Promise.resolve({}),
        loadStockForAccommodation(booking.idFournisseur, booking.idHebergement, debut, fin, env),
        loadRecentBookings(booking.idFournisseur, booking.idHebergement, env)
      ]);
      
      // Normaliser les tarifs depuis la DB
      const rates: any = { tarifs: [] };
      for (const [date, rateTypes] of Object.entries(ratesData)) {
        for (const [rateTypeId, data] of Object.entries(rateTypes)) {
          if (data.prix_nuitee != null) {
            rates.tarifs.push({
              debut: date,
              fin: date,
              prix: data.prix_nuitee
            });
          }
        }
      }
      
      // Préparer les données pour l'analyse
      const analysisRequest: ISuggestionRequest = {
        supplierId: booking.idFournisseur,
        accommodationId: booking.idHebergement,
        recentBookings: [
          ...recentBookings,
          {
            bookingId: booking.idDossier,
            supplierId: booking.idFournisseur,
            accommodationId: booking.idHebergement,
            arrivalDate: booking.dateArrivee,
            departureDate: booking.dateDepart,
            amount: booking.montant,
            timestamp: new Date()
          }
        ],
        currentRates: normalizeRates(rates), // rates est déjà normalisé depuis la DB
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
