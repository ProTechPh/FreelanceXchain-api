import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ValidationError } from './error-handler.js';
import { getRequestId, sendErrorResponse } from '../utils/response-helpers.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPWRITE_DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

export function isValidUUID(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isValidAppwriteDocumentId(value: string): boolean {
  return APPWRITE_DOCUMENT_ID_PATTERN.test(value);
}

export function validateUUID(paramNames: string[] = ['id']): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = getRequestId(req);
    const errors: ValidationError[] = [];

    for (const paramName of paramNames) {
      const value = req.params[paramName];
      if (value && !isValidUUID(value)) {
        errors.push({
          field: paramName,
          message: `${paramName} must be a valid UUID`,
          value,
        });
      }
    }

    if (errors.length > 0) {
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid UUID format', { requestId, details: errors });
      return;
    }

    next();
  };
}

export function validateAppwriteDocumentId(paramNames: string[] = ['id']): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string) ?? 'unknown';
    const errors: ValidationError[] = [];

    for (const paramName of paramNames) {
      const value = req.params[paramName];
      if (value && !isValidAppwriteDocumentId(value)) {
        errors.push({
          field: paramName,
          message: `${paramName} must be a valid Appwrite document ID`,
          value,
        });
      }
    }

    if (errors.length > 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid Appwrite document ID format',
          details: errors,
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    next();
  };
}

export type SchemaProperty = {
  type?: string;
  format?: string;
  pattern?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  enum?: unknown[];
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  requiredProperties?: string[];
};

export type SchemaFiles = {
  /** Field name the upload middleware reads files from. */
  fieldName: string;
  minItems: number;
  maxItems: number;
  description: string;
};

export type Schema = {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  /** When false, keys not declared in `properties` are rejected. */
  additionalProperties?: boolean;
  /**
   * File-upload field metadata for multipart endpoints. Files arrive via
   * multer (`req.files`), never in the body, so this is schema-level metadata
   * rather than a `properties` entry — it feeds the OpenAPI generator (and any
   * future file-count enforcement) without affecting body validation.
   */
  files?: SchemaFiles;
};

type FieldError = { field: string; message: string };

type ValidationResult = {
  valid: boolean;
  errors: FieldError[];
};

/**
 * Validate the declared type of a property value.
 * Returns an error message, or null when the value passes.
 */
function validatePropertyType(key: string, value: unknown, prop: SchemaProperty): string | null {
  switch (prop.type) {
    case 'string':
      return typeof value === 'string' ? null : `"${key}" must be of type string`;
    case 'number':
      return typeof value === 'number' ? null : `"${key}" must be a number`;
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value) ? null : `"${key}" must be an integer`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `"${key}" must be a boolean`;
    case 'array':
      return Array.isArray(value) ? null : `"${key}" must be an array`;
    case 'object':
      return typeof value === 'object' && !Array.isArray(value) ? null : `"${key}" must be an object`;
    default:
      return null;
  }
}

function validatePattern(key: string, value: unknown, prop: SchemaProperty, errors: FieldError[]): void {
  if (!prop.pattern || typeof value !== 'string') return;

  try {
    const regex = new RegExp(prop.pattern);
    if (!regex.test(value)) {
      errors.push({ field: key, message: `"${key}" does not match required pattern` });
    }
  } catch {
    errors.push({ field: key, message: `"${key}" pattern validation failed (invalid regex)` });
  }
}

