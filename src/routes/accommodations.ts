/**
 * Routes pour la gestion des hébergements
 * 
 * Gère les CRUD des hébergements et leurs identifiants externes.
 */

import type { IRequest } from 'itty-router';
import type { Router } from 'itty-router';
import type { Env, RequestContext } from '../index.js';
import { jsonResponse, errorResponse } from '../utils/cors.js';
import { createLogger } from '../index.js';
import { PlateformeReservation } from '../types/api.js';
import {
  createAccommodation,
  updateAccommodation,
  deleteAccommodation,
  loadAccommodation,
  loadAllAccommodations,
  setAccommodationExternalId,
} from '../services/openpro/accommodationService.js';
import { getStartupWarnings } from '../services/openpro/startupSyncService.js';

/**
 * Enregistre les routes des hébergements
 */
export function accommodationsRouter(router: typeof Router.prototype, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);

  // GET /api/accommodations - Liste tous les hébergements
  router.get('/api/accommodations', async (_request: IRequest) => {
    try {
      const accommodations = await loadAllAccommodations(env);
      return jsonResponse({ accommodations });
    } catch (error) {
      logger.error('Error loading accommodations', error);
      return errorResponse('Internal server error', 500);
    }
  });

  // GET /api/accommodations/:id - Charge un hébergement
  router.get('/api/accommodations/:id', async (request: IRequest) => {
    const id = request.params?.id;
    if (!id) {
      return errorResponse('Missing id', 400);
    }

    try {
      const accommodation = await loadAccommodation(id, env);
      if (!accommodation) {
        return errorResponse('Accommodation not found', 404);
      }
      return jsonResponse(accommodation);
    } catch (error) {
      logger.error('Error loading accommodation', error);
      return errorResponse('Internal server error', 500);
    }
  });

  // POST /api/accommodations - Créer un hébergement
  router.post('/api/accommodations', async (request: IRequest) => {
    let data: {
      nom: string;
      ids: Record<PlateformeReservation, string> & { [PlateformeReservation.Directe]: string };
    };

    try {
      data = await request.json();
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }

    if (!data.nom) {
      return errorResponse('Missing nom', 400);
    }

    // Vérifier que l'ID Directe (GUID) est fourni
    if (!data.ids || !data.ids[PlateformeReservation.Directe]) {
      return errorResponse('L\'ID pour la plateforme "Directe" est obligatoire (GUID généré côté frontend)', 400);
    }

    // Vérifier que l'ID OpenPro est fourni
    if (!data.ids || !data.ids[PlateformeReservation.OpenPro]) {
      return errorResponse('L\'ID pour la plateforme "OpenPro" est obligatoire', 400);
    }

    try {
      const accommodation = await createAccommodation(data, env);
      return jsonResponse(accommodation, 201);
    } catch (error) {
      logger.error('Error creating accommodation', error);
      if (error instanceof Error && error.message.includes('obligatoire')) {
        return errorResponse(error.message, 400);
      }
      return errorResponse('Internal server error', 500);
    }
  });

  // PUT /api/accommodations/:id - Mettre à jour un hébergement
  router.put('/api/accommodations/:id', async (request: IRequest) => {
    const id = request.params?.id;
    if (!id) {
      return errorResponse('Missing id', 400);
    }

    let data: {
      nom?: string;
      ids?: Partial<Record<PlateformeReservation, string>>;
    };

    try {
      data = await request.json();
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }

    try {
      const accommodation = await updateAccommodation(id, data, env);
      if (!accommodation) {
        return errorResponse('Accommodation not found', 404);
      }
      return jsonResponse(accommodation);
    } catch (error) {
      logger.error('Error updating accommodation', error);
      return errorResponse('Internal server error', 500);
    }
  });

  // DELETE /api/accommodations/:id - Supprimer un hébergement
  router.delete('/api/accommodations/:id', async (request: IRequest) => {
    const id = request.params?.id;
    if (!id) {
      return errorResponse('Missing id', 400);
    }

    try {
      const deleted = await deleteAccommodation(id, env);
      if (deleted) {
        return jsonResponse({ success: true });
      } else {
        return errorResponse('Accommodation not found', 404);
      }
    } catch (error) {
      logger.error('Error deleting accommodation', error);
      return errorResponse('Internal server error', 500);
    }
  });

  // POST /api/accommodations/:id/external-ids - Définir un ID externe
  router.post('/api/accommodations/:id/external-ids', async (request: IRequest) => {
    const id = request.params?.id;
    if (!id) {
      return errorResponse('Missing id', 400);
    }

    let data: {
      platform: string;
      externalId: string;
    };

    try {
      data = await request.json();
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }

    if (!data.platform || !data.externalId) {
      return errorResponse('Missing platform or externalId', 400);
    }

    try {
      await setAccommodationExternalId(id, data.platform, data.externalId, env);
      return jsonResponse({ success: true });
    } catch (error) {
      logger.error('Error setting external ID', error);
      return errorResponse('Internal server error', 500);
    }
  });

  // GET /api/accommodations/:id/external-ids - Récupérer tous les IDs externes
  router.get('/api/accommodations/:id/external-ids', async (request: IRequest) => {
    const id = request.params?.id;
    if (!id) {
      return errorResponse('Missing id', 400);
    }

    try {
      const accommodation = await loadAccommodation(id, env);
      if (!accommodation) {
        return errorResponse('Accommodation not found', 404);
      }
      return jsonResponse({ ids: accommodation.ids || {} });
    } catch (error) {
      logger.error('Error loading external IDs', error);
      return errorResponse('Internal server error', 500);
    }
  });

  // GET /api/startup-warnings - Récupérer les avertissements de synchronisation au démarrage
  router.get('/api/startup-warnings', async (_request: IRequest) => {
    try {
      const warnings = getStartupWarnings();
      return jsonResponse({ warnings, count: warnings.length });
    } catch (error) {
      logger.error('Error loading startup warnings', error);
      return errorResponse('Internal server error', 500);
    }
  });
}

