/**
 * Tests pour le service de gestion des plans tarifaires en DB
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '../../../index.js';
import { saveRateType, linkRateTypeToAccommodation, unlinkRateTypeFromAccommodation } from '../rateTypeDbService.js';

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

      await saveRateType({
        idTypeTarif: 3,
        libelle: JSON.stringify({ fr: 'Test' }),
        ordre: 1
      }, env);

      const insertCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('INSERT INTO rate_types')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
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

      await saveRateType({
        idTypeTarif: 3,
        libelle: JSON.stringify({ fr: 'Updated' }),
        ordre: 2
      }, env);

      const updateCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('UPDATE rate_types')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });
  });

  describe('linkRateTypeToAccommodation', () => {
    it('should create link if not exists', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue(null); // Lien n'existe pas
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun
        })
      });

      await linkRateTypeToAccommodation('acc-123', 3, env);

      const insertCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('INSERT INTO accommodation_rate_type_links')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    it('should not create duplicate link if already exists', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue({ id: 'existing-link-id' }); // Lien existe
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
    it('should delete link from DB', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      mockDb.prepare.mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: mockRun
        })
      });

      await unlinkRateTypeFromAccommodation('acc-123', 3, env);

      const deleteCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('DELETE FROM accommodation_rate_type_links')
      );
      expect(deleteCalls.length).toBeGreaterThan(0);
      expect(mockRun).toHaveBeenCalled();
    });
  });
});

