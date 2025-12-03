/**
 * Tests d'intégration pour le workflow DB-first des plans tarifaires
 * 
 * Ces tests vérifient le scénario complet :
 * 1. Création d'un plan tarifaire en DB sans ID OpenPro
 * 2. Mise à jour avec l'ID OpenPro après création dans OpenPro
 * 3. Liaison avec un hébergement
 * 4. Création de données tarifaires
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createD1TestDatabase } from '../../ical/__tests__/d1TestHelper.js';
import type { Env } from '../../../index.js';
import {
  saveRateType,
  updateRateTypeOpenProId,
  linkRateTypeToAccommodation,
  loadAccommodationRateTypeLinks,
  loadRateTypesForAccommodation,
  findRateTypeIdByOpenProId
} from '../rateTypeDbService.js';
import { saveAccommodationData, loadAccommodationData } from '../accommodationDataService.js';

describe('RateTypeDbService - Integration Tests (DB-first workflow)', () => {
  let env: Env;
  let db: ReturnType<typeof createD1TestDatabase>;

  beforeEach(async () => {
    try {
      db = createD1TestDatabase();
      env = {
        DB: db,
        OPENPRO_API_KEY: 'test-key',
        OPENPRO_BASE_URL: 'http://localhost:3000',
        FRONTEND_URL: 'http://localhost:4321',
        AI_PROVIDER: 'openai',
      };
      
      // Nettoyer les données de test précédentes
      await env.DB.prepare(`DELETE FROM accommodation_data WHERE id_hebergement LIKE 'acc-test-%'`).run();
      await env.DB.prepare(`DELETE FROM accommodation_rate_type_links WHERE id_hebergement LIKE 'acc-test-%'`).run();
      await env.DB.prepare(`DELETE FROM rate_types WHERE id_type_tarif >= 10 AND id_type_tarif < 100`).run();
      await env.DB.prepare(`DELETE FROM accommodations WHERE id LIKE 'acc-test-%'`).run();
      
      // Créer un hébergement de test
      await env.DB.prepare(`
        INSERT OR REPLACE INTO accommodations (id, nom, id_openpro, date_creation, date_modification)
        VALUES ('acc-test-123', 'Test Accommodation', 100, datetime('now'), datetime('now'))
      `).run();
    } catch (error: any) {
      // Si la base D1 locale n'existe pas, skip les tests
      if (error.message?.includes('D1 database file not found')) {
        console.warn('Skipping integration tests: D1 database not found. Run "npm run d1:migrate:local" first.');
        // Créer un mock env pour éviter les erreurs dans les tests
        env = {
          DB: {} as D1Database,
          OPENPRO_API_KEY: 'test-key',
          OPENPRO_BASE_URL: 'http://localhost:3000',
          FRONTEND_URL: 'http://localhost:4321',
          AI_PROVIDER: 'openai',
        };
        return;
      }
      throw error;
    }
  });

  it('should create rate type without OpenPro ID, then update with OpenPro ID', async () => {
    if (!env?.DB) return;
    
    // 1. Créer un plan tarifaire sans ID OpenPro (DB-first)
    const idInterne = await saveRateType({
      // idTypeTarif non fourni
      libelle: JSON.stringify({ fr: 'Plan Test' }),
      description: JSON.stringify({ fr: 'Description test' }),
      ordre: 1
    }, env);

    expect(typeof idInterne).toBe('string');

    // Vérifier que le plan tarifaire existe avec id_type_tarif = NULL
    const rateType = await env.DB.prepare(`
      SELECT * FROM rate_types WHERE id = ?
    `).bind(idInterne).first<{
      id: string;
      id_type_tarif: number | null;
      libelle: string | null;
    }>();

    expect(rateType).toBeDefined();
    expect(rateType?.id_type_tarif).toBeNull();

    // 2. Mettre à jour avec l'ID OpenPro après création dans OpenPro
    await updateRateTypeOpenProId(idInterne, 42, env);

    // Vérifier que id_type_tarif a été mis à jour
    const updatedRateType = await env.DB.prepare(`
      SELECT * FROM rate_types WHERE id = ?
    `).bind(idInterne).first<{
      id_type_tarif: number | null;
    }>();

    expect(updatedRateType?.id_type_tarif).toBe(42);
  });

  it('should link rate type to accommodation using id_rate_type', async () => {
    if (!env?.DB) return;
    
    // 1. Créer un plan tarifaire avec ID OpenPro
    const idInterne = await saveRateType({
      idTypeTarif: 10,
      libelle: JSON.stringify({ fr: 'Plan Test' }),
      ordre: 1
    }, env);

    // 2. Lier à un hébergement
    await linkRateTypeToAccommodation('acc-test-123', 10, env);

    // 3. Vérifier que la liaison existe avec id_rate_type
    const link = await env.DB.prepare(`
      SELECT * FROM accommodation_rate_type_links 
      WHERE id_hebergement = ? AND id_rate_type = ?
    `).bind('acc-test-123', idInterne).first();

    expect(link).toBeDefined();
    expect((link as any)?.id_rate_type).toBe(idInterne);
    expect((link as any)?.id_type_tarif).toBe(10);
  });

  it('should not allow linking rate type without OpenPro ID', async () => {
    if (!env?.DB) return;
    
    // 1. Créer un plan tarifaire SANS ID OpenPro
    await saveRateType({
      // idTypeTarif non fourni
      libelle: JSON.stringify({ fr: 'Plan Test' }),
      ordre: 1
    }, env);

    // 2. Essayer de lier (devrait échouer car findRateTypeIdByOpenProId retourne null)
    await expect(
      linkRateTypeToAccommodation('acc-test-123', 999, env)
    ).rejects.toThrow('Rate type with OpenPro ID 999 not found');
  });

  it('should save and load accommodation data using id_rate_type', async () => {
    if (!env?.DB) return;
    
    // 1. Créer un plan tarifaire avec ID OpenPro
    await saveRateType({
      idTypeTarif: 20,
      libelle: JSON.stringify({ fr: 'Plan Test' }),
      ordre: 1
    }, env);

    // 2. Lier à un hébergement
    await linkRateTypeToAccommodation('acc-test-123', 20, env);

    // 3. Sauvegarder des données tarifaires
    await saveAccommodationData('acc-test-123', 20, '2025-06-01', {
      prixNuitee: 100,
      arriveeAutorisee: true,
      departAutorise: true,
      dureeMinimale: 2
    }, env);

    // 4. Charger les données
    const data = await loadAccommodationData('acc-test-123', '2025-06-01', '2025-06-01', env);

    expect(data['2025-06-01']).toBeDefined();
    expect(data['2025-06-01'][20]).toBeDefined();
    expect(data['2025-06-01'][20].prix_nuitee).toBe(100);
  });

  it('should load accommodation rate type links correctly', async () => {
    if (!env?.DB) return;
    
    // 1. Créer plusieurs plans tarifaires
    await saveRateType({
      idTypeTarif: 30,
      libelle: JSON.stringify({ fr: 'Plan 1' }),
      ordre: 1
    }, env);

    await saveRateType({
      idTypeTarif: 31,
      libelle: JSON.stringify({ fr: 'Plan 2' }),
      ordre: 2
    }, env);

    // 2. Lier les deux plans à l'hébergement
    await linkRateTypeToAccommodation('acc-test-123', 30, env);
    await linkRateTypeToAccommodation('acc-test-123', 31, env);

    // 3. Charger les liaisons
    const links = await loadAccommodationRateTypeLinks('acc-test-123', env);

    expect(links).toContain(30);
    expect(links).toContain(31);
    expect(links.length).toBe(2);
  });

  it('should load rate types for accommodation using JOIN', async () => {
    if (!env?.DB) return;
    
    // 1. Créer un plan tarifaire
    await saveRateType({
      idTypeTarif: 40,
      libelle: JSON.stringify({ fr: 'Plan Test' }),
      ordre: 1
    }, env);

    // 2. Lier à l'hébergement
    await linkRateTypeToAccommodation('acc-test-123', 40, env);

    // 3. Charger les plans tarifaires pour l'hébergement
    const rateTypes = await loadRateTypesForAccommodation('acc-test-123', env);

    expect(rateTypes.length).toBe(1);
    expect(rateTypes[0].rateTypeId).toBe(40);
  });

  it('should find rate type ID by OpenPro ID', async () => {
    if (!env?.DB) return;
    
    // 1. Créer un plan tarifaire avec ID OpenPro
    const idInterne = await saveRateType({
      idTypeTarif: 50,
      libelle: JSON.stringify({ fr: 'Plan Test' }),
      ordre: 1
    }, env);

    // 2. Trouver l'ID interne depuis l'ID OpenPro
    const foundId = await findRateTypeIdByOpenProId(50, env);

    expect(foundId).toBe(idInterne);
  });
});

