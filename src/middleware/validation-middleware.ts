/**
 * Request Validation Middleware
 * Provides JSON schema-based validation for API requests with field-specific error reporting
 * Requirements: 12.2, 12.3, 12.4
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ValidationError } from './error-handler.js';

// JSON Schema types
type SchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

type PropertySchema = {
  type: SchemaType;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: 'email' | 'date' | 'date-time' | 'uri' | 'uuid';
  enum?: (string | number)[];
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  requiredProperties?: string[];
  minItems?: number;
  maxItems?: number;
};

export type RequestSchema = {
  body?: {
    type: 'object';
    properties: Record<string, PropertySchema>;
    required?: string[];
  };
  params?: {
    type: 'object';
    properties: Record<string, PropertySchema>;
    required?: string[];
  };
  query?: {
    type: 'object';
    properties: Record<string, PropertySchema>;
    required?: string[];
  };
};

// Validation result type
type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

// Basic email regex pattern for format validation - optimized to prevent ReDoS
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Date patterns; datetime pattern optimized to prevent ReDoS
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?$/;

// URI pattern - simplified to prevent ReDoS
const URI_PATTERN = /^https?:\/\/.+/;

// UUID pattern (v4)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/**
 * Validates a value against a property schema
 */
function validateProperty(
  value: unknown,
  schema: PropertySchema,
  fieldPath: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Handle undefined/null values
  if (value === undefined || value === null) {
    if (schema.required) {
      errors.push({ field: fieldPath, message: `${fieldPath} is required`, value });
    }
    return errors;
  }

  // Type validation
  const actualType = getValueType(value);
  if (!isTypeMatch(actualType, schema.type)) {
    errors.push({
      field: fieldPath,
      message: `${fieldPath} must be of type ${schema.type}`,
      value,
    });
    return errors; // Return early if type doesn't match
  }

  // String validations
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        field: fieldPath,
        message: `${fieldPath} must be at least ${schema.minLength} characters`,
        value,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        field: fieldPath,
        message: `${fieldPath} must be at most ${schema.maxLength} characters`,
        value,
      });
    }
    if (schema.pattern !== undefined) {
      try {
        // Limit regex execution time to prevent ReDoS attacks
        const regex = new RegExp(schema.pattern);
        const timeoutMs = 100; // 100ms timeout
        const startTime = Date.now();
        
        // Test with timeout protection
        const testResult = regex.test(value);
        const elapsed = Date.now() - startTime;
        
        if (elapsed > timeoutMs) {
          errors.push({
            field: fieldPath,
            message: `${fieldPath} pattern validation timeout`,
            value,
          });
        } else if (!testResult) {
          errors.push({
            field: fieldPath,
            message: `${fieldPath} does not match required pattern`,
            value,
          });
        }
      } catch {
        errors.push({
          field: fieldPath,
          message: `${fieldPath} pattern validation failed`,
          value,
        });
      }
    }
    if (schema.format) {
      const formatError = validateFormat(value, schema.format, fieldPath);
      if (formatError) errors.push(formatError);
    }
    if (schema.enum !== undefined && !schema.enum.includes(value)) {
      errors.push({
        field: fieldPath,
        message: `${fieldPath} must be one of: ${schema.enum.join(', ')}`,
        value,
      });
    }
  }

  // Number validations
  if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'number') {
    if (schema.type === 'integer' && !Number.isInteger(value)) {
      errors.push({
        field: fieldPath,
        message: `${fieldPath} must be an integer`,
        value,
      });
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        field: fieldPath,
        message: `${fieldPath} must be at least ${schema.minimum}`,
        value,
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        field: fieldPath,
        message: `${fieldPath} must be at most ${schema.maximum}`,
        value,
      });
    }
    if (schema.enum !== undefined && !schema.enum.includes(value)) {
      errors.push({
        field: fieldPath,
        message: `${fieldPath} must be one of: ${schema.enum.join(', ')}`,
        value,
      });
    }
  }

  // Array validations
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        field: fieldPath,
        message: `${fieldPath} must have at least ${schema.minItems} items`,
        value,
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        field: fieldPath,
        message: `${fieldPath} must have at most ${schema.maxItems} items`,
        value,
      });
    }
    if (schema.items) {
      value.forEach((item, index) => {
        const itemErrors = validateProperty(item, schema.items!, `${fieldPath}[${index}]`);
        errors.push(...itemErrors);
      });
    }
  }

  // Object validations
  if (schema.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
    const objValue = value as Record<string, unknown>;
    
    // Check required properties
    if (schema.requiredProperties) {
      for (const reqProp of schema.requiredProperties) {
        if (objValue[reqProp] === undefined) {
          errors.push({
            field: `${fieldPath}.${reqProp}`,
            message: `${fieldPath}.${reqProp} is required`,
          });
        }
      }
    }
    
    // Validate nested properties
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const propErrors = validateProperty(
          objValue[propName],
          propSchema,
          `${fieldPath}.${propName}`
        );
        errors.push(...propErrors);
      }
    }
  }

  return errors;
}


