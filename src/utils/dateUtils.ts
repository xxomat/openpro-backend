/**
 * Utilitaires de manipulation de dates
 * 
 * Ce fichier contient les fonctions utilitaires pour manipuler les dates,
 * incluant le formatage au format YYYY-MM-DD.
 */

/**
 * Formate une date au format YYYY-MM-DD
 * 
 * @param date - Date à formater
 * @returns Date formatée au format YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

