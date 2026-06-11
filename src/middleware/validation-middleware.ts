/**
 * Request Validation Middleware
 * Provides UUID validation for API request parameters
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ValidationError } from './error-handler.js';

// UUID pattern (v4)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a string is a valid UUID
 */
export function isValidUUID(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Middleware to validate UUID parameters
 * @param paramNames - Array of parameter names to validate as UUIDs (defaults to ['id'])
 */
export function validateUUID(paramNames: string[] = ['id']): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string) ?? 'unknown';
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
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid UUID format',
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

type SchemaProperty = {
  type?: string;
  format?: string;
  pattern?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  enum?: any[];
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  requiredProperties?: string[];
};

type Schema = {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
};

type ValidationResult = {
  valid: boolean;
  errors: { field: string; message: string }[];
};

/**
 * Validate a request body against a JSON schema
 */
export function validateRequest(data: any, schema: Schema): ValidationResult {
  const errors: { field: string; message: string }[] = [];

  if (!schema.properties) {
    return { valid: true, errors: [] };
  }

  // Check schema-level required array
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

    // Type validation
    if (prop.type) {
      if (prop.type === 'string' && typeof value !== 'string') {
        errors.push({ field: key, message: `"${key}" must be of type string` });
        continue;
      }
      if (prop.type === 'number' && typeof value !== 'number') {
        errors.push({ field: key, message: `"${key}" must be a number` });
        continue;
      }
      if (prop.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
        errors.push({ field: key, message: `"${key}" must be an integer` });
        continue;
      }
      if (prop.type === 'boolean' && typeof value !== 'boolean') {
        errors.push({ field: key, message: `"${key}" must be a boolean` });
        continue;
      }
      if (prop.type === 'array' && !Array.isArray(value)) {
        errors.push({ field: key, message: `"${key}" must be an array` });
        continue;
      }
      if (prop.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
        errors.push({ field: key, message: `"${key}" must be an object` });
        continue;
      }
    }

    if (prop.pattern && typeof value === 'string') {
      try {
        const regex = new RegExp(prop.pattern);
        if (!regex.test(value)) {
          errors.push({ field: key, message: `"${key}" does not match required pattern` });
        }
      } catch {
        errors.push({ field: key, message: `"${key}" pattern validation failed (invalid regex)` });
      }
    }

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

    if (prop.minItems !== undefined && Array.isArray(value) && value.length < prop.minItems) {
      errors.push({ field: key, message: `"${key}" must have at least ${prop.minItems} items` });
    }

    if (prop.maxItems !== undefined && Array.isArray(value) && value.length > prop.maxItems) {
      errors.push({ field: key, message: `"${key}" must have at most ${prop.maxItems} items` });
    }

    if (prop.enum && !prop.enum.includes(value)) {
      errors.push({ field: key, message: `"${key}" must be one of: ${prop.enum.join(', ')}` });
    }

    // Array items validation
    if (prop.items && Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (prop.items.type === 'string' && typeof item !== 'string') {
          errors.push({ field: key, message: `"${key}[${i}]" must be a string` });
        }
        if (prop.items.type === 'number' && typeof item !== 'number') {
          errors.push({ field: key, message: `"${key}[${i}]" must be a number` });
        }
      }
    }

    // Nested object validation
    if (prop.type === 'object' && prop.properties && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedKey, nestedProp] of Object.entries(prop.properties)) {
        const nestedValue = value[nestedKey];
        if (nestedProp.type === 'string' && nestedValue !== undefined && typeof nestedValue !== 'string') {
          errors.push({ field: `${key}.${nestedKey}`, message: `"${nestedKey}" must be a string` });
        }
        if (nestedProp.type === 'number' && nestedValue !== undefined && typeof nestedValue !== 'number') {
          errors.push({ field: `${key}.${nestedKey}`, message: `"${nestedKey}" must be a number` });
        }
      }
      if (prop.requiredProperties) {
        for (const reqProp of prop.requiredProperties) {
          if (value[reqProp] === undefined || value[reqProp] === null) {
            errors.push({ field: `${key}.${reqProp}`, message: `"${reqProp}" is required in "${key}"` });
          }
        }
      }
    }

    if (prop.format && typeof value === 'string') {
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
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create validation middleware from a schema (supports body, query, params)
 */
export function validate(schema: Schema | RequestSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    let valid = true;
    const allErrors: { field: string; message: string }[] = [];

    const coerceQueryParams = (query: any, schemaObj: Schema): any => {
      if (!schemaObj.properties) return query;
      const coerced: any = { ...query };
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
    };

    const requestSchema = schema as RequestSchema;
    if (requestSchema.body || requestSchema.query || requestSchema.params) {
      if (requestSchema.body) {
        const result = validateRequest(req.body, requestSchema.body);
        if (!result.valid) { valid = false; allErrors.push(...result.errors); }
      }
      if (requestSchema.query) {
        const result = validateRequest(coerceQueryParams(req.query, requestSchema.query), requestSchema.query);
        if (!result.valid) { valid = false; allErrors.push(...result.errors); }
      }
      if (requestSchema.params) {
        const result = validateRequest(req.params, requestSchema.params);
        if (!result.valid) { valid = false; allErrors.push(...result.errors); }
      }
    } else {
      const result = validateRequest(
        { ...req.body, ...req.query, ...req.params },
        schema as Schema
      );
      if (!result.valid) { valid = false; allErrors.push(...result.errors); }
    }

    if (!valid) {
      const requestId = (req.headers['x-request-id'] as string) ?? 'unknown';
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: allErrors,
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
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
    properties: {
      title: { type: 'string', required: true },
      description: { type: 'string', required: true },
      requiredSkills: { type: 'array', required: true },
      budget: { type: 'number', required: true },
      deadline: { type: 'string', format: 'date', required: true },
    },
  },
};

export const submitProposalSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      projectId: { type: 'string', required: true },
      attachments: { type: 'array', minItems: 1, required: true },
      proposedRate: { type: 'number', required: true },
      estimatedDuration: { type: 'string', required: true },
    },
  },
};

export const submitRatingSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      contractId: { type: 'string', required: true },
      rateeId: { type: 'string', required: true },
      rating: { type: 'number', minimum: 1, maximum: 5, required: true },
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
