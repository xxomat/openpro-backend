/**
 * Agrégation des routes
 * 
 * Ce fichier enregistre toutes les routes de l'application avec leurs préfixes.
 */

import type { FastifyInstance } from 'fastify';
import { suppliersRoutes } from './suppliers.js';
import { webhooksRoutes } from './webhooks.js';
import { suggestionsRoutes } from './suggestions.js';

/**
 * Enregistre toutes les routes de l'application
 * 
 * @param fastify - Instance Fastify
 */
export async function registerRoutes(fastify: FastifyInstance) {
  await fastify.register(suppliersRoutes, { prefix: '/api/suppliers' });
  await fastify.register(webhooksRoutes, { prefix: '/api/webhooks' });
  await fastify.register(suggestionsRoutes, { prefix: '/api/suggestions' });
}

