/**
 * Prompts pour l'analyse IA des réservations
 * 
 * Ce fichier contient les prompts utilisés par le moteur de suggestions
 * pour analyser les réservations et générer des suggestions de tarifs.
 */

import type { SuggestionRequest } from '../../types/suggestions.js';

/**
 * Génère le prompt pour l'analyse des réservations et génération de suggestions
 * 
 * @param request - Données de la requête d'analyse
 * @returns Prompt formaté pour l'IA
 */
export function generateAnalysisPrompt(request: SuggestionRequest): string {
  return `Tu es un expert en revenue management pour des hébergements touristiques.

Analyse les données suivantes et suggère des ajustements de tarifs et/ou de durées minimales de séjour :

**Hébergement:** Fournisseur ${request.idFournisseur}, Hébergement ${request.idHebergement}

**Réservations récentes (${request.recentBookings.length}):**
${request.recentBookings.map(b => 
  `- Dossier ${b.idDossier}: ${b.dateArrivee} → ${b.dateDepart}, montant: ${b.montant}€`
).join('\n')}

**Tarifs actuels (échantillon):**
${Object.entries(request.currentRates).slice(0, 10).map(([date, price]) => 
  `- ${date}: ${price}€`
).join('\n')}

**Stock disponible (échantillon):**
${Object.entries(request.currentStock).slice(0, 10).map(([date, stock]) => 
  `- ${date}: ${stock} unités`
).join('\n')}

Règles d'analyse :
1. Si forte demande (beaucoup de réservations) + stock faible → suggérer augmentation tarif
2. Si faible demande + stock élevé → suggérer baisse tarif ou réduction durée minimale
3. Si réservations à l'avance → possibilité d'augmenter durée minimale en haute saison
4. Prendre en compte la saisonnalité

Pour chaque suggestion, fournis :
- Le type d'ajustement
- La période concernée (dateDebut, dateFin)
- La valeur actuelle et suggérée
- Un niveau de confiance (0-1)
- Une explication détaillée

Retourne entre 0 et 5 suggestions les plus pertinentes.`;
}

