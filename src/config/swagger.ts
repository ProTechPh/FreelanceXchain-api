import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addMilestonesSchema,
  createProjectSchema,
  createProjectWithAttachmentsSchema,
  emptyBodySchema,
  fundContractSchema,
  sendMessageSchema,
  submitProposalMultipartSchema,
  submitProposalSchema,
  submitRatingSchema,
  submitReviewSchema,
  updateFreelancerProfileSchema,
  updateProjectSchema,
} from '../middleware/validation-middleware.js';
import type { Schema } from '../middleware/validation-middleware.js';
import { validationSchemaToOpenApi } from '../utils/schema-to-openapi.js';

type ValidatedEndpoint = {
  path: string;
  method: 'post' | 'patch';
  schema: Schema;
  /** Request body content type. `application/json` is the default. */
  contentType?: 'application/json' | 'multipart/form-data';
  /** Metadata used only when the operation is missing from the base spec. */
  operation: {
    summary: string;
    description?: string;
    tags: string[];
    security?: Array<Record<string, unknown[]>>;
    parameters?: unknown[];
    responses: Record<string, unknown>;
  };
};

/**
 * Endpoints whose request bodies are generated from the validation middleware
 * schemas. The runtime middleware and the served spec share the same source,
 * so they cannot drift.
 */
