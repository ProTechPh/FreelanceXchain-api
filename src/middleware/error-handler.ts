import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger.js';

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
  public statusCode: number;
  public code: string;
  public details?: ValidationError[] | undefined;

  constructor(code: string, message: string, statusCode: number, details?: ValidationError[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const errors = {
  notFound: (resource = 'Resource') => new AppError('NOT_FOUND', `${resource} not found`, 404),
  unauthorized: (message = 'User lacks permission for this action') => new AppError('UNAUTHORIZED', message, 403),
  forbidden: (message = 'Access denied') => new AppError('FORBIDDEN', message, 403),
  badRequest: (message = 'Bad request') => new AppError('BAD_REQUEST', message, 400),
  conflict: (message = 'Resource already exists') => new AppError('CONFLICT', message, 409),
  internal: (message = 'An unexpected error occurred') => new AppError('INTERNAL_ERROR', message, 500),
  validationError: (details: ValidationError[]) => new AppError('VALIDATION_ERROR', 'Validation failed', 400, details),
  blockchainError: (message = 'Blockchain operation failed') => new AppError('BLOCKCHAIN_ERROR', message, 503),
  tokenExpired: () => new AppError('AUTH_TOKEN_EXPIRED', 'Authentication token has expired', 401),
  invalidCredentials: (message = 'Invalid email or password') => new AppError('AUTH_INVALID_CREDENTIALS', message, 401),
  duplicateEmail: (message = 'A user with this email already exists') => new AppError('DUPLICATE_EMAIL', message, 409),
  duplicateProposal: (message = 'You have already submitted a proposal for this project') => new AppError('DUPLICATE_PROPOSAL', message, 409),
  projectLocked: (message = 'This project is locked and cannot be modified') => new AppError('PROJECT_LOCKED', message, 409),
  invalidSkill: (skillId: string) => new AppError('INVALID_SKILL', `Invalid skill: ${skillId}`, 400),
  invalidDateRange: (message = 'Invalid date range') => new AppError('INVALID_DATE_RANGE', message, 400),
  invalidRating: (message = 'Rating must be between 1 and 5') => new AppError('INVALID_RATING', message, 400),
  milestoneSumMismatch: (message = 'Milestone amounts must sum to the contract total') => new AppError('MILESTONE_SUM_MISMATCH', message, 400),
  geminiUnavailable: (message = 'AI service is temporarily unavailable') => new AppError('GEMINI_UNAVAILABLE', message, 503),
};

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Application error', err, {
        requestId,
        path: req.path,
        method: req.method,
        statusCode: err.statusCode,
        code: err.code,
      });
    } else if (err.statusCode >= 400) {
      logger.warn('Application error', {
        requestId,
        path: req.path,
        method: req.method,
        statusCode: err.statusCode,
        code: err.code,
        message: err.message,
      });
    }

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

  logger.error('Unexpected error', err, {
    requestId,
    path: req.path,
    method: req.method,
    statusCode: 500,
  });

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
