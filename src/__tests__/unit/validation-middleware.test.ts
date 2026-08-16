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

    it('should pick value from query when not present in body for plain schema (line 303)', async () => {
      const { validate } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      };
      req.body = {};
      req.query = { id: 'query-value' } as any;
      req.params = {};
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle plain schema without properties (line 299)', async () => {
      const { validate } = await importModule();
      const schema = {
        type: 'object',
      };
      req.body = { anything: 'value' };
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

    it('should allow undeclared keys when additionalProperties is not false', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const result = validateRequest({ name: 'Ada', extra: 42 }, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject undeclared keys when additionalProperties is false', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
        },
      };
      const result = validateRequest({ name: 'Ada', extra: 42 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([{ field: 'extra', message: '"extra" is not an allowed field' }]);
    });

    it('should pass when additionalProperties is false and all keys are declared', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
        },
      };
      const result = validateRequest({ name: 'Ada' }, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject every key when additionalProperties is false and no properties are declared', async () => {
      const { validateRequest } = await importModule();
      const result = validateRequest({ anything: true }, { type: 'object', additionalProperties: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('anything');
    });

    it('should enforce exclusiveMinimum and exclusiveMaximum bounds', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          fee: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 100 },
        },
      };

      expect(validateRequest({ fee: 0 }, schema).valid).toBe(false);
      expect(validateRequest({ fee: 100 }, schema).valid).toBe(false);
      expect(validateRequest({ fee: 50 }, schema).valid).toBe(true);
      expect(validateRequest({ fee: 0.01 }, schema).valid).toBe(true);
    });

    it('should report exclusive bound violations with the field name', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          fee: { type: 'number', exclusiveMinimum: 0 },
        },
      };
      const result = validateRequest({ fee: 0 }, schema);
      expect(result.errors).toEqual([{ field: 'fee', message: '"fee" must be greater than 0' }]);
    });

    it('should accept an empty body and reject any key with emptyBodySchema', async () => {
      const { validateRequest, emptyBodySchema } = await importModule();
      expect(validateRequest({}, emptyBodySchema.body).valid).toBe(true);
      expect(validateRequest(undefined, emptyBodySchema.body).valid).toBe(true);
      expect(validateRequest({ stray: 'value' }, emptyBodySchema.body).valid).toBe(false);
    });

    it('should not reject values whose schema type is unrecognized', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          custom: { type: 'custom-type' },
        },
      };
      expect(validateRequest({ custom: 42 }, schema).valid).toBe(true);
    });

    it('should recurse into object array items and enforce per-item required fields', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', required: true },
                amount: { type: 'number', required: true },
              },
            },
          },
        },
      };

      const result = validateRequest({ milestones: [{ amount: 100 }] }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'milestones[0].title', message: '"title" is required' });
    });

    it('should treat a null required item field as missing', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', required: true },
                amount: { type: 'number', required: true },
              },
            },
          },
        },
      };

      const result = validateRequest({ milestones: [{ title: null, amount: 100 }] }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'milestones[0].title', message: '"title" is required' });
    });

    it('should validate the types and bounds of object array item fields', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', required: true },
                amount: { type: 'number', exclusiveMinimum: 0, required: true },
              },
            },
          },
        },
      };

      const result = validateRequest({ milestones: [{ title: 'Phase 1', amount: 0 }] }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({ field: 'milestones[0].amount', message: '"milestones[0].amount" must be greater than 0' });
    });

    it('should pass valid object array items', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', required: true },
                amount: { type: 'number', required: true },
              },
            },
          },
        },
      };

      const result = validateRequest({ milestones: [{ title: 'Phase 1', amount: 100 }] }, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should skip absent non-required fields in object items', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', required: true },
                note: { type: 'string' },
              },
            },
          },
        },
      };

      expect(validateRequest({ milestones: [{ title: 'Phase 1' }] }, schema).valid).toBe(true);
    });

    it('should accept object values whose property has no nested schema', async () => {
      const { validateRequest } = await importModule();
      const schema = {
        type: 'object',
        properties: {
          config: { type: 'object' },
        },
      };

      expect(validateRequest({ config: { anything: 1 } }, schema).valid).toBe(true);
    });
  });

  describe('validate middleware - coerceBody for multipart form-data', () => {
    it('should coerce string body values to the declared types and write them back', async () => {
      const { validate } = await importModule();
      const schema = {
        coerceBody: true,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            budget: { type: 'number', exclusiveMinimum: 0, required: true },
            isRush: { type: 'boolean' },
            rushFeePercentage: { type: 'number', maximum: 100 },
          },
        },
      };
      req.body = { budget: '5000', isRush: 'true', rushFeePercentage: '15' };
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(req.body).toEqual({ budget: 5000, isRush: true, rushFeePercentage: 15 });
    });

    it('should reject non-numeric strings after coercion', async () => {
      const { validate } = await importModule();
      const schema = {
        coerceBody: true,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            budget: { type: 'number', exclusiveMinimum: 0, required: true },
          },
        },
      };
      req.body = { budget: 'abc' };
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should not coerce body values when coerceBody is not set', async () => {
      const { validate } = await importModule();
      const schema = {
        body: {
          type: 'object',
          properties: {
            budget: { type: 'number' },
          },
        },
      };
      req.body = { budget: '5000' };
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(req.body).toEqual({ budget: '5000' });
    });
  });

  describe('validate middleware - additionalProperties rejection', () => {
    it('should return 400 when body contains undeclared keys', async () => {
      const { validate } = await importModule();
      const schema = {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
          },
        },
      };
      req.body = { name: 'Ada', extra: 42 };
      const middleware = validate(schema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            details: [{ field: 'extra', message: '"extra" is not an allowed field' }],
          }),
        }),
      );
    });
  });

  describe('validate middleware - schema.files file-count enforcement', () => {
    const filesSchema = {
      body: {
        type: 'object',
        additionalProperties: false,
        files: {
          fieldName: 'files',
          minItems: 1,
          maxItems: 5,
          description: 'File attachments (1-5 files)',
        },
        properties: {
          projectId: { type: 'string', required: true },
        },
      },
    };

    it('should pass when the file count is within the schema bounds', async () => {
      const { validate } = await importModule();
      req.body = { projectId: 'p-1' };
      (req as any).files = [{ originalname: 'a.pdf' }, { originalname: 'b.pdf' }];
      const middleware = validate(filesSchema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject when no files are uploaded and minItems >= 1', async () => {
      const { validate } = await importModule();
      req.body = { projectId: 'p-1' };
      (req as any).files = undefined;
      const middleware = validate(filesSchema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
            details: expect.arrayContaining([
              { field: 'files', message: '"files" must have at least 1 file(s)' },
            ]),
          }),
        }),
      );
    });

    it('should reject when the file count exceeds maxItems', async () => {
      const { validate } = await importModule();
      req.body = { projectId: 'p-1' };
      (req as any).files = Array.from({ length: 6 }, (_, i) => ({ originalname: `f${i}.pdf` }));
      const middleware = validate(filesSchema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.arrayContaining([
              { field: 'files', message: '"files" must have at most 5 file(s)' },
            ]),
          }),
        }),
      );
    });

    it('should count files from an object-of-arrays (upload.fields shape)', async () => {
      const { validate } = await importModule();
      req.body = { projectId: 'p-1' };
      (req as any).files = { files: [{ originalname: 'a.pdf' }, { originalname: 'b.pdf' }] };
      const middleware = validate(filesSchema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should treat non-file values as zero files', async () => {
      const { validate } = await importModule();
      req.body = { projectId: 'p-1' };
      (req as any).files = 'not-files';
      const middleware = validate(filesSchema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should allow zero files when minItems is 0', async () => {
      const { validate } = await importModule();
      const optionalFilesSchema = {
        body: {
          type: 'object',
          files: { fieldName: 'files', minItems: 0, maxItems: 10, description: 'Optional' },
          properties: { title: { type: 'string', required: true } },
        },
      };
      req.body = { title: 'Valid' };
      (req as any).files = undefined;
      const middleware = validate(optionalFilesSchema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should skip file-count enforcement when the schema declares no files metadata', async () => {
      const { validate } = await importModule();
      const noFilesSchema = {
        body: {
          type: 'object',
          properties: { name: { type: 'string', required: true } },
        },
      };
      req.body = { name: 'Ada' };
      (req as any).files = undefined;
      const middleware = validate(noFilesSchema);
      middleware(req as Request, res as Response, next);
      expect(next).toHaveBeenCalled();
    });

    it('should enforce files metadata on a plain schema (else branch)', async () => {
      const { validate } = await importModule();
      const plainSchema = {
        type: 'object',
        files: { fieldName: 'files', minItems: 1, maxItems: 3, description: 'Required' },
        properties: { name: { type: 'string' } },
      };
      req.body = { name: 'Ada' };
      (req as any).files = undefined;
      const middleware = validate(plainSchema);
      middleware(req as Request, res as Response, next);
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
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