export const VALIDATED_ENDPOINTS: ValidatedEndpoint[] = [
  {
    path: '/api/reviews',
    method: 'post',
    schema: submitReviewSchema.body!,
    operation: {
      summary: 'Submit a review',
      description: 'Submit a review for a contract. Rating must be between 1 and 5.',
      tags: ['Reviews'],
      security: [{ bearerAuth: [] }],
      responses: {
        '201': { description: 'Review submitted successfully' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'KYC verification required' },
      },
    },
  },
  {
    path: '/api/reputation/rate',
    method: 'post',
    schema: submitRatingSchema.body!,
    operation: {
      summary: 'Submit rating',
      tags: ['Reputation'],
      security: [{ bearerAuth: [] }],
      responses: {
        '201': { description: 'Rating submitted successfully' },
        '400': { description: 'Invalid rating or validation error' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  {
    path: '/api/freelancers/profile',
    method: 'patch',
    schema: updateFreelancerProfileSchema.body!,
    operation: {
      summary: 'Update freelancer profile',
      tags: ['Freelancers'],
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Profile updated successfully' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  {
    path: '/api/projects/with-attachments',
    method: 'post',
    contentType: 'multipart/form-data',
    schema: createProjectWithAttachmentsSchema.body!,
    operation: {
      summary: 'Create project with attachments',
      description: 'Creates a new project (employer only), uploading reference attachments as multipart/form-data.',
      tags: ['Projects'],
      security: [{ bearerAuth: [] }],
      responses: {
        '201': {
          description: 'Project created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Project' },
            },
          },
        },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'KYC verification required' },
      },
    },
  },
  {
    path: '/api/proposals',
    method: 'post',
    contentType: 'application/json',
    schema: submitProposalSchema.body!,
    operation: {
      summary: 'Submit proposal',
      description: 'Submit a proposal for a project with file attachments (freelancer only). Supports both multipart/form-data (server-side upload) and application/json (URL-reference pattern).',
      tags: ['Proposals'],
      security: [{ bearerAuth: [] }],
      responses: {
        '201': { description: 'Proposal submitted successfully' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Project not found' },
        '409': { description: 'Duplicate proposal' },
      },
    },
  },
  {
    path: '/api/proposals',
    method: 'post',
    contentType: 'multipart/form-data',
    schema: submitProposalMultipartSchema.body!,
    operation: {
      summary: 'Submit proposal',
      description: 'Submit a proposal for a project with file attachments (freelancer only). Supports both multipart/form-data (server-side upload) and application/json (URL-reference pattern).',
      tags: ['Proposals'],
      security: [{ bearerAuth: [] }],
      responses: {
        '201': { description: 'Proposal submitted successfully' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Project not found' },
        '409': { description: 'Duplicate proposal' },
      },
    },
  },
  {
    path: '/api/projects',
    method: 'post',
    schema: createProjectSchema.body!,
    operation: {
      summary: 'Create project',
      description: 'Creates a new project (employer only)',
      tags: ['Projects'],
      security: [{ bearerAuth: [] }],
      responses: {
        '201': { description: 'Project created successfully' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'KYC verification required' },
      },
    },
  },
  {
    path: '/api/projects/{id}',
    method: 'patch',
    schema: updateProjectSchema.body!,
    operation: {
      summary: 'Update project',
      description: 'Updates an existing project (employer only, project must not have accepted proposals)',
      tags: ['Projects'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Project ID (UUID)',
        },
      ],
      responses: {
        '200': { description: 'Project updated successfully' },
        '400': { description: 'Validation error or invalid UUID format' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Project not found' },
        '409': { description: 'Project locked (has accepted proposals)' },
      },
    },
  },
  {
    path: '/api/projects/{id}/milestones',
    method: 'post',
    schema: addMilestonesSchema.body!,
    operation: {
      summary: 'Add milestones to project',
      description: 'Sets milestones for a project (employer only, milestone amounts must sum to budget)',
      tags: ['Projects'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Project ID (UUID)',
        },
      ],
      responses: {
        '200': { description: 'Milestones added successfully' },
        '400': { description: 'Validation error, invalid UUID format, or milestone sum mismatch' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Project not found' },
        '409': { description: 'Project locked (has accepted proposals)' },
      },
    },
  },
  {
    path: '/api/messages/send',
    method: 'post',
    schema: sendMessageSchema.body!,
    operation: {
      summary: 'Send message',
      description: 'Send a message to another user',
      tags: ['Messages'],
      security: [{ bearerAuth: [] }],
      responses: {
        '201': { description: 'Message sent successfully' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
      },
    },
  },
  {
    path: '/api/contracts/{id}/fund',
    method: 'post',
    schema: fundContractSchema.body!,
    operation: {
      summary: 'Fund contract escrow',
      description: 'Employer funds the escrow for a pending contract, activating it',
      tags: ['Contracts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Contract ID (UUID)',
        },
      ],
      responses: {
        '200': { description: 'Escrow funded and contract activated' },
        '400': { description: 'Contract not in pending status or missing wallet addresses' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Only the employer can fund the escrow' },
        '404': { description: 'Contract not found' },
      },
    },
  },
  {
    path: '/api/contracts/{id}/escrow/withdraw',
    method: 'post',
    schema: emptyBodySchema.body!,
    operation: {
      summary: "Withdraw the employer's pending escrow allocation (real blockchain mode)",
      description: 'The server wallet is the on-chain employer/platform, so this claims its allocation credited by a dispute resolution.',
      tags: ['Contracts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Contract ID (UUID)',
        },
      ],
      responses: {
        '200': { description: 'Withdrawal processed' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Only the employer or an admin can trigger the platform withdrawal' },
        '422': { description: 'Only available in real blockchain mode' },
      },
    },
  },
  {
    path: '/api/contracts/{id}/cancel',
    method: 'post',
    schema: emptyBodySchema.body!,
    operation: {
      summary: 'Cancel a pending contract',
      description: 'Cancel a contract that is still in pending status',
      tags: ['Contracts'],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Contract ID (UUID)',
        },
      ],
      responses: {
        '200': { description: 'Contract cancelled successfully' },
        '400': { description: 'Contract cannot be cancelled' },
        '401': { description: 'Unauthorized' },
        '404': { description: 'Contract not found' },
      },
    },
  },
];

/**
 * OpenAPI schema for an endpoint's request body: the middleware schema
 * converted to OpenAPI. File-upload metadata lives on the middleware schema
 * itself (`schema.files`), so the spec cannot drift from what the generator
 * derives for multipart endpoints.
 */
export function validatedEndpointSchema(endpoint: ValidatedEndpoint): Record<string, unknown> {
  return validationSchemaToOpenApi(endpoint.schema);
}

/**
 * True when the middleware schema declares no body fields at all (e.g.
 * `emptyBodySchema`): the endpoint rejects any request body, so the spec must
 * not document one.
 */
function isNoBodySchema(schema: Schema): boolean {
  return (schema.properties === undefined || Object.keys(schema.properties).length === 0) &&
    (schema.required === undefined || schema.required.length === 0);
}

/**
 * Replace the request bodies of the validated endpoints in a spec with the
 * schemas converted from the validation middleware, adding any missing paths.
 */
export function applyValidationSchemasToSpec(spec: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(spec);
  const paths = (next.paths ??= {}) as Record<string, Record<string, unknown>>;

  for (const endpoint of VALIDATED_ENDPOINTS) {
    const pathEntry = (paths[endpoint.path] ??= {});
    const operation = (pathEntry[endpoint.method] ?? { ...endpoint.operation }) as Record<string, unknown>;

    // No-body endpoints reject any request body, so the spec documents none.
    if (isNoBodySchema(endpoint.schema)) {
      delete operation.requestBody;
      pathEntry[endpoint.method] = operation;
      continue;
    }

    // Merge per content type: an endpoint may serve both JSON and multipart
    // bodies (e.g. POST /api/proposals), and each branch is validated by a
    // different middleware schema.
    const requestBody = (operation.requestBody ?? { required: true, content: {} }) as Record<string, unknown>;
    const content = (requestBody.content ?? {}) as Record<string, unknown>;
    content[endpoint.contentType ?? 'application/json'] = {
      schema: validatedEndpointSchema(endpoint),
    };
    requestBody.content = content;
    operation.requestBody = requestBody;
    pathEntry[endpoint.method] = operation;
  }

  return next;
}

/**
 * Read the canonical base spec (`openapi.base.json`) and produce the served
 * version with the validated request bodies applied. `openapi.json` is a pure
 * artifact of this function: CI regenerates it and fails on any drift, which
 * catches hand-edits to `openapi.json` that were never made in the base.
 */
export function generateSwaggerSpec(): Record<string, unknown> {
  const spec = JSON.parse(readFileSync(resolve(process.cwd(), 'openapi.base.json'), 'utf8')) as Record<string, unknown>;
  return applyValidationSchemasToSpec(spec);
}
