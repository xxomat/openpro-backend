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
    
    return openai('gpt-4-turbo-preview', {
      apiKey: config.OPENAI_API_KEY,
      baseURL: config.CLOUDFLARE_AI_GATEWAY_URL 
        ? `${config.CLOUDFLARE_AI_GATEWAY_URL}/openai`
        : undefined,
    });
  }
  
  if (provider === 'anthropic') {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
    }
    
    return anthropic('claude-3-5-sonnet-20241022', {
      apiKey: config.ANTHROPIC_API_KEY,
      baseURL: config.CLOUDFLARE_AI_GATEWAY_URL 
        ? `${config.CLOUDFLARE_AI_GATEWAY_URL}/anthropic`
        : undefined,
    });
  }
  
  throw new Error(`Unknown AI provider: ${provider}. Supported: openai, anthropic`);
}

