/**
 * Tests pour le service de gestion des données d'hébergement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '../../../index.js';
import { saveAccommodationStock, saveAccommodationData, loadAccommodationData } from '../accommodationDataService.js';
import { findRateTypeIdByOpenProId } from '../rateTypeDbService.js';

// Mock du module rateTypeDbService
vi.mock('../rateTypeDbService.js', async () => {
  const actual = await vi.importActual('../rateTypeDbService.js');
  return {
    ...actual,
    findRateTypeIdByOpenProId: vi.fn()
  };
});

describe('AccommodationDataService - DB Save', () => {
  let env: Env;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockDb = {
      prepare: vi.fn(),
    };
    env = {
      DB: mockDb as D1Database,
      OPENPRO_API_KEY: 'test-key',
      OPENPRO_BASE_URL: 'http://localhost:3000',
      FRONTEND_URL: 'http://localhost:4321',
      AI_PROVIDER: 'openai',
    };
  });

  describe('saveAccommodationStock', () => {
    it('should save stock to DB for new date', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue(null); // Pas de stock existant
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      await saveAccommodationStock('acc-123', '2025-06-01', 3, env);

      // Vérifier qu'une INSERT a été préparée
      const insertCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('INSERT INTO accommodation_stock')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(mockRun).toHaveBeenCalled();
    });

    it('should update stock in DB for existing date', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue({ id: 'existing-id' }); // Stock existant
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      await saveAccommodationStock('acc-123', '2025-06-01', 5, env);

      // Vérifier qu'une UPDATE a été préparée
      const updateCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('UPDATE accommodation_stock')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('saveAccommodationData', () => {
    it('should find rate type ID and save data using id_rate_type', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn()
        .mockResolvedValueOnce(null); // Pas de données existantes
      
      vi.mocked(findRateTypeIdByOpenProId).mockResolvedValue('rate-type-uuid-123');
      
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      await saveAccommodationData('acc-123', 3, '2025-06-01', {
        prixNuitee: 100,
        arriveeAutorisee: true,
        departAutorise: true,
        dureeMinimale: 2
      }, env);

      // Vérifier que findRateTypeIdByOpenProId a été appelé
      expect(findRateTypeIdByOpenProId).toHaveBeenCalledWith(3, env);

      // Vérifier que l'INSERT utilise id_rate_type
      const insertCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('INSERT INTO accommodation_data')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
      const insertCall = insertCalls[0];
      expect(insertCall[0]).toContain('id_rate_type');
    });

    it('should throw error when rate type does not exist', async () => {
      vi.mocked(findRateTypeIdByOpenProId).mockResolvedValue(null);

      await expect(
        saveAccommodationData('acc-123', 999, '2025-06-01', {
          prixNuitee: 100
        }, env)
      ).rejects.toThrow('Rate type with OpenPro ID 999 not found');
    });

    it('should update existing data using id_rate_type', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue({ id: 'existing-id' }); // Données existantes
      
      vi.mocked(findRateTypeIdByOpenProId).mockResolvedValue('rate-type-uuid-123');
      
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      await saveAccommodationData('acc-123', 3, '2025-06-01', {
        prixNuitee: 120, // Prix modifié
        arriveeAutorisee: false
      }, env);

      const updateCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('UPDATE accommodation_data')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
      const updateCall = updateCalls[0];
      expect(updateCall[0]).toContain('id_rate_type');
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('loadAccommodationData', () => {
    it('should load data with JOIN to rate_types', async () => {
      const mockAll = vi.fn().mockResolvedValue({
        results: [
          {
            id: 'data-1',
            id_hebergement: 'acc-123',
            id_rate_type: 'rate-uuid-1',
            id_type_tarif: 1,
            date: '2025-06-01',
            prix_nuitee: 100,
            arrivee_autorisee: 1,
            depart_autorise: 1,
            duree_minimale: 2,
            duree_maximale: null,
            date_creation: '2025-01-01',
            date_modification: '2025-01-01'
          }
        ]
      });
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: mockAll
        })
      });

      const result = await loadAccommodationData('acc-123', '2025-06-01', '2025-06-30', env);

      expect(result['2025-06-01'][1]).toBeDefined();
      
      // Vérifier que la requête fait un JOIN
      const queryCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('FROM accommodation_data ad')
      );
      expect(queryCalls.length).toBeGreaterThan(0);
      expect(queryCalls[0][0]).toContain('INNER JOIN rate_types rt');
      expect(queryCalls[0][0]).toContain('rt.id = ad.id_rate_type');
    });

    it('should filter out rate types without OpenPro ID', async () => {
      const mockAll = vi.fn().mockResolvedValue({
        results: [
          {
            id: 'data-1',
            id_hebergement: 'acc-123',
            id_rate_type: 'rate-uuid-1',
            id_type_tarif: 1,
            date: '2025-06-01',
            prix_nuitee: 100,
            arrivee_autorisee: null,
            depart_autorise: null,
            duree_minimale: null,
            duree_maximale: null,
            date_creation: '2025-01-01',
            date_modification: '2025-01-01'
          },
          {
            id: 'data-2',
            id_hebergement: 'acc-123',
            id_rate_type: 'rate-uuid-2',
            id_type_tarif: null, // Rate type sans ID OpenPro
            date: '2025-06-02',
            prix_nuitee: 120,
            arrivee_autorisee: null,
            depart_autorise: null,
            duree_minimale: null,
            duree_maximale: null,
            date_creation: '2025-01-01',
            date_modification: '2025-01-01'
          }
        ]
      });
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: mockAll
        })
      });

      const result = await loadAccommodationData('acc-123', '2025-06-01', '2025-06-30', env);

      expect(result['2025-06-01'][1]).toBeDefined();
      expect(result['2025-06-02']).toBeUndefined(); // Filtré car id_type_tarif est null
    });
  });
});