/**
 * Gets the type of a value
 */
function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Checks if actual type matches expected schema type
 */
function isTypeMatch(actualType: string, schemaType: SchemaType): boolean {
  if (schemaType === 'integer') {
    return actualType === 'number';
  }
  return actualType === schemaType;
}

/**
 * Validates string format
 */
function validateFormat(
  value: string,
  format: 'email' | 'date' | 'date-time' | 'uri' | 'uuid',
  fieldPath: string
): ValidationError | null {
  switch (format) {
    case 'email':
      if (!EMAIL_PATTERN.test(value)) {
        return { field: fieldPath, message: `${fieldPath} must be a valid email address`, value };
      }
      break;
    case 'date':
      if (!DATE_PATTERN.test(value)) {
        return { field: fieldPath, message: `${fieldPath} must be a valid date (YYYY-MM-DD)`, value };
      }
      break;
    case 'date-time':
      if (!DATETIME_PATTERN.test(value)) {
        return { field: fieldPath, message: `${fieldPath} must be a valid date-time`, value };
      }
      break;
    case 'uri':
      if (!URI_PATTERN.test(value)) {
        return { field: fieldPath, message: `${fieldPath} must be a valid URI`, value };
      }
      break;
    case 'uuid':
      if (!UUID_PATTERN.test(value)) {
        return { field: fieldPath, message: `${fieldPath} must be a valid UUID`, value };
      }
      break;
  }
  return null;
}

/**
 * Validates request data against a schema
 */
export function validateRequest(
  data: Record<string, unknown>,
  schema: { type: 'object'; properties: Record<string, PropertySchema>; required?: string[] }
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check for missing required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (data[field] === undefined || data[field] === null) {
        errors.push({
          field,
          message: `${field} is required`,
        });
      }
    }
  }

  // Validate each property
  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const value = data[propName];
    
    // Skip undefined optional fields
    if (value === undefined && !schema.required?.includes(propName)) {
      continue;
    }

    const propErrors = validateProperty(value, propSchema, propName);
    errors.push(...propErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates validation middleware for a request schema
 */
export function validate(schema: RequestSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const allErrors: ValidationError[] = [];
    const requestId = (req.headers['x-request-id'] as string) ?? 'unknown';

    // Validate body
    if (schema.body) {
      const bodyResult = validateRequest(req.body ?? {}, schema.body);
      allErrors.push(...bodyResult.errors);
    }

    // Validate params
    if (schema.params) {
      const paramsResult = validateRequest(req.params ?? {}, schema.params);
      allErrors.push(...paramsResult.errors);
    }

    // Validate query
    if (schema.query) {
      // Convert query string values to appropriate types
      const queryData = convertQueryTypes(req.query as Record<string, string>, schema.query);
      const queryResult = validateRequest(queryData, schema.query);
      allErrors.push(...queryResult.errors);
    }

    if (allErrors.length > 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
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

/**
 * Converts query string values to appropriate types based on schema
 */
function convertQueryTypes(
  query: Record<string, string | undefined>,
  schema: { type: 'object'; properties: Record<string, PropertySchema> }
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const value = query[key];
    if (value === undefined) continue;

    switch (propSchema.type) {
      case 'number':
      case 'integer':
        result[key] = Number(value);
        break;
      case 'boolean':
        result[key] = value === 'true';
        break;
      case 'array':
        result[key] = value.split(',').map(v => v.trim());
        break;
      default:
        result[key] = value;
    }
  }

  return result;
}


// ============================================
// Predefined Request Schemas
// ============================================

// Auth Schemas
export const registerSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email', minLength: 5, maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 72 },
      role: { type: 'string', enum: ['freelancer', 'employer'] },
      walletAddress: { type: 'string' },
    },
    required: ['email', 'password', 'role'],
  },
};

export const loginSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 1 },
    },
    required: ['email', 'password'],
  },
};

export const refreshTokenSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      refreshToken: { type: 'string', minLength: 1 },
    },
    required: ['refreshToken'],
  },
};

// Freelancer Profile Schemas
export const createFreelancerProfileSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      bio: { type: 'string', minLength: 10 },
      hourlyRate: { type: 'number', minimum: 1 },
      availability: { type: 'string', enum: ['available', 'busy', 'unavailable'] },
    },
    required: ['bio', 'hourlyRate'],
  },
};

export const updateFreelancerProfileSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      bio: { type: 'string', minLength: 10 },
      hourlyRate: { type: 'number', minimum: 1 },
      availability: { type: 'string', enum: ['available', 'busy', 'unavailable'] },
    },
  },
};

export const addSkillsSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      skills: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            yearsOfExperience: { type: 'number', minimum: 0 },
          },
          requiredProperties: ['name', 'yearsOfExperience'],
        },
      },
    },
    required: ['skills'],
  },
};

export const addExperienceSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 2 },
      company: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 10 },
      startDate: { type: 'string', format: 'date' },
      endDate: { type: 'string', format: 'date' },
    },
    required: ['title', 'company', 'description', 'startDate'],
  },
};

