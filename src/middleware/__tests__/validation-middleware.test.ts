// @ts-nocheck
/**
 * Property-Based Tests for Request Validation Middleware
 *
 * **Property 41: Invalid data validation errors**
 * **Property 42: Missing field validation errors**
 * **Validates: Requirements 12.2, 12.3**
 */
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';
import fc from 'fast-check';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);
import {
  validateRequest,
  validate,
  registerSchema,
  loginSchema,
  createProjectSchema,
  submitProposalSchema,
  submitRatingSchema,
  createFreelancerProfileSchema,
  validateUUID,
  isValidUUID,
  validateAppwriteDocumentId,
  isValidAppwriteDocumentId,
  RequestSchema,
} from '../validation-middleware.js';
// Helper to extract body schema with proper typing
function getBodySchema(schema: RequestSchema) {
  return schema.body!;
}
describe('Validation Middleware - Property Tests', () => {
  /**
   * **Feature: blockchain-freelance-marketplace, Property 41: Invalid data validation errors**
   * **Validates: Requirements 12.2**
   * 
   * For any API request with invalid data, the response shall include
   * field-specific validation error messages identifying which fields are invalid.
   */
  describe('Property 41: Invalid data validation errors', () => {
    it('should return field-specific errors for invalid email format', () => {
      fc.assert(
        fc.property(
          // Generate strings that are NOT valid emails
          fc.string().filter(s => !s.includes('@') || s.length < 5),
          fc.string({ minLength: 8 }),
          fc.constantFrom('freelancer', 'employer'),
          (invalidEmail, password, role) => {
            const data = { email: invalidEmail, password, role };
            const result = validateRequest(data, getBodySchema(registerSchema));
            // Should have validation errors
            expect(result.valid).toBe(false);
            // Should have field-specific error for email
            const emailError = result.errors.find(e => e.field === 'email');
            expect(emailError).toBeDefined();
            expect(emailError?.message).toContain('email');
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should return field-specific errors for password too short', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          // Generate passwords that are too short (less than 8 chars)
          fc.string({ minLength: 1, maxLength: 7 }),
          fc.constantFrom('freelancer', 'employer'),
          (email, shortPassword, role) => {
            const data = { email, password: shortPassword, role };
            const result = validateRequest(data, getBodySchema(registerSchema));
            // Should have validation errors
            expect(result.valid).toBe(false);
            // Should have field-specific error for password
            const passwordError = result.errors.find(e => e.field === 'password');
            expect(passwordError).toBeDefined();
            expect(passwordError?.message).toContain('password');
            expect(passwordError?.message).toContain('8');
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should return field-specific errors for invalid role enum', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          fc.string({ minLength: 8 }),
          // Generate roles that are NOT valid enum values
          fc.string().filter(s => s !== 'freelancer' && s !== 'employer'),
          (email, password, invalidRole) => {
            const data = { email, password, role: invalidRole };
            const result = validateRequest(data, getBodySchema(registerSchema));
            // Should have validation errors
            expect(result.valid).toBe(false);
            // Should have field-specific error for role
            const roleError = result.errors.find(e => e.field === 'role');
            expect(roleError).toBeDefined();
            expect(roleError?.message).toContain('role');
            expect(roleError?.message).toContain('one of');
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should return field-specific errors for invalid number types', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10 }),
          // Generate non-number values for hourlyRate
          fc.string(),
          (bio, invalidRate) => {
            const data = { bio, hourlyRate: invalidRate };
            const result = validateRequest(data, getBodySchema(createFreelancerProfileSchema));
            // Should have validation errors
            expect(result.valid).toBe(false);
            // Should have field-specific error for hourlyRate
            const rateError = result.errors.find(e => e.field === 'hourlyRate');
            expect(rateError).toBeDefined();
            expect(rateError?.message).toContain('hourlyRate');
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should return field-specific errors for number below minimum', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10 }),
          // Generate numbers below minimum (1)
          fc.integer({ min: -1000, max: 0 }),
          (bio, invalidRate) => {
            const data = { bio, hourlyRate: invalidRate };
            const result = validateRequest(data, getBodySchema(createFreelancerProfileSchema));
            // Should have validation errors
            expect(result.valid).toBe(false);
            // Should have field-specific error for hourlyRate
            const rateError = result.errors.find(e => e.field === 'hourlyRate');
            expect(rateError).toBeDefined();
            expect(rateError?.message).toContain('hourlyRate');
            expect(rateError?.message).toContain('at least');
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should return field-specific errors for rating outside bounds (1-5)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.string({ minLength: 1 }),
          // Generate ratings outside valid range (1-5)
          fc.oneof(
            fc.integer({ min: -100, max: 0 }),
            fc.integer({ min: 6, max: 100 })
          ),
          (contractId, rateeId, invalidRating) => {
            const data = { contractId, rateeId, rating: invalidRating };
            const result = validateRequest(data, getBodySchema(submitRatingSchema));
            // Should have validation errors
            expect(result.valid).toBe(false);
            // Should have field-specific error for rating
            const ratingError = result.errors.find(e => e.field === 'rating');
            expect(ratingError).toBeDefined();
            expect(ratingError?.message).toContain('rating');
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should return field-specific errors for string below minLength', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          // Generate attachments array that is empty (invalid)
          fc.constant([]),
          fc.integer({ min: 1 }),
          fc.integer({ min: 1 }),
          (projectId, emptyAttachments, proposedRate, estimatedDuration) => {
            const data = { projectId, attachments: emptyAttachments, proposedRate, estimatedDuration };
            const result = validateRequest(data, getBodySchema(submitProposalSchema));
            // Should have validation errors
            expect(result.valid).toBe(false);
            // Should have field-specific error for attachments
            const attachmentsError = result.errors.find(e => e.field === 'attachments');
            expect(attachmentsError).toBeDefined();
            expect(attachmentsError?.message).toContain('attachments');
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should return multiple field-specific errors when multiple fields are invalid', () => {
      fc.assert(
        fc.property(
          // Invalid email
          fc.string().filter(s => !s.includes('@')),
          // Invalid password (too short)
          fc.string({ minLength: 1, maxLength: 7 }),
          // Invalid role
          fc.string().filter(s => s !== 'freelancer' && s !== 'employer'),
          (invalidEmail, shortPassword, invalidRole) => {
            const data = { email: invalidEmail, password: shortPassword, role: invalidRole };
            const result = validateRequest(data, getBodySchema(registerSchema));
            // Should have validation errors
            expect(result.valid).toBe(false);
            // Should have errors for all three fields
            expect(result.errors.length).toBeGreaterThanOrEqual(3);
            const fields = result.errors.map(e => e.field);
            expect(fields).toContain('email');
            expect(fields).toContain('password');
            expect(fields).toContain('role');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  /**
   * **Feature: blockchain-freelance-marketplace, Property 42: Missing field validation errors**
   * **Validates: Requirements 12.3**
   * 
   * For any API request missing required fields, the response shall list
   * all missing required fields.
   */
  describe('Property 42: Missing field validation errors', () => {
    it('should list all missing required fields for registration', () => {
      fc.assert(
        fc.property(
          // Generate subsets of required fields to omit
          fc.subarray(['email', 'password', 'role'], { minLength: 1 }),
          (fieldsToOmit) => {
            // Create data with some required fields missing
            const fullData: Record<string, unknown> = {
              email: 'test@example.com',
              password: 'password123',
              role: 'freelancer',
            };
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }
            const result = validateRequest(data, getBodySchema(registerSchema));
            // Should have validation errors
            expect(result.valid).toBe(false);
            // Should have errors for all omitted fields
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              // Error message should indicate the field is required
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should list all missing required fields for login', () => {
      fc.assert(
        fc.property(
          fc.subarray(['email', 'password'], { minLength: 1 }),
          (fieldsToOmit) => {
            const fullData: Record<string, unknown> = {
              email: 'test@example.com',
              password: 'password123',
            };
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }
            const result = validateRequest(data, getBodySchema(loginSchema));
            expect(result.valid).toBe(false);
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should list all missing required fields for project creation', () => {
      fc.assert(
        fc.property(
          fc.subarray(['title', 'description', 'requiredSkills', 'budget', 'deadline'], { minLength: 1 }),
          (fieldsToOmit) => {
            const fullData: Record<string, unknown> = {
              title: 'Test Project Title',
              description: 'This is a test project description that is long enough',
              requiredSkills: [{ skillId: 'skill-1' }],
              budget: 1000,
              deadline: '2025-12-31T23:59:59Z',
            };
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }
            const result = validateRequest(data, getBodySchema(createProjectSchema));
            expect(result.valid).toBe(false);
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should list all missing required fields for proposal submission', () => {
      fc.assert(
        fc.property(
          fc.subarray(['projectId', 'attachments', 'proposedRate', 'estimatedDuration'], { minLength: 1 }),
          (fieldsToOmit) => {
            const fullData: Record<string, unknown> = {
              projectId: 'project-123',
              attachments: [
                {
                  url: 'https://test.appwrite.co/storage/v1/object/public/proposal-attachments/test.pdf',
                  filename: 'proposal.pdf',
                  size: 1048576,
                  mimeType: 'application/pdf',
                },
              ],
              proposedRate: 50,
              estimatedDuration: 30,
            };
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }
            const result = validateRequest(data, getBodySchema(submitProposalSchema));
            expect(result.valid).toBe(false);
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should list all missing required fields for rating submission', () => {
      fc.assert(
        fc.property(
          fc.subarray(['contractId', 'rateeId', 'rating'], { minLength: 1 }),
          (fieldsToOmit) => {
            const fullData: Record<string, unknown> = {
              contractId: 'contract-123',
              rateeId: 'user-456',
              rating: 5,
            };
            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(fullData)) {
              if (!fieldsToOmit.includes(key)) {
                data[key] = value;
              }
            }
            const result = validateRequest(data, getBodySchema(submitRatingSchema));
            expect(result.valid).toBe(false);
            const errorFields = result.errors.map(e => e.field);
            for (const omittedField of fieldsToOmit) {
              expect(errorFields).toContain(omittedField);
              const fieldError = result.errors.find(e => e.field === omittedField);
              expect(fieldError?.message).toContain('required');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should return empty errors for valid complete data', () => {
      fc.assert(
        fc.property(
          // Generate emails that match our validation pattern: [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._%+-]{2,20}$/),
            fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9.-]{1,10}$/),
            fc.stringMatching(/^[a-zA-Z]{2,6}$/)
          ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`),
          // Generate passwords with at least one non-whitespace character
          fc.string({ minLength: 8, maxLength: 128 }).filter(s => s.trim().length > 0),
          fc.constantFrom('freelancer', 'employer'),
          (email, password, role) => {
            const data = { email, password, role };
            const result = validateRequest(data, getBodySchema(registerSchema));
            // Should be valid with no errors
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
    it('should handle empty object with all required fields missing', () => {
      const result = validateRequest({}, getBodySchema(registerSchema));
      expect(result.valid).toBe(false);
      const errorFields = result.errors.map(e => e.field);
      expect(errorFields).toContain('email');
      expect(errorFields).toContain('password');
      expect(errorFields).toContain('role');
      // All errors should mention "required"
      for (const error of result.errors) {
        expect(error.message).toContain('required');
      }
    });
  });
});

// ===========================================================================
// Merged from validation-middleware-coverage.test.ts – branch coverage
// ===========================================================================
describe('Validation Middleware – Branch Coverage', () => {
  describe('pattern validation (ReDoS protection)', () => {
    it('should report pattern does not match for non-matching input', () => {
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

  describe('validate middleware – query type conversion', () => {
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

  describe('format validation – date and date-time', () => {
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

  describe('type validation – boolean, array, object', () => {
    it('should validate boolean type', () => {
      const result = validateRequest(
        { active: 'not-a-boolean' },
        {
          type: 'object',
          properties: { active: { type: 'boolean' } },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be a boolean');
    });

    it('should validate array type', () => {
      const result = validateRequest(
        { tags: 'not-an-array' },
        {
          type: 'object',
          properties: { tags: { type: 'array' } },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be an array');
    });

    it('should validate object type', () => {
      const result = validateRequest(
        { metadata: 'not-an-object' },
        {
          type: 'object',
          properties: { metadata: { type: 'object' } },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be an object');
    });

    it('should reject array when object type expected', () => {
      const result = validateRequest(
        { metadata: [1, 2, 3] },
        {
          type: 'object',
          properties: { metadata: { type: 'object' } },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be an object');
    });
  });

  describe('schema without properties', () => {
    it('should return valid when schema has no properties', () => {
      const result = validateRequest(
        { anything: 'goes' },
        { type: 'object' }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('nested object validation', () => {
    it('should validate nested object number type', () => {
      const result = validateRequest(
        { config: { timeout: 'not-a-number' } },
        {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              properties: {
                timeout: { type: 'number' },
              },
            },
          },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be a number');
    });
  });

  describe('array items validation', () => {
    it('should validate array items number type', () => {
      const result = validateRequest(
        { scores: [1, 'not-a-number', 3] },
        {
          type: 'object',
          properties: {
            scores: {
              type: 'array',
              items: { type: 'number' },
            },
          },
        }
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be a number');
    });
  });

  describe('boolean coercion', () => {
    it('should coerce "false" string to false boolean in query', () => {
      const middleware = validate({
        query: {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
          },
        },
      });

      const req = {
        body: {},
        query: { active: 'false' },
        params: {},
        headers: { 'x-request-id': 'test-id' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req as any, res as any, next);
      expect(next).toHaveBeenCalled();
    });

    it('should coerce "true" string to true boolean in query', () => {
      const middleware = validate({
        query: {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
          },
        },
      });

      const req = {
        body: {},
        query: { active: 'true' },
        params: {},
        headers: { 'x-request-id': 'test-id' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req as any, res as any, next);
      expect(next).toHaveBeenCalled();
    });
  });
});

describe('Validation Middleware - addExperienceSchema date validation', () => {
  it('should accept valid date string in startDate field', async () => {
    const { validate, addExperienceSchema } = await import('../validation-middleware.js');
    const req = {
      headers: { 'x-request-id': 'req-123' },
      body: {
        title: 'Software Engineer',
        company: 'Tech Corp',
        description: 'Worked on various software projects',
        startDate: '2024-01-15',
      },
    };
    const res = {};
    const next = jest.fn();

    const middleware = validate(addExperienceSchema);
    middleware(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
  });
});



// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('validation-middleware.ts - Branch Coverage', () => {
  it('L206: requiredProperties triggers on null value', async () => {
    const { validateRequest } = await import('../../middleware/validation-middleware.js');
    const schema = {
      type: 'object' as const,
      properties: {
        data: {
          type: 'object' as const,
          requiredProperties: ['name'],
          properties: { name: { type: 'string' as const } },
        },
      },
    };
    const result = validateRequest({ data: { name: null } }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors?.some((e: any) => e.field === 'data.name')).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('validation-middleware.ts - Branch Coverage', () => {
  it('L206: requiredProperties triggers on null value', async () => {
    const { validateRequest } = await import('../../middleware/validation-middleware.js');
    const schema = {
      type: 'object' as const,
      properties: {
        data: {
          type: 'object' as const,
          requiredProperties: ['name'],
          properties: { name: { type: 'string' as const } },
        },
      },
    };
    const result = validateRequest({ data: { name: null } }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors?.some((e: any) => e.field === 'data.name')).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════
// Merged from coverage files
// ═══════════════════════════════════════════════════════════════

describe('validation-middleware.ts - Branch Coverage', () => {
  it('L206: requiredProperties triggers on null value', async () => {
    const { validateRequest } = await import('../../middleware/validation-middleware.js');
    const schema = {
      type: 'object' as const,
      properties: {
        data: {
          type: 'object' as const,
          requiredProperties: ['name'],
          properties: { name: { type: 'string' as const } },
        },
      },
    };
    const result = validateRequest({ data: { name: null } }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors?.some((e: any) => e.field === 'data.name')).toBe(true);
  });
});

describe('merged branch coverage', () => {
  it('validation-middleware L206: requiredProperties check', async () => {
    const { validateRequest } = await import(resolveModule('src/middleware/validation-middleware.ts'));
    const result = validateRequest(
      { nested: { other_field: 'value' } } as any,
      {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {},
            requiredProperties: ['required_field'],
          },
        },
      }
    );
    expect(result.valid).toBe(false);
  });
});

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

  describe('validateAppwriteDocumentId', () => {
    it('should pass for an ID.unique-style conversation ID', () => {
      const middleware = validateAppwriteDocumentId(['conversationId']);
      const req = { params: { conversationId: '6892f3d4a1b2c3d4e5f6' }, headers: {} } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it.each([
      ['an ID starting with a special character', '-conversation-id'],
      ['an ID containing unsupported characters', 'conversation$id'],
      ['an ID longer than 36 characters', 'a'.repeat(37)],
    ])('should reject %s', (_description, conversationId) => {
      const middleware = validateAppwriteDocumentId(['conversationId']);
      const req = { params: { conversationId }, headers: { 'x-request-id': 'request-1' } } as any;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Invalid Appwrite document ID format',
        }),
        requestId: 'request-1',
      }));
    });
  });

  describe('isValidAppwriteDocumentId', () => {
    it('should accept all supported Appwrite document ID characters', () => {
      expect(isValidAppwriteDocumentId('Conversation_1.test-id')).toBe(true);
    });

    it('should reject an empty ID', () => {
      expect(isValidAppwriteDocumentId('')).toBe(false);
    });
  });
});
