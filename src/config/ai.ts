/**
 * Configuration du SDK AI
 * 
 * Ce fichier configure le SDK AI pour utiliser différents providers
 * (OpenAI, Anthropic) avec support optionnel de Cloudflare AI Gateway.
 */

import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import type { Env } from '../index.js';

/**
 * Obtient le modèle AI configuré selon le provider sélectionné
 * 
 * @param env - Variables d'environnement Workers
 * @returns Instance du modèle AI configuré
 * @throws {Error} Si le provider n'est pas reconnu
 */
export function getAIModel(env: Env) {
  const provider = env.AI_PROVIDER;
  
  if (provider === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    }
    
    // Configurer avec la clé API et l'URL de base (AI Gateway si configuré)
    return openai('gpt-4-turbo-preview', {
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.CLOUDFLARE_AI_GATEWAY_URL || undefined
    });
  }
  
  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
    }
    
    // Configurer avec la clé API et l'URL de base (AI Gateway si configuré)
    return anthropic('claude-3-5-sonnet-20241022', {
      apiKey: env.ANTHROPIC_API_KEY,
      baseURL: env.CLOUDFLARE_AI_GATEWAY_URL || undefined
    });
  }
  
  throw new Error(`Unknown AI provider: ${provider}. Supported: openai, anthropic`);
}

