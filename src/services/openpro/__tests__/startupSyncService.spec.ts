/**
 * Tests unitaires pour le service de synchronisation au démarrage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '../../../index.js';
import {
  verifyAccommodationsOnStartup,
  syncRateTypesOnStartup,
  syncRateTypeLinksOnStartup,
  getStartupWarnings,
  clearStartupWarnings
} from '../startupSyncService.js';
import { loadAllAccommodations } from '../accommodationService.js';
import { updateRateTypeOpenProId } from '../rateTypeDbService.js';
import { loadAccommodationRateTypeLinks } from '../rateTypeDbService.js';
import { getOpenProClient } from '../../openProClient.js';
import { getSupplierId } from '../../../config/supplier.js';
import { PlateformeReservation } from '../../../types/api.js';

// Mock des modules externes
vi.mock('../accommodationService.js', () => ({
  loadAllAccommodations: vi.fn()
}));

vi.mock('../rateTypeDbService.js', () => ({
  updateRateTypeOpenProId: vi.fn(),
  loadAccommodationRateTypeLinks: vi.fn()
}));

vi.mock('../../openProClient.js', () => ({
  getOpenProClient: vi.fn()
}));

vi.mock('../../../config/supplier.js', () => ({
  getSupplierId: vi.fn()
}));

describe('StartupSyncService', () => {
  let env: Env;
  let mockDb: any;
  let mockOpenProClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    clearStartupWarnings();
    
    mockDb = {
      prepare: vi.fn(),
    };

    mockOpenProClient = {
      listAccommodations: vi.fn(),
      listRateTypes: vi.fn(),
      createRateType: vi.fn(),
      listAccommodationRateTypeLinks: vi.fn(),
      linkRateTypeToAccommodation: vi.fn()
    };

    env = {
      DB: mockDb as D1Database,
      OPENPRO_API_KEY: 'test-key',
      OPENPRO_BASE_URL: 'http://localhost:3000',
      FRONTEND_URL: 'http://localhost:4321',
      AI_PROVIDER: 'openai',
    };

    vi.mocked(getSupplierId).mockReturnValue(47186);
    vi.mocked(getOpenProClient).mockReturnValue(mockOpenProClient);
  });

  describe('verifyAccommodationsOnStartup', () => {
    it('should verify accommodations and add warning if missing in OpenPro', async () => {
      // Mock des hébergements en DB
      const dbAccommodations = [
        {
          id: 'acc-1',
          nom: 'Hébergement 1',
          ids: {
            [PlateformeReservation.Directe]: 'dir-1',
            [PlateformeReservation.OpenPro]: '100'
          }
        },
        {
          id: 'acc-2',
          nom: 'Hébergement 2',
          ids: {
            [PlateformeReservation.Directe]: 'dir-2',
            [PlateformeReservation.OpenPro]: '200'
          }
        },
        {
          id: 'acc-3',
          nom: 'Hébergement 3',
          ids: {
            [PlateformeReservation.Directe]: 'dir-3',
            [PlateformeReservation.OpenPro]: '300'
          }
        }
      ];

      // Mock des hébergements dans OpenPro (acc-2 manque)
      const openProAccommodations = {
        listeHebergement: [
          {
            cleHebergement: {
              idFournisseur: 47186,
              idHebergement: 100
            },
            nom: 'Hébergement 1'
          },
          {
            cleHebergement: {
              idFournisseur: 47186,
              idHebergement: 300
            },
            nom: 'Hébergement 3'
          }
        ]
      };

      vi.mocked(loadAllAccommodations).mockResolvedValue(dbAccommodations as any);
      mockOpenProClient.listAccommodations.mockResolvedValue(openProAccommodations);

      await verifyAccommodationsOnStartup(env);

      // Vérifier qu'un avertissement a été ajouté pour acc-2
      const warnings = getStartupWarnings();
      expect(warnings.length).toBe(1);
      expect(warnings[0].type).toBe('accommodation_missing_in_openpro');
      expect(warnings[0].accommodationId).toBe('acc-2');
      expect(warnings[0].message).toContain('Hébergement 2');
      expect(warnings[0].message).toContain('ID OpenPro: 200');
    });

    it('should not add warning if all accommodations exist in OpenPro', async () => {
      const dbAccommodations = [
        {
          id: 'acc-1',
          nom: 'Hébergement 1',
          ids: {
            [PlateformeReservation.Directe]: 'dir-1',
            [PlateformeReservation.OpenPro]: '100'
          }
        }
      ];

      const openProAccommodations = {
        listeHebergement: [
          {
            cleHebergement: {
              idFournisseur: 47186,
              idHebergement: 100
            },
            nom: 'Hébergement 1'
          }
        ]
      };

      vi.mocked(loadAllAccommodations).mockResolvedValue(dbAccommodations as any);
      mockOpenProClient.listAccommodations.mockResolvedValue(openProAccommodations);

      await verifyAccommodationsOnStartup(env);

      const warnings = getStartupWarnings();
      expect(warnings.length).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(loadAllAccommodations).mockRejectedValue(new Error('DB error'));

      await expect(verifyAccommodationsOnStartup(env)).resolves.not.toThrow();
    });
  });

  describe('syncRateTypesOnStartup', () => {
    it('should create rate types in OpenPro for DB rate types without OpenPro ID', async () => {
      // Mock des plans tarifaires en DB (un avec ID OpenPro, un sans)
      const mockAll = vi.fn().mockResolvedValue({
        results: [
          {
            id: 'uuid-1',
            id_type_tarif: 10,
            libelle: JSON.stringify({ fr: 'Plan 1' }),
            description: null,
            ordre: 1
          },
          {
            id: 'uuid-2',
            id_type_tarif: null, // Sans ID OpenPro
            libelle: JSON.stringify({ fr: 'Plan 2' }),
            description: JSON.stringify({ fr: 'Description 2' }),
            ordre: 2
          }
        ]
      });

      // loadAllRateTypesFromDb appelle prepare().all() directement (sans bind)
      mockDb.prepare.mockReturnValue({
        all: mockAll,
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true })
        })
      });

      // Mock des plans tarifaires dans OpenPro
      const openProRateTypes = {
        typeTarifs: [
          {
            idTypeTarif: 10,
            libelle: { fr: 'Plan 1' }
          }
        ]
      };

      // Mock de la création dans OpenPro
      mockOpenProClient.listRateTypes.mockResolvedValue(openProRateTypes);
      mockOpenProClient.createRateType.mockResolvedValue({
        idTypeTarif: 20
      });

      await syncRateTypesOnStartup(env);

      // Vérifier que createRateType a été appelé pour le plan sans ID OpenPro
      expect(mockOpenProClient.createRateType).toHaveBeenCalledTimes(1);
      expect(mockOpenProClient.createRateType).toHaveBeenCalledWith(
        47186,
        expect.objectContaining({
          libelle: { fr: 'Plan 2' },
          description: { fr: 'Description 2' },
          ordre: 2
        })
      );

      // Vérifier que updateRateTypeOpenProId a été appelé
      expect(updateRateTypeOpenProId).toHaveBeenCalledWith('uuid-2', 20, env);
    });

    it('should add warning if rate type creation fails', async () => {
      const mockAll = vi.fn().mockResolvedValue({
        results: [
          {
            id: 'uuid-1',
            id_type_tarif: null,
            libelle: JSON.stringify({ fr: 'Plan 1' }),
            description: null,
            ordre: 1
          }
        ]
      });

      // loadAllRateTypesFromDb appelle prepare().all() directement (sans bind)
      mockDb.prepare.mockReturnValue({
        all: mockAll
      });

      mockOpenProClient.listRateTypes.mockResolvedValue({ typeTarifs: [] });
      mockOpenProClient.createRateType.mockRejectedValue(new Error('OpenPro API error'));

      await syncRateTypesOnStartup(env);

      const warnings = getStartupWarnings();
      expect(warnings.length).toBe(1);
      expect(warnings[0].type).toBe('rate_type_creation_failed');
      expect(warnings[0].rateTypeId).toBe('uuid-1');
    });

    it('should not create rate types that already have OpenPro ID', async () => {
      const mockAll = vi.fn().mockResolvedValue({
        results: [
          {
            id: 'uuid-1',
            id_type_tarif: 10,
            libelle: JSON.stringify({ fr: 'Plan 1' }),
            description: null,
            ordre: 1
          }
        ]
      });

      // loadAllRateTypesFromDb appelle prepare().all() directement (sans bind)
      mockDb.prepare.mockReturnValue({
        all: mockAll
      });

      mockOpenProClient.listRateTypes.mockResolvedValue({
        typeTarifs: [
          { idTypeTarif: 10 }
        ]
      });

      await syncRateTypesOnStartup(env);

      // Ne devrait pas créer de plan tarifaire
      expect(mockOpenProClient.createRateType).not.toHaveBeenCalled();
    });
  });

  describe('syncRateTypeLinksOnStartup', () => {
    it('should create missing links in OpenPro', async () => {
      const accommodations = [
        {
          id: 'acc-1',
          nom: 'Hébergement 1',
          ids: {
            [PlateformeReservation.Directe]: 'dir-1',
            [PlateformeReservation.OpenPro]: '100'
          }
        }
      ];

      // Mock des liens en DB
      vi.mocked(loadAllAccommodations).mockResolvedValue(accommodations as any);
      vi.mocked(loadAccommodationRateTypeLinks).mockResolvedValue([10, 20]);

      // Mock des liens dans OpenPro (seulement 10, pas 20)
      mockOpenProClient.listAccommodationRateTypeLinks.mockResolvedValue({
        liste: [
          { idTypeTarif: 10 }
        ]
      });

      await syncRateTypeLinksOnStartup(env);

      // Vérifier que linkRateTypeToAccommodation a été appelé pour le lien manquant
      expect(mockOpenProClient.linkRateTypeToAccommodation).toHaveBeenCalledTimes(1);
      expect(mockOpenProClient.linkRateTypeToAccommodation).toHaveBeenCalledWith(
        47186,
        100, // idOpenPro
        20  // idTypeTarif manquant
      );
    });

    it('should not create links that already exist in OpenPro', async () => {
      const accommodations = [
        {
          id: 'acc-1',
          nom: 'Hébergement 1',
          ids: {
            [PlateformeReservation.Directe]: 'dir-1',
            [PlateformeReservation.OpenPro]: '100'
          }
        }
      ];

      vi.mocked(loadAllAccommodations).mockResolvedValue(accommodations as any);
      vi.mocked(loadAccommodationRateTypeLinks).mockResolvedValue([10]);

      mockOpenProClient.listAccommodationRateTypeLinks.mockResolvedValue({
        liste: [
          { idTypeTarif: 10 }
        ]
      });

      await syncRateTypeLinksOnStartup(env);

      // Ne devrait pas créer de lien
      expect(mockOpenProClient.linkRateTypeToAccommodation).not.toHaveBeenCalled();
    });

    it('should add warning if link creation fails', async () => {
      const accommodations = [
        {
          id: 'acc-1',
          nom: 'Hébergement 1',
          ids: {
            [PlateformeReservation.Directe]: 'dir-1',
            [PlateformeReservation.OpenPro]: '100'
          }
        }
      ];

      vi.mocked(loadAllAccommodations).mockResolvedValue(accommodations as any);
      vi.mocked(loadAccommodationRateTypeLinks).mockResolvedValue([10]);

      mockOpenProClient.listAccommodationRateTypeLinks.mockResolvedValue({
        liste: []
      });

      mockOpenProClient.linkRateTypeToAccommodation.mockRejectedValue(
        new Error('OpenPro API error')
      );

      await syncRateTypeLinksOnStartup(env);

      const warnings = getStartupWarnings();
      expect(warnings.length).toBe(1);
      expect(warnings[0].type).toBe('link_creation_failed');
      expect(warnings[0].accommodationId).toBe('acc-1');
      expect(warnings[0].rateTypeId).toBe(10);
    });

    it('should handle accommodations without OpenPro ID', async () => {
      const accommodations = [
        {
          id: 'acc-1',
          nom: 'Hébergement 1',
          ids: {
            [PlateformeReservation.Directe]: 'dir-1'
            // Pas d'ID OpenPro
          }
        }
      ];

      vi.mocked(loadAllAccommodations).mockResolvedValue(accommodations as any);

      await syncRateTypeLinksOnStartup(env);

      // Ne devrait pas appeler listAccommodationRateTypeLinks
      expect(mockOpenProClient.listAccommodationRateTypeLinks).not.toHaveBeenCalled();
    });
  });

  describe('getStartupWarnings and clearStartupWarnings', () => {
    it('should return empty array initially', () => {
      clearStartupWarnings();
      const warnings = getStartupWarnings();
      expect(warnings).toEqual([]);
    });

    it('should return warnings after they are added', async () => {
      clearStartupWarnings();

      const accommodations = [
        {
          id: 'acc-1',
          nom: 'Hébergement 1',
          ids: {
            [PlateformeReservation.Directe]: 'dir-1',
            [PlateformeReservation.OpenPro]: '999' // N'existe pas dans OpenPro
          }
        }
      ];

      vi.mocked(loadAllAccommodations).mockResolvedValue(accommodations as any);
      mockOpenProClient.listAccommodations.mockResolvedValue({
        listeHebergement: []
      });

      await verifyAccommodationsOnStartup(env);

      const warnings = getStartupWarnings();
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toHaveProperty('timestamp');
      expect(warnings[0].timestamp).toBeDefined();
    });

    it('should clear warnings', async () => {
      // Ajouter un avertissement
      const accommodations = [
        {
          id: 'acc-1',
          nom: 'Hébergement 1',
          ids: {
            [PlateformeReservation.Directe]: 'dir-1',
            [PlateformeReservation.OpenPro]: '999'
          }
        }
      ];

      vi.mocked(loadAllAccommodations).mockResolvedValue(accommodations as any);
      mockOpenProClient.listAccommodations.mockResolvedValue({
        listeHebergement: []
      });

      await verifyAccommodationsOnStartup(env);

      expect(getStartupWarnings().length).toBe(1);

      clearStartupWarnings();
      expect(getStartupWarnings().length).toBe(0);
    });
  });
});