function validateLengthAndBounds(key: string, value: unknown, prop: SchemaProperty, errors: FieldError[]): void {
  if (prop.minLength !== undefined && typeof value === 'string' && value.length < prop.minLength) {
    errors.push({ field: key, message: `"${key}" must be at least ${prop.minLength} characters` });
  }

  if (prop.maxLength !== undefined && typeof value === 'string' && value.length > prop.maxLength) {
    errors.push({ field: key, message: `"${key}" must be at most ${prop.maxLength} characters` });
  }

  if (prop.minimum !== undefined && typeof value === 'number' && value < prop.minimum) {
    errors.push({ field: key, message: `"${key}" must be at least ${prop.minimum}` });
  }

  if (prop.maximum !== undefined && typeof value === 'number' && value > prop.maximum) {
    errors.push({ field: key, message: `"${key}" must be at most ${prop.maximum}` });
  }

  if (prop.exclusiveMinimum !== undefined && typeof value === 'number' && value <= prop.exclusiveMinimum) {
    errors.push({ field: key, message: `"${key}" must be greater than ${prop.exclusiveMinimum}` });
  }

  if (prop.exclusiveMaximum !== undefined && typeof value === 'number' && value >= prop.exclusiveMaximum) {
    errors.push({ field: key, message: `"${key}" must be less than ${prop.exclusiveMaximum}` });
  }

  if (prop.minItems !== undefined && Array.isArray(value) && value.length < prop.minItems) {
    errors.push({ field: key, message: `"${key}" must have at least ${prop.minItems} items` });
  }

  if (prop.maxItems !== undefined && Array.isArray(value) && value.length > prop.maxItems) {
    errors.push({ field: key, message: `"${key}" must have at most ${prop.maxItems} items` });
  }
}

function validateEnum(key: string, value: unknown, prop: SchemaProperty, errors: FieldError[]): void {
  if (prop.enum && !prop.enum.includes(value)) {
    errors.push({ field: key, message: `"${key}" must be one of: ${prop.enum.join(', ')}` });
  }
}

function validateItems(key: string, value: unknown, prop: SchemaProperty, errors: FieldError[]): void {
  if (!prop.items || !Array.isArray(value)) return;

  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (prop.items.type === 'string' && typeof item !== 'string') {
      errors.push({ field: key, message: `"${key}[${i}]" must be a string` });
      continue;
    }
    if (prop.items.type === 'number' && typeof item !== 'number') {
      errors.push({ field: key, message: `"${key}[${i}]" must be a number` });
      continue;
    }

    // Recurse into object items so per-item fields (e.g. milestone title/amount)
    // get the same validation as property-level nested objects.
    if (prop.items.type === 'object' && typeof item === 'object' && !Array.isArray(item) && prop.items.properties) {
      validateObjectFields(`${key}[${i}]`, item as Record<string, unknown>, prop.items, errors);
    }
  }
}

/**
 * Validate the fields of an object value against an object schema property.
 * Shared by property-level nested objects and object array items.
 */
function validateObjectFields(
  objectKey: string,
  objectValue: Record<string, unknown>,
  prop: SchemaProperty,
  errors: FieldError[],
): void {
  for (const [nestedKey, nestedProp] of Object.entries(prop.properties ?? {})) {
    const nestedValue = objectValue[nestedKey];

    if (nestedProp.required === true && (nestedValue === undefined || nestedValue === null)) {
      errors.push({ field: `${objectKey}.${nestedKey}`, message: `"${nestedKey}" is required` });
      continue;
    }

    if (nestedValue === undefined || nestedValue === null) continue;

    validateProperty(`${objectKey}.${nestedKey}`, nestedValue, nestedProp, errors);
  }

  if (prop.requiredProperties) {
    for (const reqProp of prop.requiredProperties) {
      if (objectValue[reqProp] === undefined || objectValue[reqProp] === null) {
        errors.push({ field: `${objectKey}.${reqProp}`, message: `"${reqProp}" is required in "${objectKey}"` });
      }
    }
  }
}

function validateNestedObject(key: string, value: unknown, prop: SchemaProperty, errors: FieldError[]): void {
  if (prop.type !== 'object' || typeof value !== 'object' || Array.isArray(value)) return;

  validateObjectFields(key, value as Record<string, unknown>, prop, errors);
}

