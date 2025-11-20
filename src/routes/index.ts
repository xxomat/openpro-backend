/**
 * Agrégation des routes
 * 
 * Ce fichier enregistre toutes les routes de l'application avec leurs préfixes.
 */

import type { FastifyInstance } from 'fastify';
import { suppliersRoutes } from './suppliers.js';
import { webhooksRoutes } from './webhooks.js';
import { suggestionsRoutes } from './suggestions.js';
import { trafficRoutes } from './traffic.js';
import { dashboardRoute } from './dashboard.js';

/**
 * Enregistre toutes les routes de l'application
 * 
 * @param fastify - Instance Fastify
 */
export async function registerRoutes(fastify: FastifyInstance) {
  // API routes
  await fastify.register(suppliersRoutes, { prefix: '/api/suppliers' });
  await fastify.register(webhooksRoutes, { prefix: '/api/webhooks' });
  await fastify.register(suggestionsRoutes, { prefix: '/ai/suggestions' });
  await fastify.register(trafficRoutes, { prefix: '/api/traffic' });
  
  // Dashboard route (doit être enregistré en dernier pour ne pas interférer avec les API routes)
  await fastify.register(dashboardRoute);
}

