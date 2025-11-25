/**
 * Routes pour l'export iCal des réservations locales
 */

import type { IRequest, Router } from 'itty-router';
import type { Env, RequestContext } from '../../index.js';
import { jsonResponse, errorResponse, corsHeaders } from '../../utils/cors.js';
import { generateIcalFile } from '../../services/openpro/icalExportService.js';
import { getCachedIcal, updateIcalCache, getIcalHistory } from '../../services/openpro/icalCacheService.js';
import { createLogger } from '../../index.js';

/**
 * Enregistre les routes d'export iCal
 */
export function icalRoutes(router: Router, env: Env, ctx: RequestContext) {
  const logger = createLogger(ctx);
  
  // GET /api/suppliers/:idFournisseur/local-bookings.ics
  router.get('/api/suppliers/:idFournisseur/local-bookings.ics', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const url = new URL(request.url);
    const debut = url.searchParams.get('debut') || undefined;
    const fin = url.searchParams.get('fin') || undefined;
    const idHebergementParam = url.searchParams.get('idHebergement');
    const idHebergement = idHebergementParam ? parseInt(idHebergementParam, 10) : undefined;
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur: must be a number', 400);
    }
    
    if (idHebergement !== undefined && isNaN(idHebergement)) {
      return errorResponse('Invalid idHebergement: must be a number', 400);
    }
    
    // Valider les formats de date si fournis
    if (debut && !/^\d{4}-\d{2}-\d{2}$/.test(debut)) {
      return errorResponse('Invalid debut format: must be YYYY-MM-DD', 400);
    }
    
    if (fin && !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
      return errorResponse('Invalid fin format: must be YYYY-MM-DD', 400);
    }
    
    try {
      const filters = { debut, fin, idHebergement };
      
      // Essayer de récupérer depuis le cache
      let icalContent = await getCachedIcal(idFournisseur, env, filters);
      
      // Si pas de cache, générer le fichier et le mettre en cache
      if (!icalContent) {
        logger.info(`Generating iCal file for supplier ${idFournisseur} (cache miss)`);
        icalContent = await generateIcalFile(idFournisseur, env, filters);
        await updateIcalCache(idFournisseur, icalContent, env, filters);
      } else {
        logger.info(`Serving iCal file for supplier ${idFournisseur} from cache`);
      }
      
      // Retourner le fichier iCal avec les bons headers
      return new Response(icalContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="bookings-${idFournisseur}.ics"`,
          ...corsHeaders
        }
      });
    } catch (error) {
      logger.error('Error generating iCal file', error);
      return errorResponse(
        'Failed to generate iCal file',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/suppliers/:idFournisseur/local-bookings.ics/history
  router.get('/api/suppliers/:idFournisseur/local-bookings.ics/history', async (request: IRequest) => {
    const idFournisseur = parseInt(request.params!.idFournisseur, 10);
    const url = new URL(request.url);
    const debut = url.searchParams.get('debut') || undefined;
    const fin = url.searchParams.get('fin') || undefined;
    const idHebergementParam = url.searchParams.get('idHebergement');
    const idHebergement = idHebergementParam ? parseInt(idHebergementParam, 10) : undefined;
    
    if (isNaN(idFournisseur)) {
      return errorResponse('Invalid idFournisseur: must be a number', 400);
    }
    
    if (idHebergement !== undefined && isNaN(idHebergement)) {
      return errorResponse('Invalid idHebergement: must be a number', 400);
    }
    
    // Valider les formats de date si fournis
    if (debut && !/^\d{4}-\d{2}-\d{2}$/.test(debut)) {
      return errorResponse('Invalid debut format: must be YYYY-MM-DD', 400);
    }
    
    if (fin && !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
      return errorResponse('Invalid fin format: must be YYYY-MM-DD', 400);
    }
    
    try {
      const filters = { debut, fin, idHebergement };
      const history = await getIcalHistory(idFournisseur, env, filters);
      
      // Séparer la version actuelle de l'historique
      const currentVersion = history.find(h => h.timestamp === 'current') || null;
      const historyVersions = history.filter(h => h.timestamp !== 'current').slice(0, 10);
      
      return jsonResponse({
        currentVersion: currentVersion ? {
          timestamp: new Date().toISOString(),
          size: currentVersion.size
        } : null,
        history: historyVersions
      });
    } catch (error) {
      logger.error('Error fetching iCal history', error);
      return errorResponse(
        'Failed to fetch iCal history',
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });
}

