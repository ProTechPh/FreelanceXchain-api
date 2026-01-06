import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export type ValidationError = {
  field: string;
  message: string;
  value?: unknown;
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: ValidationError[] | undefined;
  };
  timestamp: string;
  requestId: string;
};

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: ValidationError[] | undefined;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: ValidationError[]
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error factory functions
export const errors = {
  invalidCredentials: () =>
    new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password', 401),
  
  tokenExpired: () =>
    new AppError('AUTH_TOKEN_EXPIRED', 'JWT token has expired', 401),
  
  unauthorized: (message = 'User lacks permission for this action') =>
    new AppError('AUTH_UNAUTHORIZED', message, 403),
  
  duplicateEmail: () =>
    new AppError('DUPLICATE_EMAIL', 'Email already registered', 409),
  
  duplicateProposal: () =>
    new AppError('DUPLICATE_PROPOSAL', 'Freelancer already submitted proposal for this project', 409),
  
  projectLocked: () =>
    new AppError('PROJECT_LOCKED', 'Project has accepted proposals and cannot be modified', 409),
  
  invalidSkill: (skillId: string) =>
    new AppError('INVALID_SKILL', `Skill ID ${skillId} not found in taxonomy`, 400),
  
  invalidDateRange: () =>
    new AppError('INVALID_DATE_RANGE', 'Start date must be before or equal to end date', 400),
  
  invalidRating: () =>
    new AppError('INVALID_RATING', 'Rating must be between 1 and 5', 400),
  
  milestoneSumMismatch: () =>
    new AppError('MILESTONE_SUM_MISMATCH', 'Milestone amounts must equal total budget', 400),
  
  notFound: (resource: string) =>
    new AppError('NOT_FOUND', `${resource} not found`, 404),
  
  validationError: (details: ValidationError[]) =>
    new AppError('VALIDATION_ERROR', 'Request validation failed', 400, details),
  
  geminiUnavailable: () =>
    new AppError('GEMINI_UNAVAILABLE', 'AI service temporarily unavailable', 503),
  
  blockchainError: (message: string) =>
    new AppError('BLOCKCHAIN_ERROR', message, 503),
};

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      timestamp: new Date().toISOString(),
      requestId,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error:', err);

  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    timestamp: new Date().toISOString(),
    requestId,
  };
  res.status(500).json(response);
}
