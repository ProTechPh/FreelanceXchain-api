// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';

import { validateRequest, validate } from '../../middleware/validation-middleware.js';

describe('Validation Middleware - Coverage Gaps', () => {
  describe('pattern validation timeout (ReDoS protection)', () => {
    it('should report pattern does not match for non-matching input', () => {
      // Tests the "does not match required pattern" path (lines 130-135)
      const result = validateRequest(
        { input: 'abc123' },
        {
          type: 'object',
          properties: {
            input: { type: 'string', pattern: '^[0-9]+$' },
          },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('does not match required pattern');
    });

    it('should catch invalid regex patterns', () => {
      // This tests the catch block (lines 137-142)
      const result = validateRequest(
        { code: 'test' },
        {
          type: 'object',
          properties: {
            code: { type: 'string', pattern: '[invalid(' },
          },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('pattern validation failed');
    });
  });

  describe('validate middleware - query type conversion', () => {
    it('should convert query params with array type', () => {
      const middleware = validate({
        query: {
          type: 'object',
          properties: {
            tags: { type: 'array' },
            count: { type: 'integer' },
            active: { type: 'boolean' },
            name: { type: 'string' },
          },
        },
      });

      const req = {
        body: {},
        query: { tags: 'js,ts,python', count: '5', active: 'true', name: 'test' },
        params: {},
        headers: { 'x-request-id': 'test-id' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req as any, res as any, next);

      // Should call next (validation passes)
      expect(next).toHaveBeenCalled();
    });

    it('should handle number query conversion', () => {
      const middleware = validate({
        query: {
          type: 'object',
          properties: {
            limit: { type: 'number' },
          },
        },
      });

      const req = {
        body: {},
        query: { limit: '25' },
        params: {},
        headers: { 'x-request-id': 'test-id' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req as any, res as any, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('format validation - date and date-time', () => {
    it('should validate date format correctly', () => {
      const result = validateRequest(
        { startDate: 'not-a-date' },
        {
          type: 'object',
          properties: { startDate: { type: 'string', format: 'date' } },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('date');
    });

    it('should validate date-time format correctly', () => {
      const result = validateRequest(
        { timestamp: 'not-a-datetime' },
        {
          type: 'object',
          properties: { timestamp: { type: 'string', format: 'date-time' } },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('date-time');
    });

    it('should pass valid date-time', () => {
      const result = validateRequest(
        { timestamp: '2025-01-15T10:30:00Z' },
        {
          type: 'object',
          properties: { timestamp: { type: 'string', format: 'date-time' } },
        }
      );
      expect(result.valid).toBe(true);
    });
  });
});
