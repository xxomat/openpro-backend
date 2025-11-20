/**
 * Utilitaires pour l'extraction et le traitement des données de tarifs
 * 
 * Ce fichier contient des fonctions utilitaires pour extraire et normaliser
 * les données de tarifs depuis les réponses API, incluant l'extraction de texte
 * multilingue, de prix et de libellés.
 */

import type { MultilingualText, MultilingualField, ApiTarif, TarifOccupation } from '../../../types/apiTypes.js';

/**
 * Vérifie si une valeur est un objet MultilingualText
 */
function isMultilingualText(value: unknown): value is MultilingualText {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('langue' in value || 'Langue' in value || 'texte' in value || 'Texte' in value)
  );
}

/**
 * Extrait le texte français d'un champ multilingue
 * 
 * Les champs multilingues peuvent être représentés de différentes façons :
 * - Un simple string (déjà en français)
 * - Un array d'objets avec des propriétés langue/texte
 * 
 * @param field - Champ qui peut être un string, un array d'objets avec langue/texte, ou undefined
 * @returns Le texte français trouvé, ou undefined si aucun texte français n'est disponible
 */
export function extractFrenchText(field: MultilingualField): string | undefined {
  if (Array.isArray(field)) {
    const frEntry = field.find((d) => {
      if (!isMultilingualText(d)) return false;
      return (d.langue ?? d.Langue) === 'fr';
    });
    if (frEntry && isMultilingualText(frEntry)) {
      return frEntry.texte ?? frEntry.Texte;
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
 * - Dans listeTarifPaxOccupation pour 2 personnes (priorité)
 * - Dans listeTarifPaxOccupation pour n'importe quelle occupation
 * - Directement dans tarifPax.prix
 * - Directement dans tarif.prix
 * 
 * @param tarif - Objet tarif brut de l'API
 * @returns Le prix extrait, ou undefined si aucun prix n'est trouvé
 */
export function extractPriceFromTarif(tarif: ApiTarif): number | undefined {
  const pax = tarif.tarifPax ?? tarif.prixPax;
  const occs = pax?.listeTarifPaxOccupation ?? tarif.listeTarifPaxOccupation ?? [];
  
  if (Array.isArray(occs)) {
    // Priorité au prix pour 2 personnes
    const two = occs.find((o: TarifOccupation) => Number(o.nbPers) === 2 && o.prix != null);
    const anyOcc = two ?? occs.find((o: TarifOccupation) => o.prix != null);
    if (anyOcc && anyOcc.prix != null) {
      return Number(anyOcc.prix);
    }
  }
  
  if (pax && typeof pax === 'object' && 'prix' in pax && pax.prix != null) {
    return Number(pax.prix);
  }
  
  if (tarif.prix != null) {
    return Number(tarif.prix);
  }
  
  return undefined;
}

/**
 * Extrait le libellé d'un tarif depuis différentes structures de données possibles
 * 
 * Le libellé peut être trouvé dans plusieurs endroits :
 * - Dans typeTarif.libelle (string ou array multilingue)
 * - Directement dans tarif.libelle
 * - Sinon, génère un libellé par défaut basé sur l'ID du type de tarif
 * 
 * @param tarif - Objet tarif brut de l'API
 * @param idType - Identifiant du type de tarif (utilisé comme fallback)
 * @returns Le libellé extrait, ou un libellé par défaut basé sur l'ID, ou undefined
 */
export function extractRateLabel(tarif: ApiTarif, idType: number | undefined): string | undefined {
  const labelCandidate: MultilingualField = tarif?.typeTarif?.libelle ?? tarif?.libelle ?? tarif?.Libelle;
  
  if (typeof labelCandidate === 'string') {
    return labelCandidate;
  } else if (Array.isArray(labelCandidate)) {
    const frEntry = labelCandidate.find((l) => {
      if (!isMultilingualText(l)) return false;
      return (l.langue ?? l.Langue) === 'fr';
    });
    if (frEntry && isMultilingualText(frEntry)) {
      const fr = frEntry.texte ?? frEntry.Texte;
      if (fr) return String(fr);
    }
    // Fallback sur le premier élément si pas de français
    const first = labelCandidate[0];
    if (first && isMultilingualText(first)) {
      const anyText = first.texte ?? first.Texte;
      if (anyText) return String(anyText);
    }
  }
  
  if (idType) {
    return `Type ${idType}`;
  }
  
  return undefined;
}

