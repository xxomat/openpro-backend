/**
 * Route pour servir le dashboard de monitoring
 * 
 * Ce fichier configure Fastify pour servir les fichiers statiques
 * du dashboard React buildé par Vite.
 */

import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Enregistre la route pour servir le dashboard
 * 
 * @param fastify - Instance Fastify
 */
export async function dashboardRoute(fastify: FastifyInstance) {
  // Chemin vers le dashboard buildé
  // En mode dev (tsx), __dirname pointe vers src/routes/, donc on remonte à la racine puis va dans dist/dashboard
  // En mode prod, __dirname pointe vers dist/src/routes/, donc on remonte à dist/ puis va dans dashboard
  const isDev = process.env.NODE_ENV !== 'production';
  const dashboardPath = isDev 
    ? join(__dirname, '..', '..', 'dist', 'dashboard')
    : join(__dirname, '..', '..', 'dashboard');
  
  // Servir les fichiers statiques du dashboard depuis dist/dashboard
  await fastify.register(fastifyStatic, {
    root: dashboardPath,
    prefix: '/dashboard/',
    decorateReply: false
  });

  // Route racine qui redirige vers le dashboard
  fastify.get('/', async (request, reply) => {
    return reply.redirect('/dashboard/index.html');
  });
}