function validateFormat(key: string, value: unknown, prop: SchemaProperty, errors: FieldError[]): void {
  if (!prop.format || typeof value !== 'string') return;

  if (prop.format === 'date') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(value) || isNaN(Date.parse(value))) {
      errors.push({ field: key, message: `"${key}" must be a valid date` });
    }
  }
  if (prop.format === 'date-time') {
    if (isNaN(Date.parse(value))) {
      errors.push({ field: key, message: `"${key}" must be a valid date-time` });
    }
  }
  if (prop.format === 'uuid') {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      errors.push({ field: key, message: `"${key}" must be a valid UUID` });
    }
  }
  if (prop.format === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push({ field: key, message: `"${key}" must be a valid email` });
    }
  }
  if (prop.format === 'uri') {
    try {
      new URL(value);
    } catch {
      errors.push({ field: key, message: `"${key}" must be a valid URI` });
    }
  }
}

/**
 * Validate a single property against its schema constraints.
 */
function validateProperty(key: string, value: unknown, prop: SchemaProperty, errors: FieldError[]): void {
  const typeError = validatePropertyType(key, value, prop);
  if (typeError) {
    errors.push({ field: key, message: typeError });
    return;
  }

  validatePattern(key, value, prop, errors);
  validateLengthAndBounds(key, value, prop, errors);
  validateEnum(key, value, prop, errors);
  validateItems(key, value, prop, errors);
  validateNestedObject(key, value, prop, errors);
  validateFormat(key, value, prop, errors);
}

