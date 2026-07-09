// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    security: jest.fn(),
  },
}));

describe('Validation Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnThis();
    req = {
      body: {},
      query: {},
      params: {},
      headers: { 'x-request-id': 'test-request-id' },
    } as any;
    res = {
      status: statusMock as any,
      json: jsonMock as any,
    };
    next = jest.fn();
  });

  const importModule = async () => {
    return await import('../../middleware/validation-middleware.js');
  };

  describe('isValidUUID', () => {
    it('should return true for valid UUID v4', async () => {
      const { isValidUUID } = await importModule();
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should return false for invalid UUID', async () => {
      const { isValidUUID } = await importModule();
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });
  });

  describe('validateUUID middleware', () => {
    it('should call next for valid UUID params', async () => {
      const { validateUUID } = await importModule();
      req.params = { id: '550e8400-e29b-41d4-a716-446655440000' };
      const middleware = validateUUID();
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid UUID params', async () => {
      const { validateUUID } = await importModule();
      req.params = { id: 'invalid-uuid' };
      const middleware = validateUUID();
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should validate multiple param names', async () => {
      const { validateUUID } = await importModule();
      req.params = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        projectId: 'invalid',
      };
      const middleware = validateUUID(['id', 'projectId']);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should skip validation when param is not present', async () => {
      const { validateUUID } = await importModule();
      req.params = {};
      const middleware = validateUUID(['id']);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validate middleware - RequestSchema with body/query/params', () => {
    it('should validate body against body schema', async () => {
      const { validate } = await importModule();
      const schema = {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', required: true },
          },
        },
      };
      req.body = { name: 'test' };
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 400 when body validation fails', async () => {
      const { validate } = await importModule();
      const schema = {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', required: true },
          },
        },
      };
      req.body = {};
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validate middleware - query parameter coercion and validation (line 290)', () => {
    it('should validate query params and return 400 on invalid values (line 290)', async () => {
      const { validate } = await importModule();
      const schema = {
        query: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1 },
          },
        },
      };
      // 'abc' cannot be coerced to a number, so type validation should fail
      req.query = { page: 'abc' } as any;
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should coerce valid string query params to numbers', async () => {
      const { validate } = await importModule();
      const schema = {
        query: {
          type: 'object',
          properties: {
            page: { type: 'number' },
          },
        },
      };
      req.query = { page: '5' } as any;
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should coerce boolean string query params', async () => {
      const { validate } = await importModule();
      const schema = {
        query: {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
          },
        },
      };
      req.query = { active: 'true' } as any;
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should coerce "false" string to boolean false', async () => {
      const { validate } = await importModule();
      const schema = {
        query: {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
          },
        },
      };
      req.query = { active: 'false' } as any;
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should coerce comma-separated string to array', async () => {
      const { validate } = await importModule();
      const schema = {
        query: {
          type: 'object',
          properties: {
            tags: { type: 'array' },
          },
        },
      };
      req.query = { tags: 'a,b,c' } as any;
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should coerce integer string query params', async () => {
      const { validate } = await importModule();
      const schema = {
        query: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
          },
        },
      };
      req.query = { limit: '10' } as any;
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should not coerce non-integer string for integer type', async () => {
      const { validate } = await importModule();
      const schema = {
        query: {
          type: 'object',
          properties: {
            limit: { type: 'integer' },
          },
        },
      };
      req.query = { limit: '3.5' } as any;
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      // '3.5' is not an integer, so it stays as string and fails integer validation
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should skip coercion when query value is undefined (line 262)', async () => {
      const { validate } = await importModule();
      const schema = {
        query: {
          type: 'object',
          properties: {
            page: { type: 'number' },
          },
        },
      };
      // page is not in query, so it should be skipped
      req.query = {} as any;
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validate middleware - coerceQueryParams with no properties (lines 259-262)', () => {
    it('should return query unchanged when schema has no properties', async () => {
      const { validate } = await importModule();
      const schema = {
        query: {
          type: 'object',
        },
      };
      req.query = { anything: 'value' } as any;
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      // With no properties to validate, schema passes
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validate middleware - plain schema (else branch, line 301)', () => {
    it('should validate merged body/query/params against plain schema', async () => {
      const { validate } = await importModule();
      // Plain schema without body/query/params keys triggers the else branch
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
        },
      };
      req.body = { name: 'test' };
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 400 when plain schema validation fails (line 301)', async () => {
      const { validate } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
        },
      };
      req.body = {};
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
    });

    it('should merge query and params into validation for plain schema', async () => {
      const { validate } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      };
      req.body = {};
      req.params = { id: '550e8400-e29b-41d4-a716-446655440000' };
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validate middleware - params validation', () => {
    it('should validate params and return 400 on failure', async () => {
      const { validate } = await importModule();
      const schema = {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', required: true },
          },
        },
      };
      req.params = {};
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('validateRequest', () => {
    it('should return valid when schema has no properties', async () => {
      const { validateRequest } = await importModule();
      const result = validateRequest({}, { type: 'object' });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should check schema-level required fields', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
        },
      };
      const result = validateRequest({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('name');
    });
  });

  describe('exported schemas', () => {
    it('should export addExperienceSchema', async () => {
      const { addExperienceSchema } = await importModule();
      expect(addExperienceSchema).toBeDefined();
      expect(addExperienceSchema.properties.title).toBeDefined();
    });

    it('should export registerSchema', async () => {
      const { registerSchema } = await importModule();
      expect(registerSchema.body).toBeDefined();
    });

    it('should export loginSchema', async () => {
      const { loginSchema } = await importModule();
      expect(loginSchema.body).toBeDefined();
    });
  });
});
