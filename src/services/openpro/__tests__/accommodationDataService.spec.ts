/**
 * Tests pour le service de gestion des données d'hébergement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '../../../index.js';
import { saveAccommodationStock, saveAccommodationData } from '../accommodationDataService.js';

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
    it('should save rate data to DB for new date and rate type', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue(null); // Pas de données existantes
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

      const insertCalls = mockDb.prepare.mock.calls.filter(call => 
        call[0].includes('INSERT INTO accommodation_data')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(mockRun).toHaveBeenCalled();
    });

    it('should update rate data in DB for existing date and rate type', async () => {
      const mockRun = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      const mockFirst = vi.fn().mockResolvedValue({ id: 'existing-id' }); // Données existantes
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
      expect(mockRun).toHaveBeenCalled();
    });
  });
});

