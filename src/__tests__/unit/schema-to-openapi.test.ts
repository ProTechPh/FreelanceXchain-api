// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';

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

const { validationSchemaToOpenApi } = await import('../../utils/schema-to-openapi.js');

describe('validationSchemaToOpenApi', () => {
  it('should map every supported keyword onto OpenAPI form', () => {
    const result = validationSchemaToOpenApi({
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 36, pattern: '^[a-z]+$', format: 'uuid' },
        count: { type: 'integer', minimum: 0, maximum: 10 },
        ratio: { type: 'number', minimum: 0, maximum: 1 },
        active: { type: 'boolean' },
        tags: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
        state: { type: 'string', enum: ['open', 'closed'] },
      },
    });

    expect(result).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 36, pattern: '^[a-z]+$', format: 'uuid' },
        count: { type: 'integer', minimum: 0, maximum: 10 },
        ratio: { type: 'number', minimum: 0, maximum: 1 },
        active: { type: 'boolean' },
        tags: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
        state: { type: 'string', enum: ['open', 'closed'] },
      },
    });
  });

  it('should merge property-level required flags into the object required array', () => {
    const result = validationSchemaToOpenApi({
      type: 'object',
      properties: {
        name: { type: 'string', required: true },
        age: { type: 'number' },
      },
    });

    expect(result.required).toEqual(['name']);
    expect(result.properties.name).not.toHaveProperty('required');
  });

  it('should convert nested requiredProperties into the nested required array', () => {
    const result = validationSchemaToOpenApi({
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            zip: { type: 'string' },
          },
          requiredProperties: ['city'],
        },
      },
    });

    expect(result.properties.address).toEqual({
      type: 'object',
      required: ['city'],
      properties: {
        city: { type: 'string' },
        zip: { type: 'string' },
      },
    });
  });

  it('should omit additionalProperties and required when not declared', () => {
    const result = validationSchemaToOpenApi({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    });

    expect(result).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
    expect(result).not.toHaveProperty('additionalProperties');
    expect(result).not.toHaveProperty('required');
  });

  it('should produce an empty object for an empty schema', () => {
    expect(validationSchemaToOpenApi({})).toEqual({});
  });

  it('should emit file-upload fields as binary array properties from schema.files metadata', () => {
    const result = validationSchemaToOpenApi({
      type: 'object',
      additionalProperties: false,
      files: {
        fieldName: 'files',
        minItems: 1,
        maxItems: 5,
        description: 'File attachments (1-5 files, max 10MB each, 25MB total)',
      },
      properties: {
        projectId: { type: 'string', required: true },
      },
    });

    expect(result).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['projectId', 'files'],
      properties: {
        projectId: { type: 'string' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          minItems: 1,
          maxItems: 5,
          description: 'File attachments (1-5 files, max 10MB each, 25MB total)',
        },
      },
    });
  });

  it('should not mark optional file uploads as required', () => {
    const result = validationSchemaToOpenApi({
      type: 'object',
      files: { fieldName: 'files', minItems: 0, maxItems: 10, description: 'Optional reference materials' },
      properties: { title: { type: 'string', required: true } },
    });

    expect(result.required).toEqual(['title']);
    expect(result.properties.files).toMatchObject({ type: 'array', minItems: 0, maxItems: 10 });
  });

  it('should emit an explicitly empty properties object even with no body fields', () => {
    const result = validationSchemaToOpenApi({ type: 'object', additionalProperties: false, properties: {} });
    expect(result).toEqual({ type: 'object', additionalProperties: false, properties: {} });
  });
});
