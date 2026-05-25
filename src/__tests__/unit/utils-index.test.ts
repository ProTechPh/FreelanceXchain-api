import { describe, it, expect } from '@jest/globals';
import { clampLimit, clampOffset, generateId } from '../../utils/index.js';

describe('utils/index', () => {
  describe('generateId', () => {
    it('should return a non-empty string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 20 }, () => generateId()));
      expect(ids.size).toBe(20);
    });
  });

  describe('clampLimit', () => {
    it('should return defaultVal when raw is undefined', () => {
      expect(clampLimit(undefined)).toBe(20);
    });

    it('should return defaultVal when raw is null', () => {
      expect(clampLimit(null)).toBe(20);
    });

    it('should return defaultVal when raw is NaN', () => {
      expect(clampLimit(NaN)).toBe(20);
    });

    it('should return defaultVal when raw is Infinity', () => {
      expect(clampLimit(Infinity)).toBe(20);
    });

    it('should return defaultVal when raw is -Infinity', () => {
      expect(clampLimit(-Infinity)).toBe(20);
    });

    it('should return 1 for zero', () => {
      expect(clampLimit(0)).toBe(1);
    });

    it('should return 1 for negative values', () => {
      expect(clampLimit(-5)).toBe(1);
    });

    it('should return the raw value when within range', () => {
      expect(clampLimit(50)).toBe(50);
    });

    it('should cap at max when raw exceeds max', () => {
      expect(clampLimit(200)).toBe(100);
    });

    it('should use custom defaultVal', () => {
      expect(clampLimit(undefined, 15)).toBe(15);
    });

    it('should use custom max', () => {
      expect(clampLimit(500, 20, 200)).toBe(200);
    });

    it('should floor fractional values', () => {
      expect(clampLimit(7.9)).toBe(7);
    });
  });

  describe('clampOffset', () => {
    it('should return 0 when raw is undefined', () => {
      expect(clampOffset(undefined)).toBe(0);
    });

    it('should return 0 when raw is null', () => {
      expect(clampOffset(null)).toBe(0);
    });

    it('should return 0 when raw is NaN', () => {
      expect(clampOffset(NaN)).toBe(0);
    });

    it('should return 0 when raw is Infinity', () => {
      expect(clampOffset(Infinity)).toBe(0);
    });

    it('should return 0 for zero', () => {
      expect(clampOffset(0)).toBe(0);
    });

    it('should return 0 for negative values', () => {
      expect(clampOffset(-10)).toBe(0);
    });

    it('should return the raw value when within range', () => {
      expect(clampOffset(500)).toBe(500);
    });

    it('should cap at 1_000_000', () => {
      expect(clampOffset(2_000_000)).toBe(1_000_000);
    });

    it('should floor fractional values', () => {
      expect(clampOffset(42.9)).toBe(42);
    });
  });
});
