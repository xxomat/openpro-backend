/**
 * Configuration des variables d'environnement
 * 
 * Ce fichier charge et valide les variables d'environnement nécessaires
 * au fonctionnement du backend.
 */

import { config as loadEnv } from 'dotenv';

loadEnv();

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  OPENPRO_BASE_URL: process.env.OPENPRO_BASE_URL || '',
  OPENPRO_API_KEY: process.env.OPENPRO_API_KEY || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:4321',
  AI_PROVIDER: process.env.AI_PROVIDER || 'openai',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  CLOUDFLARE_AI_GATEWAY_URL: process.env.CLOUDFLARE_AI_GATEWAY_URL || ''
};

// Validation des variables requises
if (!config.OPENPRO_API_KEY) {
  throw new Error('OPENPRO_API_KEY is required in .env');
}
if (!config.OPENPRO_BASE_URL) {
  throw new Error('OPENPRO_BASE_URL is required in .env');
}

