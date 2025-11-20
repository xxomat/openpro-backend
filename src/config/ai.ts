/**
 * Configuration du SDK AI
 * 
 * Ce fichier configure le SDK AI pour utiliser différents providers
 * (OpenAI, Anthropic) avec support optionnel de Cloudflare AI Gateway.
 */

import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { config } from './env.js';

/**
 * Obtient le modèle AI configuré selon le provider sélectionné
 * 
 * @returns Instance du modèle AI configuré
 * @throws {Error} Si le provider n'est pas reconnu
 */
export function getAIModel() {
  const provider = config.AI_PROVIDER;
  
  if (provider === 'openai') {
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    }
    
    // Note: apiKey et baseURL doivent être configurés via les variables d'environnement
    // OPENAI_API_KEY pour la clé API
    // OPENAI_BASE_URL pour Cloudflare AI Gateway
    return openai('gpt-4-turbo-preview');
  }
  
  if (provider === 'anthropic') {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
    }
    
    // Note: apiKey et baseURL doivent être configurés via les variables d'environnement
    // ANTHROPIC_API_KEY pour la clé API
    // ANTHROPIC_BASE_URL pour Cloudflare AI Gateway
    return anthropic('claude-3-5-sonnet-20241022');
  }
  
  throw new Error(`Unknown AI provider: ${provider}. Supported: openai, anthropic`);
}

