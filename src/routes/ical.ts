/**
 * Routes pour la gestion iCal
 * 
 * Gère la configuration iCal (import/export URLs) et l'export des flux iCal.
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../index.js';
import { jsonResponse, errorResponse } from '../utils/cors.js';
import { createLogger } from '../index.js';
import {
  loadIcalSyncConfig,
  saveIcalSyncConfig,
  deleteIcalSyncConfig,
  loadAllIcalSyncConfigs,
  getExportIcal
} from '../services/ical/icalSyncService.js';

/**
 * Enregistre les routes iCal
 */
export function icalRouter(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);

  // GET /api/ical-config/:idHebergement - Liste toutes les configurations iCal pour un hébergement
  router.get('/api/ical-config/:idHebergement', async (request: IRequest) => {
    const idHebergement = request.params?.idHebergement;
    if (!idHebergement) {
      return errorResponse('Missing idHebergement', 400);
    }

    try {
      const configs = await loadAllIcalSyncConfigs(idHebergement, env);
      return jsonResponse({ configs });
    } catch (error) {
      logger.error('Error loading iCal configs', error);
      return errorResponse('Internal server error', 500);
    }
  });

  // POST /api/ical-config - Créer ou mettre à jour une configuration iCal
  router.post('/api/ical-config', async (request: IRequest) => {
    let data: {
      idHebergement: string;
      platform: string;
      importUrl?: string;
      exportUrl?: string;
    };

    try {
      data = await request.json();
    } catch (error) {
      return errorResponse('Invalid JSON body', 400);
    }

    if (!data.idHebergement || !data.platform) {
      return errorResponse('Missing idHebergement or platform', 400);
    }

    try {
      // Générer l'URL de base depuis la requête
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      const config = await saveIcalSyncConfig(data, baseUrl, env);
      return jsonResponse(config);
    } catch (error) {
      logger.error('Error saving iCal config', error);
      return errorResponse('Internal server error', 500);
    }
  });

  // DELETE /api/ical-config/:idHebergement/:platform - Supprimer une configuration iCal
  router.delete('/api/ical-config/:idHebergement/:platform', async (request: IRequest) => {
    const idHebergement = request.params?.idHebergement;
    const platform = request.params?.platform;

    if (!idHebergement || !platform) {
      return errorResponse('Missing idHebergement or platform', 400);
    }

    try {
      const deleted = await deleteIcalSyncConfig(idHebergement, decodeURIComponent(platform), env);
      if (deleted) {
        return jsonResponse({ success: true });
      } else {
        return errorResponse('Configuration not found', 404);
      }
    } catch (error) {
      logger.error('Error deleting iCal config', error);
      return errorResponse('Internal server error', 500);
    }
  });

  // GET /api/ical/export/:idHebergement/:platform - Exporter le flux iCal
  router.get('/api/ical/export/:idHebergement/:platform', async (request: IRequest) => {
    const idHebergement = request.params?.idHebergement;
    const platform = request.params?.platform;

    if (!idHebergement || !platform) {
      return errorResponse('Missing idHebergement or platform', 400);
    }

    try {
      const icalContent = await getExportIcal(idHebergement, decodeURIComponent(platform), env);
      
      return new Response(icalContent, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="export-${idHebergement}-${platform}.ics"`,
          'Cache-Control': 'no-cache'
        }
      });
    } catch (error) {
      logger.error('Error generating iCal export', error);
      return errorResponse('Internal server error', 500);
    }
  });
}