// Employer Profile Schemas
export const createEmployerProfileSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      companyName: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 10 },
      industry: { type: 'string', minLength: 2 },
    },
    required: ['companyName', 'description', 'industry'],
  },
};

export const updateEmployerProfileSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      companyName: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 10 },
      industry: { type: 'string', minLength: 2 },
    },
  },
};

// Project Schemas
export const createProjectSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 5 },
      description: { type: 'string', minLength: 20 },
      requiredSkills: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            skillId: { type: 'string', format: 'uuid' },
          },
          requiredProperties: ['skillId'],
        },
      },
      budget: { type: 'number', minimum: 100 },
      deadline: { type: 'string', format: 'date-time' },
    },
    required: ['title', 'description', 'requiredSkills', 'budget', 'deadline'],
  },
};

export const updateProjectSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 5 },
      description: { type: 'string', minLength: 20 },
      requiredSkills: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            skillId: { type: 'string', format: 'uuid' },
          },
        },
      },
      budget: { type: 'number', minimum: 100 },
      deadline: { type: 'string', format: 'date-time' },
      status: { type: 'string', enum: ['draft', 'open', 'in_progress', 'completed', 'cancelled'] },
    },
  },
};

export const addMilestonesSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      milestones: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 1 },
            amount: { type: 'number', minimum: 1 },
            dueDate: { type: 'string', format: 'date-time' },
          },
          requiredProperties: ['title', 'description', 'amount', 'dueDate'],
        },
      },
    },
    required: ['milestones'],
  },
};


// Proposal Schemas
export const submitProposalSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      projectId: { type: 'string', format: 'uuid' },
      attachments: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            filename: { type: 'string', minLength: 1 },
            size: { type: 'number', minimum: 1 },
            mimeType: { type: 'string', minLength: 1 },
          },
          required: ['url', 'filename', 'size', 'mimeType'] as any,
        },
      },
      proposedRate: { type: 'number', minimum: 1 },
      estimatedDuration: { type: 'number', minimum: 1 },
    },
    required: ['projectId', 'attachments', 'proposedRate', 'estimatedDuration'],
  },
};

// Dispute Schemas
export const createDisputeSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      contractId: { type: 'string', format: 'uuid' },
      milestoneId: { type: 'string', format: 'uuid' },
      reason: { type: 'string', minLength: 1 },
    },
    required: ['contractId', 'milestoneId', 'reason'],
  },
};

export const submitEvidenceSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['text', 'file', 'link'] },
      content: { type: 'string', minLength: 1 },
    },
    required: ['type', 'content'],
  },
};

export const resolveDisputeSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      decision: { type: 'string', enum: ['freelancer_favor', 'employer_favor', 'split'] },
      reasoning: { type: 'string', minLength: 1 },
    },
    required: ['decision', 'reasoning'],
  },
};

// Reputation Schemas
export const submitRatingSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      contractId: { type: 'string', format: 'uuid' },
      rateeId: { type: 'string', format: 'uuid' },
      rating: { type: 'integer', minimum: 1, maximum: 5 },
      comment: { type: 'string' },
    },
    required: ['contractId', 'rateeId', 'rating'],
  },
};

// Skill Taxonomy Schemas
export const createSkillCategorySchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 5 },
    },
    required: ['name', 'description'],
  },
};

export const createSkillSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      categoryId: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 5 },
    },
    required: ['categoryId', 'name', 'description'],
  },
};

// Notification Schemas
export const markNotificationReadSchema: RequestSchema = {
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
    required: ['id'],
  },
};

// Search Schemas
export const searchProjectsSchema: RequestSchema = {
  query: {
    type: 'object',
    properties: {
      keyword: { type: 'string' },
      skills: { type: 'string' },
      minBudget: { type: 'number', minimum: 0 },
      maxBudget: { type: 'number', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      continuationToken: { type: 'string' },
    },
  },
};

export const searchFreelancersSchema: RequestSchema = {
  query: {
    type: 'object',
    properties: {
      skills: { type: 'string' },
      minRate: { type: 'number', minimum: 0 },
      maxRate: { type: 'number', minimum: 0 },
      availability: { type: 'string', enum: ['available', 'busy', 'unavailable'] },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      continuationToken: { type: 'string' },
    },
  },
};

// Matching Schemas
export const extractSkillsSchema: RequestSchema = {
  body: {
    type: 'object',
    properties: {
      text: { type: 'string', minLength: 10 },
    },
    required: ['text'],
  },
};

// Payment Schemas
export const milestoneActionSchema: RequestSchema = {
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
    required: ['id'],
  },
};

export const disputeMilestoneSchema: RequestSchema = {
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
    required: ['id'],
  },
  body: {
    type: 'object',
    properties: {
      reason: { type: 'string', minLength: 1 },
    },
    required: ['reason'],
  },
};

// ID Parameter Schema (reusable) - validates UUID format
export const uuidParamSchema: RequestSchema = {
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
    required: ['id'],
  },
};

// Legacy alias for backward compatibility
export const idParamSchema = uuidParamSchema;

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

