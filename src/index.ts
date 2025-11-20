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

const fastify = Fastify({
  logger: true
});

// Configuration CORS pour permettre les requêtes depuis le frontend
await fastify.register(cors, {
  origin: config.FRONTEND_URL || 'http://localhost:4321'
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

