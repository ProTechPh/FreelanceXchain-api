import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import { classifyRouteClass, recordSliSample } from '../services/sli-metrics-service.js';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  const startTime = Date.now();

  // Attach request ID to request for later use
  req.headers['x-request-id'] = requestId;

  const verbose = config.server?.verboseLogs ?? true;

  if (verbose) {
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
  }

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // Feed the SLI aggregator (availability + latency budgets per endpoint
    // class, per docs/reliability/slo.md). Best-effort and never throws:
    // metrics must not break the request path they measure.
    try {
      recordSliSample(classifyRouteClass(req.path), res.statusCode, duration);
    } catch {
      // Ignored - observability must stay fail-open.
    }

    if (!verbose) {
      // Non-verbose: only log errors and warnings, skip info-level completions
      if (res.statusCode >= 500) {
        logger.error('Request completed with error', undefined, {
          type: 'response',
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
        });
      } else if (res.statusCode >= 400) {
        logger.warn('Request completed with client error', {
          type: 'response',
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
        });
      }
      return;
    }

    const logData = {
      type: 'response',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };

    if (res.statusCode >= 500) {
      logger.error('Request completed with error', undefined, logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
}
