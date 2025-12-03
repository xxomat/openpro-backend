/**
 * Configuration du fournisseur unique
 * 
 * Le système gère un seul fournisseur, configuré via la variable d'environnement SUPPLIER_ID.
 * Cette valeur est utilisée dans tout le code pour référencer le fournisseur.
 */

import type { Env } from '../index.js';

/**
 * Récupère l'ID du fournisseur depuis les variables d'environnement
 * 
 * @param env - Variables d'environnement Workers
 * @returns ID du fournisseur (number)
 * @throws Error si SUPPLIER_ID n'est pas défini ou invalide
 */
export function getSupplierId(env: Env): number {
  const supplierId = env.SUPPLIER_ID;
  
  if (!supplierId) {
    throw new Error('SUPPLIER_ID environment variable is not defined');
  }
  
  const supplierIdNum = parseInt(supplierId, 10);
  
  if (isNaN(supplierIdNum)) {
    throw new Error(`Invalid SUPPLIER_ID: "${supplierId}" is not a valid number`);
  }
  
  return supplierIdNum;
}

