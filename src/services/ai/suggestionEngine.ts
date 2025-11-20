/**
 * Moteur de suggestions IA
 * 
 * Ce fichier contient le moteur principal de génération de suggestions
 * utilisant le Vercel AI SDK pour analyser les réservations et proposer
 * des ajustements de tarifs et durées minimales.
 */

import { generateObject as aiGenerateObject } from 'ai';
import { z } from 'zod';
import { getAIModel } from '../../config/ai.js';
import type { SuggestionRequest, PricingSuggestion } from '../../types/suggestions.js';
import { generateAnalysisPrompt } from './analysisPrompts.js';
import { getTraceId } from '../correlationContext.js';
import { trafficMonitor } from '../trafficMonitor.js';
import { randomUUID } from 'crypto';
import { config } from '../../config/env.js';

/**
 * Type pour une suggestion individuelle depuis l'IA
 */
interface AISuggestionItem {
  type: 'rate_increase' | 'rate_decrease' | 'min_stay_increase' | 'min_stay_decrease';
  idTypeTarif?: number;
  dateDebut: string;
  dateFin: string;
  currentValue: number;
  suggestedValue: number;
  confidence: number;
  reasoning: string;
}

/**
 * Schéma Zod pour une suggestion individuelle
 */
const suggestionItemSchema = z.object({
  type: z.enum(['rate_increase', 'rate_decrease', 'min_stay_increase', 'min_stay_decrease']),
  idTypeTarif: z.number().optional(),
  dateDebut: z.string(),
  dateFin: z.string(),
  currentValue: z.number(),
  suggestedValue: z.number(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
}) as z.ZodType<AISuggestionItem>;

/**
 * Schéma Zod pour valider la réponse de l'IA
 */
const suggestionSchema = z.object({
  suggestions: z.array(suggestionItemSchema)
});

/**
 * Génère des suggestions de tarifs et durées minimales basées sur l'analyse IA
 * 
 * Cette fonction utilise le SDK AI pour analyser les réservations récentes,
 * les tarifs actuels et le stock disponible, puis génère des suggestions
 * d'ajustements avec un niveau de confiance et une explication.
 * 
 * @param request - Données de la requête d'analyse (réservations, tarifs, stock)
 * @returns Liste des suggestions générées
 * @throws {Error} Peut lever une erreur si la génération échoue
 */
export async function generatePricingSuggestions(
  request: SuggestionRequest
): Promise<PricingSuggestion[]> {
  const model = getAIModel();
  const prompt = generateAnalysisPrompt(request);
  const traceId = getTraceId() || randomUUID();
  const startTime = Date.now();
  
  // Déterminer le provider et le model name
  const provider = config.AI_PROVIDER || 'openai';
  const modelName = typeof model === 'string' ? model : 'unknown';
  
  try {
    // Utiliser any pour contourner le problème d'inférence de types complexes du SDK AI
    // @ts-ignore - Type instantiation depth issue avec generateObject
    const result = await aiGenerateObject({
      model,
      schema: suggestionSchema,
      prompt,
      temperature: 0.7,
    });

    const duration = Date.now() - startTime;

    // Extraire les tokens si disponibles
    const usage = (result as any).usage;
    const tokensUsed = usage ? {
      prompt: usage.promptTokens,
      completion: usage.completionTokens,
      total: usage.totalTokens
    } : undefined;

    // Enregistrer l'appel IA réussi
    trafficMonitor.logAI(
      traceId,
      provider,
      modelName,
      duration,
      200,
      undefined,
      tokensUsed
    );

    // Extraire les suggestions depuis l'objet retourné et valider le type
    const aiResponse = result.object as { suggestions: AISuggestionItem[] };

    // Transformer en PricingSuggestion avec IDs
    return aiResponse.suggestions.map((s, index) => ({
      id: `suggestion-${Date.now()}-${index}`,
      type: s.type,
      idFournisseur: request.idFournisseur,
      idHebergement: request.idHebergement,
      idTypeTarif: s.idTypeTarif,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin,
      currentValue: s.currentValue,
      suggestedValue: s.suggestedValue,
      confidence: s.confidence,
      reasoning: s.reasoning,
      createdAt: new Date(),
      status: 'pending' as const,
    }));
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Enregistrer l'appel IA échoué
    trafficMonitor.logAI(
      traceId,
      provider,
      modelName,
      duration,
      500,
      errorMessage
    );

    throw error;
  }
}

