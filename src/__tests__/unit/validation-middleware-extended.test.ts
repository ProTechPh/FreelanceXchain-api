// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';

import { validateRequest, validate, validateUUID, isValidUUID } from '../../middleware/validation-middleware.js';

describe('Validation Middleware - Extended Coverage', () => {
  describe('validateRequest', () => {
    it('should validate required fields', () => {
      const result = validateRequest({}, {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('name');
    });

    it('should pass when all required fields present', () => {
      const result = validateRequest({ name: 'John' }, {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      });
      expect(result.valid).toBe(true);
    });

    it('should validate string minLength', () => {
      const result = validateRequest({ name: 'Hi' }, {
        type: 'object',
        properties: { name: { type: 'string', minLength: 3 } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('at least 3');
    });

    it('should validate string maxLength', () => {
      const result = validateRequest({ name: 'A very long name that exceeds the limit' }, {
        type: 'object',
        properties: { name: { type: 'string', maxLength: 10 } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('at most 10');
    });

    it('should validate string pattern', () => {
      const result = validateRequest({ code: 'abc' }, {
        type: 'object',
        properties: { code: { type: 'string', pattern: '^[0-9]+$' } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('pattern');
    });

    it('should pass valid pattern', () => {
      const result = validateRequest({ code: '12345' }, {
        type: 'object',
        properties: { code: { type: 'string', pattern: '^[0-9]+$' } },
      });
      expect(result.valid).toBe(true);
    });

    it('should validate string enum', () => {
      const result = validateRequest({ role: 'admin' }, {
        type: 'object',
        properties: { role: { type: 'string', enum: ['freelancer', 'employer'] } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be one of');
    });

    it('should validate email format', () => {
      const result = validateRequest({ email: 'not-an-email' }, {
        type: 'object',
        properties: { email: { type: 'string', format: 'email' } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('email');
    });

    it('should validate date format', () => {
      const result = validateRequest({ date: 'not-a-date' }, {
        type: 'object',
        properties: { date: { type: 'string', format: 'date' } },
      });
      expect(result.valid).toBe(false);
    });

    it('should validate date-time format', () => {
      const result = validateRequest({ dt: 'not-datetime' }, {
        type: 'object',
        properties: { dt: { type: 'string', format: 'date-time' } },
      });
      expect(result.valid).toBe(false);
    });

    it('should validate uri format', () => {
      const result = validateRequest({ url: 'not-a-url' }, {
        type: 'object',
        properties: { url: { type: 'string', format: 'uri' } },
      });
      expect(result.valid).toBe(false);
    });

    it('should validate uuid format', () => {
      const result = validateRequest({ id: 'not-a-uuid' }, {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      });
      expect(result.valid).toBe(false);
    });

    it('should pass valid uuid format', () => {
      const result = validateRequest({ id: '550e8400-e29b-41d4-a716-446655440000' }, {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
      });
      expect(result.valid).toBe(true);
    });

    it('should validate number minimum', () => {
      const result = validateRequest({ age: -1 }, {
        type: 'object',
        properties: { age: { type: 'number', minimum: 0 } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('at least 0');
    });

    it('should validate number maximum', () => {
      const result = validateRequest({ age: 200 }, {
        type: 'object',
        properties: { age: { type: 'number', maximum: 150 } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('at most 150');
    });

    it('should validate integer type', () => {
      const result = validateRequest({ count: 3.5 }, {
        type: 'object',
        properties: { count: { type: 'integer' } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('integer');
    });

    it('should validate number enum', () => {
      const result = validateRequest({ rating: 6 }, {
        type: 'object',
        properties: { rating: { type: 'number', enum: [1, 2, 3, 4, 5] } },
      });
      expect(result.valid).toBe(false);
    });

    it('should validate array minItems', () => {
      const result = validateRequest({ tags: [] }, {
        type: 'object',
        properties: { tags: { type: 'array', minItems: 1 } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('at least 1');
    });

    it('should validate array maxItems', () => {
      const result = validateRequest({ tags: ['a', 'b', 'c', 'd'] }, {
        type: 'object',
        properties: { tags: { type: 'array', maxItems: 3 } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('at most 3');
    });

    it('should validate array items', () => {
      const result = validateRequest({ tags: ['valid', 123] }, {
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
      });
      expect(result.valid).toBe(false);
    });

    it('should validate nested object properties', () => {
      const result = validateRequest({ address: { city: 123 } }, {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        },
      });
      expect(result.valid).toBe(false);
    });

    it('should validate object required properties', () => {
      const result = validateRequest({ address: {} }, {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: { city: { type: 'string' } },
            requiredProperties: ['city'],
          },
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('city');
    });

    it('should validate type mismatch', () => {
      const result = validateRequest({ name: 123 }, {
        type: 'object',
        properties: { name: { type: 'string' } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('type string');
    });

    it('should skip undefined optional fields', () => {
      const result = validateRequest({}, {
        type: 'object',
        properties: { name: { type: 'string' } },
      });
      expect(result.valid).toBe(true);
    });

    it('should handle null required field', () => {
      const result = validateRequest({ name: null }, {
        type: 'object',
        properties: { name: { type: 'string', required: true } },
        required: ['name'],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('validate middleware', () => {
    it('should call next when validation passes', () => {
      const middleware = validate({
        body: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      });

      const req = { body: { name: 'John' }, params: {}, query: {}, headers: {} } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 400 when body validation fails', () => {
      const middleware = validate({
        body: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      });

      const req = { body: {}, params: {}, query: {}, headers: {} } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should validate params', () => {
      const middleware = validate({
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      });

      const req = { body: {}, params: { id: 'not-uuid' }, query: {}, headers: {} } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should validate query with type conversion', () => {
      const middleware = validate({
        query: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1 },
            active: { type: 'boolean' },
            tags: { type: 'array' },
          },
        },
      });

      const req = { body: {}, params: {}, query: { page: '2', active: 'true', tags: 'a,b,c' }, headers: {} } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validateUUID', () => {
    it('should pass for valid UUID in params', () => {
      const middleware = validateUUID();
      const req = { params: { id: '550e8400-e29b-41d4-a716-446655440000' }, headers: {} } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should fail for invalid UUID', () => {
      const middleware = validateUUID();
      const req = { params: { id: 'not-a-uuid' }, headers: {} } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should validate specific param names', () => {
      const middleware = validateUUID(['userId', 'projectId']);
      const req = { params: { userId: '550e8400-e29b-41d4-a716-446655440000', projectId: 'invalid' }, headers: {} } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('isValidUUID', () => {
    it('should return true for valid UUID', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should return false for invalid UUID', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });
  });
});
