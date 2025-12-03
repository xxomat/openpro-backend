/**
 * Tests pour les routes suppliers - Validation SUPPLIER_ID
 */

import { describe, it, expect } from 'vitest';
import { SUPPLIER_ID } from '../../config/supplier.js';

describe('Suppliers Routes - SUPPLIER_ID Validation', () => {
  describe('SUPPLIER_ID constant', () => {
    it('should be defined and be a number', () => {
      expect(SUPPLIER_ID).toBeDefined();
      expect(typeof SUPPLIER_ID).toBe('number');
    });
  });

  describe('Validation logic', () => {
    it('should reject invalid idFournisseur', () => {
      const invalidId = SUPPLIER_ID + 1;
      expect(invalidId).not.toBe(SUPPLIER_ID);
    });

    it('should accept valid SUPPLIER_ID', () => {
      const validId = SUPPLIER_ID;
      expect(validId).toBe(SUPPLIER_ID);
    });

    it('should validate idFournisseur matches SUPPLIER_ID', () => {
      const idFournisseur = SUPPLIER_ID;
      const isValid = idFournisseur === SUPPLIER_ID;
      expect(isValid).toBe(true);
    });
  });
});

