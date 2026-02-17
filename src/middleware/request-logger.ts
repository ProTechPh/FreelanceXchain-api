import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger.js';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  const startTime = Date.now();

  // Attach request ID to request for later use
  req.headers['x-request-id'] = requestId;

  // Log request (without query parameters to prevent sensitive data leakage)
  logger.info('Incoming request', {
    type: 'request',
    requestId,
    method: req.method,
    path: req.path,
    // Query parameters removed - they may contain tokens or sensitive data
    userAgent: req.get('user-agent'),
    ip: req.ip,
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    
    const logData = {
      type: 'response',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };

    if (logLevel === 'error') {
      logger.error('Request completed with error', undefined, logData);
    } else if (logLevel === 'warn') {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
}
