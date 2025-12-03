/**
 * Tests pour le service de gestion des plans tarifaires en DB
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '../../../index.js';
import { 
  saveRateType, 
  updateRateTypeOpenProId, 
  linkRateTypeToAccommodation, 
  unlinkRateTypeFromAccommodation,
  findRateTypeIdByOpenProId,
  deleteRateType,
  loadAccommodationRateTypeLinks,
  loadRateTypesForAccommodation
} from '../rateTypeDbService.js';

describe('RateTypeDbService', () => {
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

  describe('saveRateType', () => {
    it('should create new rate type if not exists', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue(null); // N'existe pas
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      const idInterne = await saveRateType({
        idTypeTarif: 3,
        libelle: JSON.stringify({ fr: 'Test' }),
        ordre: 1
      }, env);

      const insertCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('INSERT INTO rate_types')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(typeof idInterne).toBe('string');
    });

    it('should create new rate type without idTypeTarif (DB-first)', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockBind = vi.fn().mockReturnValue({
        run: mockRun
      });
      mockDb.prepare.mockReturnValue({
        bind: mockBind
      });

      const idInterne = await saveRateType({
        // idTypeTarif non fourni
        libelle: JSON.stringify({ fr: 'Test' }),
        ordre: 1
      }, env);

      const insertCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('INSERT INTO rate_types')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(typeof idInterne).toBe('string');
      
      // Vérifier que id_type_tarif est NULL dans l'INSERT
      const insertCallIndex = mockDb.prepare.mock.calls.findIndex(call => 
        call[0].includes('INSERT INTO rate_types')
      );
      if (insertCallIndex >= 0) {
        const bindCall = mockBind.mock.calls.find(call => call.length > 0);
        if (bindCall && bindCall[1] !== undefined) {
          expect(bindCall[1]).toBeNull(); // id_type_tarif devrait être null
        }
      }
    });

    it('should update existing rate type', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue({ id: 'existing-id' }); // Existe
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      const idInterne = await saveRateType({
        idTypeTarif: 3,
        libelle: JSON.stringify({ fr: 'Updated' }),
        ordre: 2
      }, env);

      const updateCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('UPDATE rate_types')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
      expect(idInterne).toBe('existing-id');
    });
  });

  describe('updateRateTypeOpenProId', () => {
    it('should update id_type_tarif for rate type without OpenPro ID', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: mockRun
        })
      });

      await updateRateTypeOpenProId('internal-id-123', 42, env);

      const updateCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('UPDATE rate_types') && call[0].includes('id_type_tarif')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
      expect(mockRun).toHaveBeenCalled();
      
      // Vérifier que la condition WHERE inclut id_type_tarif IS NULL
      const updateCall = updateCalls[0];
      expect(updateCall[0]).toContain('id_type_tarif IS NULL');
    });
  });

  describe('findRateTypeIdByOpenProId', () => {
    it('should return internal ID when rate type exists', async () => {
      const mockFirst = vi.fn().mockResolvedValue({ id: 'internal-uuid-123' });
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst
        })
      });

      const result = await findRateTypeIdByOpenProId(42, env);

      expect(result).toBe('internal-uuid-123');
      expect(mockFirst).toHaveBeenCalled();
    });

    it('should return null when rate type does not exist', async () => {
      const mockFirst = vi.fn().mockResolvedValue(null);
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst
        })
      });

      const result = await findRateTypeIdByOpenProId(999, env);

      expect(result).toBeNull();
    });
  });

  describe('linkRateTypeToAccommodation', () => {
    it('should create link using id_rate_type when rate type exists', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn()
        .mockResolvedValueOnce({ id: 'rate-type-uuid' }) // findRateTypeIdByOpenProId
        .mockResolvedValueOnce(null); // Lien n'existe pas
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      await linkRateTypeToAccommodation('acc-123', 3, env);

      // Vérifier que findRateTypeIdByOpenProId a été appelé
      const findCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('SELECT id FROM rate_types') && call[0].includes('id_type_tarif')
      );
      expect(findCalls.length).toBeGreaterThan(0);

      // Vérifier que l'INSERT utilise id_rate_type
      const insertCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('INSERT INTO accommodation_rate_type_links')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
      const insertCall = insertCalls[0];
      expect(insertCall[0]).toContain('id_rate_type');
    });

    it('should throw error when rate type does not exist', async () => {
      const mockFirst = vi.fn().mockResolvedValue(null); // Rate type n'existe pas
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst
        })
      });

      await expect(
        linkRateTypeToAccommodation('acc-123', 999, env)
      ).rejects.toThrow('Rate type with OpenPro ID 999 not found');
    });

    it('should not create duplicate link if already exists', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn()
        .mockResolvedValueOnce({ id: 'rate-type-uuid' }) // findRateTypeIdByOpenProId
        .mockResolvedValueOnce({ id: 'existing-link-id' }); // Lien existe
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      await linkRateTypeToAccommodation('acc-123', 3, env);

      // Ne devrait pas créer de nouveau lien
      const insertCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('INSERT INTO accommodation_rate_type_links')
      );
      expect(insertCalls.length).toBe(0);
    });
  });

  describe('unlinkRateTypeFromAccommodation', () => {
    it('should delete link and data using id_rate_type', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue({ id: 'rate-type-uuid' }); // findRateTypeIdByOpenProId
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      await unlinkRateTypeFromAccommodation('acc-123', 3, env);

      // Vérifier que les DELETE utilisent id_rate_type
      const deleteCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('DELETE FROM') && 
        (call[0].includes('accommodation_rate_type_links') || call[0].includes('accommodation_data'))
      );
      expect(deleteCalls.length).toBe(2);
      deleteCalls.forEach(call => {
        expect(call[0]).toContain('id_rate_type');
      });
    });

    it('should throw error when rate type does not exist', async () => {
      const mockFirst = vi.fn().mockResolvedValue(null); // Rate type n'existe pas
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst
        })
      });

      await expect(
        unlinkRateTypeFromAccommodation('acc-123', 999, env)
      ).rejects.toThrow('Rate type with OpenPro ID 999 not found');
    });
  });

  describe('deleteRateType', () => {
    it('should delete rate type and all links using id_rate_type', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue({ id: 'rate-type-uuid' }); // findRateTypeIdByOpenProId
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      const result = await deleteRateType(3, env);

      expect(result).toBe(true);
      
      // Vérifier que les DELETE utilisent id_rate_type
      const deleteCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('DELETE FROM')
      );
      expect(deleteCalls.length).toBe(3); // links, data, rate_type
      deleteCalls.forEach(call => {
        if (call[0].includes('accommodation_rate_type_links') || call[0].includes('accommodation_data')) {
          expect(call[0]).toContain('id_rate_type');
        }
      });
    });

    it('should return false when rate type does not exist', async () => {
      const mockFirst = vi.fn().mockResolvedValue(null); // Rate type n'existe pas
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst
        })
      });

      const result = await deleteRateType(999, env);

      expect(result).toBe(false);
    });
  });

  describe('loadAccommodationRateTypeLinks', () => {
    it('should return rate type IDs using JOIN with rate_types', async () => {
      const mockAll = vi.fn().mockResolvedValue({
        results: [
          { id_type_tarif: 1 },
          { id_type_tarif: 2 },
          { id_type_tarif: 3 }
        ]
      });
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: mockAll
        })
      });

      const result = await loadAccommodationRateTypeLinks('acc-123', env);

      expect(result).toEqual([1, 2, 3]);
      
      // Vérifier que la requête fait un JOIN
      const queryCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('FROM accommodation_rate_type_links')
      );
      expect(queryCalls.length).toBeGreaterThan(0);
      expect(queryCalls[0][0]).toContain('INNER JOIN rate_types');
      expect(queryCalls[0][0]).toContain('rt.id = artl.id_rate_type');
    });

    it('should filter out rate types without OpenPro ID', async () => {
      const mockAll = vi.fn().mockResolvedValue({
        results: [
          { id_type_tarif: 1 },
          { id_type_tarif: null }, // Rate type sans ID OpenPro
          { id_type_tarif: 3 }
        ]
      });
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: mockAll
        })
      });

      const result = await loadAccommodationRateTypeLinks('acc-123', env);

      expect(result).toEqual([1, 3]); // null filtré
    });
  });

  describe('loadRateTypesForAccommodation', () => {
    it('should return rate types using JOIN on id_rate_type', async () => {
      const mockAll = vi.fn().mockResolvedValue({
        results: [
          {
            id: 'uuid-1',
            id_type_tarif: 1,
            libelle: JSON.stringify({ fr: 'Test 1' }),
            ordre: 1
          },
          {
            id: 'uuid-2',
            id_type_tarif: 2,
            libelle: JSON.stringify({ fr: 'Test 2' }),
            ordre: 2
          }
        ]
      });
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: mockAll
        })
      });

      const result = await loadRateTypesForAccommodation('acc-123', env);

      expect(result.length).toBe(2);
      expect(result[0].rateTypeId).toBe(1);
      
      // Vérifier que la requête fait un JOIN
      const queryCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('FROM rate_types rt')
      );
      expect(queryCalls.length).toBeGreaterThan(0);
      expect(queryCalls[0][0]).toContain('INNER JOIN accommodation_rate_type_links artl');
      expect(queryCalls[0][0]).toContain('rt.id = artl.id_rate_type');
    });
  });
});