export function validateRequest(data: Record<string, unknown> | undefined, schema: Schema): ValidationResult {
  const errors: FieldError[] = [];

  if (schema.additionalProperties === false && data && typeof data === 'object' && !Array.isArray(data)) {
    const declaredKeys = new Set(Object.keys(schema.properties ?? {}));
    for (const key of Object.keys(data)) {
      if (!declaredKeys.has(key)) {
        errors.push({ field: key, message: `"${key}" is not an allowed field` });
      }
    }
  }

  if (!schema.properties) {
    return { valid: errors.length === 0, errors };
  }

  if (schema.required) {
    for (const field of schema.required) {
      if (data?.[field] === undefined || data?.[field] === null) {
        errors.push({ field, message: `"${field}" is required` });
      }
    }
  }

  for (const [key, prop] of Object.entries(schema.properties)) {
    const value = data?.[key];

    if (prop.required && (value === undefined || value === null)) {
      errors.push({ field: key, message: `"${key}" is required` });
      continue;
    }

    if (value === undefined || value === null) continue;

    validateProperty(key, value, prop, errors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Count the uploaded files on a request. `upload.array` produces an array;
 * `upload.fields` produces an object of arrays. Anything else counts as zero
 * files so a missing upload fails the minimum rather than passing it.
 */
function countUploadedFiles(req: Request): number {
  const files = (req as Request & { files?: unknown }).files;
  if (Array.isArray(files)) return files.length;
  if (files && typeof files === 'object') {
    return Object.values(files).reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0);
  }
  return 0;
}

/**
 * Enforce the file-count bounds declared in `schema.files` against the files
 * attached to the request. Returns true when a bound was violated. The upload
 * middleware and the schema share this metadata, so they can never disagree
 * about how many files an endpoint accepts.
 */
function validateFileCounts(req: Request, schema: Schema, errors: FieldError[]): boolean {
  if (!schema.files) return false;

  const { fieldName, minItems, maxItems } = schema.files;
  const count = countUploadedFiles(req);

  if (count < minItems) {
    errors.push({ field: fieldName, message: `"${fieldName}" must have at least ${minItems} file(s)` });
    return true;
  }
  if (count > maxItems) {
    errors.push({ field: fieldName, message: `"${fieldName}" must have at most ${maxItems} file(s)` });
    return true;
  }
  return false;
}

/**
 * Coerce string values (query params or multipart form fields) to the types the
 * schema declares, leaving values that fail to parse untouched so validation
 * reports them.
 */
function coerceStringValues(value: Record<string, unknown>, schemaObj: Schema): Record<string, unknown> {
  if (!schemaObj.properties) return value;
  const coerced: Record<string, unknown> = { ...value };
  for (const [key, prop] of Object.entries(schemaObj.properties)) {
    if (coerced[key] === undefined) continue;
    if (prop.type === 'number' && typeof coerced[key] === 'string') {
      const n = Number(coerced[key]);
      if (!isNaN(n)) coerced[key] = n;
    }
    if (prop.type === 'integer' && typeof coerced[key] === 'string') {
      const n = Number(coerced[key]);
      if (!isNaN(n) && Number.isInteger(n)) coerced[key] = n;
    }
    if (prop.type === 'boolean' && typeof coerced[key] === 'string') {
      if (coerced[key] === 'true') coerced[key] = true;
      else if (coerced[key] === 'false') coerced[key] = false;
    }
    if (prop.type === 'array' && typeof coerced[key] === 'string') {
      coerced[key] = coerced[key].split(',').map((s: string) => s.trim());
    }
  }
  return coerced;
}

export function validate(schema: Schema | RequestSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    let valid = true;
    const allErrors: FieldError[] = [];

    const requestSchema = schema as RequestSchema;
    if (requestSchema.body || requestSchema.query || requestSchema.params) {
      if (requestSchema.body) {
        // Multipart form-data arrives as strings; coerce per the declared types
        // and write the coerced values back so handlers see real types.
        if (requestSchema.coerceBody === true && req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
          req.body = coerceStringValues(req.body, requestSchema.body);
        }
        const result = validateRequest(req.body, requestSchema.body);
        if (!result.valid) { valid = false; allErrors.push(...result.errors); }

        // Files arrive via multer (req.files), so the schema's `files` metadata
        // is enforced here rather than inside validateRequest.
        if (validateFileCounts(req, requestSchema.body, allErrors)) valid = false;
      }
      if (requestSchema.query) {
        const result = validateRequest(coerceStringValues(req.query, requestSchema.query), requestSchema.query);
        if (!result.valid) { valid = false; allErrors.push(...result.errors); }
      }
      if (requestSchema.params) {
        const result = validateRequest(req.params, requestSchema.params);
        if (!result.valid) { valid = false; allErrors.push(...result.errors); }
      }
    } else {
      // Pick only schema-defined fields from each source to prevent mass assignment
      const schemaObj = schema as Schema;
      const allowedKeys = schemaObj.properties ? Object.keys(schemaObj.properties) : [];
      const merged: Record<string, unknown> = {};
      for (const key of allowedKeys) {
        if (req.body[key] !== undefined) merged[key] = req.body[key];
        else if (req.query[key] !== undefined) merged[key] = req.query[key];
        else if (req.params[key] !== undefined) merged[key] = req.params[key];
      }
      const result = validateRequest(merged, schema as Schema);
      if (!result.valid) { valid = false; allErrors.push(...result.errors); }

      // A plain schema may also declare file-upload metadata.
      if (validateFileCounts(req, schemaObj, allErrors)) valid = false;
    }

    if (!valid) {
      const requestId = getRequestId(req);
      sendErrorResponse(res, 400, 'VALIDATION_ERROR', 'Validation failed', { requestId, details: allErrors });
      return;
    }

    next();
  };
}

// Common schemas for testing
export const addExperienceSchema: Schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    company: { type: 'string' },
    description: { type: 'string' },
    startDate: { type: 'string', format: 'date' },
  },
};

export type RequestSchema = {
  body?: Schema;
  query?: Schema;
  params?: Schema;
  /** Coerce string body values (multipart/form-data) to the schema-declared types before validating. */
  coerceBody?: boolean;
};

export const registerSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', required: true },
      password: { type: 'string', minLength: 8, required: true },
      role: { type: 'string', enum: ['freelancer', 'employer'], required: true },
      name: { type: 'string' },
    },
  },
};

export const loginSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      email: { type: 'string', required: true },
      password: { type: 'string', required: true },
    },
  },
};

export const createProjectSchema: RequestSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 5, required: true },
      description: { type: 'string', minLength: 20, required: true },
      requiredSkills: { type: 'array', minItems: 1, required: true },
      budget: { type: 'number', exclusiveMinimum: 0, required: true },
      deadline: { type: 'string', required: true },
      tags: { type: 'array', maxItems: 10, items: { type: 'string' } },
      isRush: { type: 'boolean' },
      rushFeePercentage: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
    },
  },
};

