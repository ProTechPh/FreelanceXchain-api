import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  const startTime = Date.now();

  // Attach request ID to request for later use
  req.headers['x-request-id'] = requestId;

  // Log request
  console.log(JSON.stringify({
    type: 'request',
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    timestamp: new Date().toISOString(),
  }));

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(JSON.stringify({
      type: 'response',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    }));
  });

  next();
}
