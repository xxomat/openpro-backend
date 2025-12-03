/**
 * Helper pour les tests d'intégration de la synchronisation au démarrage
 */

import { createD1TestDatabase } from '../../../ical/__tests__/d1TestHelper.js';
import type { Env } from '../../../../index.js';

const STUB_SERVER_URL = process.env.OPENPRO_BASE_URL || 'http://localhost:3000';

/**
 * Vérifie que le serveur stub est accessible
 */
export async function checkStubServer(): Promise<boolean> {
  try {
    const response = await fetch(`${STUB_SERVER_URL}/health`);
    return response.ok;
  } catch {
    // Si pas de endpoint /health, essayer un endpoint connu
    try {
      const response = await fetch(`${STUB_SERVER_URL}/fournisseur/47186/hebergements`);
      return response.ok || response.status === 404; // 404 est OK, ça signifie que le serveur répond
    } catch {
      return false;
    }
  }
}

/**
 * Nettoie et initialise la DB avec des données de test
 */
export async function setupTestDatabase(): Promise<Env> {
  const db = createD1TestDatabase();
  const env: Env = {
    DB: db,
    OPENPRO_API_KEY: 'test-key',
    OPENPRO_BASE_URL: STUB_SERVER_URL,
    FRONTEND_URL: 'http://localhost:4321',
    AI_PROVIDER: 'openai',
    SUPPLIER_ID: '47186', // ID fournisseur par défaut pour les tests
  };

  // Nettoyer les données de test
  await cleanupTestData(env);

  return env;
}

/**
 * Nettoie les données de test
 */
export async function cleanupTestData(env: Env): Promise<void> {
  await env.DB.prepare(`DELETE FROM accommodation_data WHERE id_hebergement LIKE 'test-%'`).run();
  await env.DB.prepare(`DELETE FROM accommodation_rate_type_links WHERE id_hebergement LIKE 'test-%'`).run();
  await env.DB.prepare(`DELETE FROM rate_types WHERE id LIKE 'test-%'`).run();
  await env.DB.prepare(`DELETE FROM accommodations WHERE id LIKE 'test-%'`).run();
  await env.DB.prepare(`DELETE FROM local_bookings WHERE id_hebergement LIKE 'test-%'`).run();
}

/**
 * Crée un hébergement de test
 */
export async function createTestAccommodation(
  env: Env,
  id: string,
  nom: string,
  idOpenPro: number | null
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO accommodations (id, nom, id_openpro, date_creation, date_modification)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).bind(id, nom, idOpenPro).run();
}

/**
 * Crée un plan tarifaire de test
 */
export async function createTestRateType(
  env: Env,
  id: string,
  libelle: string,
  idTypeTarif: number | null = null
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO rate_types (id, id_type_tarif, libelle, description, ordre, date_creation, date_modification)
    VALUES (?, ?, ?, NULL, NULL, datetime('now'), datetime('now'))
  `).bind(id, idTypeTarif, libelle).run();
}

/**
 * Crée un lien hébergement/plan tarifaire de test
 */
export async function createTestRateTypeLink(
  env: Env,
  idHebergement: string,
  idRateType: string,
  idTypeTarif: number | null = null
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO accommodation_rate_type_links (id, id_hebergement, id_rate_type, id_type_tarif, date_creation)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, datetime('now'))
  `).bind(idHebergement, idRateType, idTypeTarif).run();
}

/**
 * Récupère l'ID interne d'un plan tarifaire par son ID OpenPro
 */
export async function getRateTypeIdByOpenProId(
  env: Env,
  idTypeTarif: number
): Promise<string | null> {
  const result = await env.DB.prepare(`
    SELECT id FROM rate_types WHERE id_type_tarif = ?
  `).bind(idTypeTarif).first<{ id: string }>();

  return result?.id || null;
}

/**
 * Vérifie qu'un plan tarifaire a un ID OpenPro
 */
export async function hasOpenProId(
  env: Env,
  rateTypeId: string
): Promise<boolean> {
  const result = await env.DB.prepare(`
    SELECT id_type_tarif FROM rate_types WHERE id = ?
  `).bind(rateTypeId).first<{ id_type_tarif: number | null }>();

  return result?.id_type_tarif !== null;
}

