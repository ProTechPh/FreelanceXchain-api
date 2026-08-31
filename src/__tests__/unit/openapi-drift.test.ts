// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';

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

const { VALIDATED_ENDPOINTS, validatedEndpointSchema, generateSwaggerSpec } = await import('../../config/swagger.js');

const spec = JSON.parse(readFileSync(resolve(process.cwd(), 'openapi.json'), 'utf8'));
const baseSpec = JSON.parse(readFileSync(resolve(process.cwd(), 'openapi.base.json'), 'utf8'));

/** Key an endpoint by path + method + content type (an endpoint may serve both JSON and multipart). */
const endpointKey = (e: { path: string; method: string; contentType?: string }) =>
  `${e.method.toUpperCase()} ${e.path} ${e.contentType ?? 'application/json'}`;

describe('OpenAPI spec drift guard', () => {
  it.each(VALIDATED_ENDPOINTS.map(e => [endpointKey(e), e]))(
    'should keep %s request body generated from the middleware schema',
    (_key, endpoint) => {
      const operation = spec.paths[endpoint.path][endpoint.method];
      const contentType = endpoint.contentType ?? 'application/json';

      if (endpoint.schema.properties === undefined || Object.keys(endpoint.schema.properties).length === 0) {
        // No-body endpoints (e.g. contract actions) reject any request body,
        // so the spec must not document one.
        expect(operation.requestBody).toBeUndefined();
        return;
      }

      expect(operation.requestBody).toBeDefined();
      expect(operation.requestBody.content[contentType]).toBeDefined();
      expect(operation.requestBody.content[contentType].schema).toEqual(validatedEndpointSchema(endpoint));
    },
  );

  it('should serve exactly the spec regenerated from openapi.base.json (no hand-edits outside the registered endpoints)', () => {
    expect(generateSwaggerSpec()).toEqual(spec);
  });

  it('should keep the base spec free of middleware-owned request bodies', () => {
    for (const endpoint of VALIDATED_ENDPOINTS) {
      const operation = baseSpec.paths?.[endpoint.path]?.[endpoint.method];
      // Registered endpoints' request bodies are derived at generation time;
      // a requestBody in the base would be silently overwritten (or, for
      // no-body endpoints, deleted), so its presence means drift.
      expect(operation?.requestBody).toBeUndefined();
    }
  });

  it('should keep spec file-upload fields derived exactly from the middleware schema.files metadata', () => {
    const multipartEndpoints = VALIDATED_ENDPOINTS.filter(e => e.contentType === 'multipart/form-data');

    expect(multipartEndpoints.length).toBeGreaterThan(0);

    for (const endpoint of multipartEndpoints) {
      // The middleware schema must carry the file metadata; without it the
      // generator emits no files property at all, so the spec is missing it.
      expect(endpoint.schema.files).toBeDefined();
      const files = endpoint.schema.files;

      const contentType = endpoint.contentType ?? 'application/json';
      const schema = spec.paths[endpoint.path][endpoint.method].requestBody.content[contentType].schema;

      // The spec property must match the metadata field-for-field.
      expect(schema.properties[files.fieldName]).toEqual({
        type: 'array',
        items: { type: 'string', format: 'binary' },
        minItems: files.minItems,
        maxItems: files.maxItems,
        description: files.description,
      });

      // The field is required exactly when at least one file is mandatory.
      expect(schema.required.includes(files.fieldName)).toBe(files.minItems >= 1);
    }
  });

  it('should not declare file metadata on non-multipart endpoints', () => {
    const nonMultipartEndpoints = VALIDATED_ENDPOINTS.filter(e => e.contentType !== 'multipart/form-data');
    expect(nonMultipartEndpoints.length).toBeGreaterThan(0);

    for (const endpoint of nonMultipartEndpoints) {
      // Files arrive via multer, never in a JSON body; declaring `files` on a
      // JSON endpoint would leak a binary-array field into its spec schema.
      expect(endpoint.schema.files).toBeUndefined();
    }
  });

  it('should document POST /api/reviews in the spec', () => {
    expect(spec.paths['/api/reviews'].post.summary).toBe('Submit a review');
  });

  it('should keep middleware-derived request bodies for project, message and contract routes in the spec', () => {
    for (const [p, m] of [
      ['/api/projects', 'post'],
      ['/api/projects/{id}', 'patch'],
      ['/api/projects/{id}/milestones', 'post'],
      ['/api/messages/send', 'post'],
    ]) {
      expect(spec.paths[p][m].requestBody).toBeDefined();
      expect(spec.paths[p][m].requestBody.content['application/json'].schema).toBeDefined();
    }
  });

  it('should document contract action endpoints without a request body', () => {
    for (const p of ['/api/contracts/{id}/escrow/withdraw', '/api/contracts/{id}/cancel']) {
      expect(spec.paths[p].post.requestBody).toBeUndefined();
      expect(spec.paths[p].post.parameters).toBeDefined();
    }
  });
});
