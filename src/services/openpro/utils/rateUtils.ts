/**
 * Utilitaires pour l'extraction et le traitement des données de tarifs
 * 
 * Ce fichier contient des fonctions utilitaires pour extraire et normaliser
 * les données de tarifs depuis les réponses API, incluant l'extraction de texte
 * multilingue, de prix et de libellés.
 * 
 * IMPORTANT : Ces fonctions travaillent avec les interfaces transformées (préfixe "I")
 * qui utilisent les noms camelCase.
 */

import type { IMultilingualText, IMultilingualField, IApiTarif, ITarifOccupation } from '../../../types/apiTypes.js';

/**
 * Vérifie si une valeur est un objet IMultilingualText
 */
function isMultilingualText(value: unknown): value is IMultilingualText {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('language' in value || 'text' in value)
  );
}

/**
 * Extrait le texte français d'un champ multilingue
 * 
 * Les champs multilingues peuvent être représentés de différentes façons :
 * - Un simple string (déjà en français)
 * - Un array d'objets avec des propriétés language/text (normalisées)
 * 
 * @param field - Champ qui peut être un string, un array d'objets IMultilingualText, ou undefined
 * @returns Le texte français trouvé, ou undefined si aucun texte français n'est disponible
 */
export function extractFrenchText(field: IMultilingualField): string | undefined {
  if (Array.isArray(field)) {
    const frEntry = field.find((d) => {
      if (!isMultilingualText(d)) return false;
      return d.language === 'fr';
    });
    if (frEntry && isMultilingualText(frEntry)) {
      return frEntry.text;
    }
  } else if (typeof field === 'string') {
    return field;
  }
  return undefined;
}

/**
 * Extrait le prix d'un tarif depuis différentes structures de données possibles
 * 
 * Le prix peut être trouvé dans plusieurs endroits selon la structure de la réponse API :
 * - Dans occupationList pour 2 personnes (priorité)
 * - Dans occupationList pour n'importe quelle occupation
 * - Directement dans ratePax.price
 * - Directement dans tarif.price
 * 
 * @param tarif - Objet tarif avec interface transformée (IApiTarif)
 * @returns Le prix extrait, ou undefined si aucun prix n'est trouvé
 */
export function extractPriceFromTarif(tarif: IApiTarif): number | undefined {
  const pax = tarif.ratePax ?? tarif.pricePax;
  const occs = pax?.occupationList ?? tarif.occupationList ?? [];
  
  if (Array.isArray(occs)) {
    // Priorité au prix pour 2 personnes
    const two = occs.find((o: ITarifOccupation) => Number(o.numberOfPersons) === 2 && o.price != null);
    const anyOcc = two ?? occs.find((o: ITarifOccupation) => o.price != null);
    if (anyOcc && anyOcc.price != null) {
      return Number(anyOcc.price);
    }
  }
  
  if (pax && typeof pax === 'object' && 'price' in pax && pax.price != null) {
    return Number(pax.price);
  }
  
  if (tarif.price != null) {
    return Number(tarif.price);
  }
  
  return undefined;
}

/**
 * Extrait le libellé d'un tarif depuis différentes structures de données possibles
 * 
 * Le libellé peut être trouvé dans plusieurs endroits :
 * - Dans rateType.label (string ou array multilingue)
 * - Directement dans tarif.label
 * - Sinon, génère un libellé par défaut basé sur l'ID du type de tarif
 * 
 * @param tarif - Objet tarif avec interface transformée (IApiTarif)
 * @param rateTypeId - Identifiant du type de tarif (utilisé comme fallback)
 * @returns Le libellé extrait, ou un libellé par défaut basé sur l'ID, ou undefined
 */
export function extractRateLabel(tarif: IApiTarif, rateTypeId: number | undefined): string | undefined {
  const labelCandidate: IMultilingualField = tarif?.rateType?.label ?? tarif?.label;
  
  if (typeof labelCandidate === 'string') {
    return labelCandidate;
  } else if (Array.isArray(labelCandidate)) {
    const frEntry = labelCandidate.find((l) => {
      if (!isMultilingualText(l)) return false;
      return l.language === 'fr';
    });
    if (frEntry && isMultilingualText(frEntry)) {
      const fr = frEntry.text;
      if (fr) return String(fr);
    }
    // Fallback sur le premier élément si pas de français
    const first = labelCandidate[0];
    if (first && isMultilingualText(first)) {
      const anyText = first.text;
      if (anyText) return String(anyText);
    }
  }
  
  if (rateTypeId) {
    return `Type ${rateTypeId}`;
  }
  
  return undefined;
}
