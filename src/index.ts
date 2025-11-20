/**
 * Point d'entrée du serveur backend
 * 
 * Ce fichier initialise et démarre le serveur Fastify avec toutes les routes
 * et middlewares nécessaires.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config/env.js';
import { registerRoutes } from './routes/index.js';
import { runWithTrace, getTraceId } from './services/correlationContext.js';
import { trafficMonitor } from './services/trafficMonitor.js';

const fastify = Fastify({
  logger: true
});

// Configuration CORS pour permettre les requêtes depuis le frontend
await fastify.register(cors, {
  origin: config.FRONTEND_URL || 'http://localhost:4321'
});

// Hooks pour le monitoring du trafic
fastify.addHook('onRequest', async (request, reply) => {
  // Créer un contexte de corrélation pour cette requête
  const startTime = Date.now();
  (request as any).startTime = startTime;
  
  // Générer un traceId et le stocker sur la requête
  // Note: AsyncLocalStorage a des limitations avec Fastify, donc on stocke aussi sur request
  runWithTrace(() => {
    const traceId = getTraceId()!;
    (request as any).traceId = traceId;
  });
});

fastify.addHook('onResponse', async (request, reply) => {
  const startTime = (request as any).startTime;
  const traceId = (request as any).traceId;
  
  if (!startTime || !traceId) {
    return; // Skip si pas de données de timing
  }
  
  const duration = Date.now() - startTime;
  const statusCode = reply.statusCode;
  
  // Ne pas logger les appels au dashboard/monitoring pour éviter la récursion
  if (!request.url.startsWith('/api/traffic') && !request.url.startsWith('/dashboard') && request.url !== '/') {
    trafficMonitor.logIncoming(
      traceId,
      request.method,
      request.url,
      statusCode,
      duration,
      {
        userAgent: request.headers['user-agent'],
        origin: request.headers.origin
      }
    );
  }
});

// Enregistrement de toutes les routes
await fastify.register(registerRoutes);

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Démarrage du serveur
try {
  await fastify.listen({ 
    port: config.PORT,
    host: '0.0.0.0'
  });
  console.log(`🚀 Backend running on http://localhost:${config.PORT}`);
  console.log(`🤖 AI Provider: ${config.AI_PROVIDER || 'openai'}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

