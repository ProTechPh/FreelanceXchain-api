import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async route handler to catch unhandled rejections.
 * Express 4 does not catch rejected promises from async handlers.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