export const createProjectWithAttachmentsSchema: RequestSchema = {
  coerceBody: true,
  body: {
    type: 'object',
    additionalProperties: false,
    files: {
      fieldName: 'files',
      minItems: 0,
      maxItems: 10,
      description: 'Optional reference materials (0-10 files, max 10MB each)',
    },
    properties: {
      title: { type: 'string', minLength: 5, required: true },
      description: { type: 'string', minLength: 20, required: true },
      // requiredSkills and tags arrive as JSON strings in multipart form-data;
      // the handler parses them (deep checks stay in the route).
      requiredSkills: { type: 'string', required: true },
      budget: { type: 'number', exclusiveMinimum: 0, required: true },
      deadline: { type: 'string', required: true },
      tags: { type: 'string' },
      isRush: { type: 'boolean' },
      rushFeePercentage: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
    },
  },
};

export const updateProjectSchema: RequestSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 5 },
      description: { type: 'string', minLength: 20 },
      requiredSkills: { type: 'array', minItems: 1 },
      budget: { type: 'number', exclusiveMinimum: 0 },
      deadline: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'open', 'in_progress', 'completed', 'cancelled', 'disputed'] },
      isRush: { type: 'boolean' },
      rushFeePercentage: { type: 'number', exclusiveMinimum: 0, maximum: 100 },
    },
  },
};

export const addMilestonesSchema: RequestSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      milestones: {
        type: 'array',
        minItems: 1,
        required: true,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', required: true },
            description: { type: 'string', required: true },
            amount: { type: 'number', exclusiveMinimum: 0, required: true },
            dueDate: { type: 'string', required: true },
          },
        },
      },
    },
  },
};

export const submitProposalSchema: RequestSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      projectId: { type: 'string', required: true },
      attachments: { type: 'array', minItems: 1, required: true },
      proposedRate: { type: 'number', minimum: 1, required: true },
      estimatedDuration: { type: 'number', minimum: 1, required: true },
    },
  },
};

export const submitProposalMultipartSchema: RequestSchema = {
  coerceBody: true,
  body: {
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
      // Attachments arrive as files (req.files), not body fields.
      proposedRate: { type: 'number', minimum: 1, required: true },
      estimatedDuration: { type: 'number', minimum: 1, required: true },
    },
  },
};

export const sendMessageSchema: RequestSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      receiverId: { type: 'string', required: true },
      content: { type: 'string', required: true },
      attachments: { type: 'array' },
    },
  },
};

/** Endpoints that accept no request body: any body key is rejected. */
export const emptyBodySchema: RequestSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
};

export const submitRatingSchema: RequestSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      contractId: { type: 'string', format: 'uuid', required: true },
      rateeId: { type: 'string', format: 'uuid', required: true },
      rating: { type: 'number', minimum: 1, maximum: 5, required: true },
      comment: { type: 'string' },
    },
  },
};

export const submitReviewSchema: RequestSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      contractId: { type: 'string', required: true },
      rating: { type: 'number', minimum: 1, maximum: 5, required: true },
      comment: { type: 'string', minLength: 1, required: true },
      workQuality: { type: 'number', minimum: 1, maximum: 5 },
      communication: { type: 'number', minimum: 1, maximum: 5 },
      professionalism: { type: 'number', minimum: 1, maximum: 5 },
      wouldWorkAgain: { type: 'boolean' },
    },
  },
};

export const updateFreelancerProfileSchema: RequestSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      bio: { type: 'string', minLength: 10 },
      hourlyRate: { type: 'number', minimum: 1 },
      availability: { type: 'string', enum: ['available', 'busy', 'unavailable'] },
    },
  },
};

export const createFreelancerProfileSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      bio: { type: 'string' },
      hourlyRate: { type: 'number', minimum: 1 },
    },
  },
};
