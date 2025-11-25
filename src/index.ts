/**
 * Point d'entrée du Worker Cloudflare
 * 
 * Ce fichier initialise le Worker et configure le routing avec itty-router.
 */

import { Router, type IRequest } from 'itty-router';
import { suppliersRouter } from './routes/suppliers.js';
import { webhooksRouter } from './routes/webhooks.js';
import { suggestionsRouter } from './routes/suggestions.js';
import { cronRouter } from './routes/cron.js';
import { corsHeaders, handleCors, jsonResponse } from './utils/cors.js';

/**
 * Interface Env définissant toutes les variables d'environnement
 * et les bindings disponibles dans le Worker
 */
export interface Env {
  // D1 Database
  DB: D1Database;
  
  // Cloudflare KV (cache iCal)
  ICAL_CACHE: KVNamespace;
  
  // Configuration API OpenPro
  OPENPRO_API_KEY: string;
  OPENPRO_BASE_URL: string;
  
  // Configuration Frontend
  FRONTEND_URL: string;
  
  // Configuration AI
  AI_PROVIDER: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  CLOUDFLARE_AI_GATEWAY_URL?: string;
}

/**
 * Contexte de requête pour le traçage et les logs
 */
export interface RequestContext {
  traceId: string;
  startTime: number;
}

/**
 * Crée un contexte de requête avec traceId et timestamp
 */
function createRequestContext(): RequestContext {
  return {
    traceId: crypto.randomUUID(),
    startTime: Date.now()
  };
}

/**
 * Logger simple pour remplacer fastify.log
 */
export function createLogger(ctx: RequestContext) {
  const prefix = `[${ctx.traceId}]`;
  return {
    info: (message: string, data?: any) => {
      console.log(prefix, message, data ? JSON.stringify(data) : '');
    },
    error: (message: string, error?: any) => {
      console.error(prefix, message, error instanceof Error ? error.message : error);
      if (error?.stack) {
        console.error(error.stack);
      }
    },
    warn: (message: string, data?: any) => {
      console.warn(prefix, message, data ? JSON.stringify(data) : '');
    }
  };
}

/**
 * Gestionnaire d'erreur global
 */
function handleError(error: unknown, ctx: RequestContext): Response {
  const logger = createLogger(ctx);
  logger.error('Unhandled error:', error);
  
  return new Response(
    JSON.stringify({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
      traceId: ctx.traceId
    }),
    {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    }
  );
}

/**
 * Worker principal
 */
export default {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    // Créer le contexte de requête
    const ctx = createRequestContext();
    const logger = createLogger(ctx);
    
    const url = new URL(request.url);
    const startTime = Date.now();
    
    // Logger la requête entrante avec plus de détails
    logger.info(`${request.method} ${url.pathname}${url.search}`, {
      origin: request.headers.get('origin'),
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer')
    });
    
    try {
      // Gérer les requêtes OPTIONS (CORS preflight)
      if (request.method === 'OPTIONS') {
        logger.info('OPTIONS preflight request');
        return handleCors(request);
      }
      
      // Créer le router
      const router = Router();
      
      // Health check endpoint (en premier pour être sûr qu'il fonctionne)
      // IMPORTANT: Les handlers itty-router reçoivent (request, env, executionCtx) automatiquement
      router.get('/health', (request: IRequest, env: Env, executionCtx: ExecutionContext) => {
        logger.info('Health check called');
        return jsonResponse({
          status: 'ok',
          timestamp: new Date().toISOString(),
          traceId: ctx.traceId,
          worker: 'openpro-backend',
          version: '2.0.0'
        });
      });
      
      // Debug endpoint
      router.get('/debug', (request: IRequest, env: Env, executionCtx: ExecutionContext) => {
        logger.info('Debug endpoint called');
        return jsonResponse({
          status: 'ok',
          timestamp: new Date().toISOString(),
          traceId: ctx.traceId,
          request: {
            method: request.method,
            url: request.url,
            pathname: url.pathname,
            headers: Object.fromEntries(request.headers.entries())
          },
          env: {
            hasDB: !!env.DB,
            frontendUrl: env.FRONTEND_URL,
            openproBaseUrl: env.OPENPRO_BASE_URL,
            hasOpenProKey: !!env.OPENPRO_API_KEY
          }
        });
      });
      
      // Enregistrer les routes API
      suppliersRouter(router, env, ctx);
      webhooksRouter(router, env, ctx);
      suggestionsRouter(router, env, ctx);
      cronRouter(router, env, ctx);
      
      // Route par défaut (404) - doit être en dernier
      router.all('*', (request: IRequest) => {
        logger.warn(`No route matched for ${request.method} ${url.pathname}`);
        return jsonResponse({
          error: 'Not Found',
          path: url.pathname,
          traceId: ctx.traceId
        }, 404);
      });
      
      // Gérer la requête
      // IMPORTANT: Utiliser router.fetch() pour Cloudflare Workers (au lieu de router.handle())
      logger.info('Routing request...');
      const response = await router.fetch(request, env, executionCtx);
      
      // Si aucune route ne matche, router.handle() peut retourner undefined
      if (!response) {
        logger.error(`Router returned undefined for ${request.method} ${url.pathname}`);
        return jsonResponse({
          error: 'Internal Server Error',
          message: 'Router did not return a response',
          path: url.pathname,
          traceId: ctx.traceId
        }, 500);
      }
      
      // Logger la réponse
      const duration = Date.now() - startTime;
      logger.info(`${request.method} ${url.pathname} ${response.status} (${duration}ms)`);
      
      return response;
      
    } catch (error) {
      return handleError(error, ctx);
    }
  }
};
