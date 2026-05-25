// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath) => path.resolve(process.cwd(), modulePath);

const { validate, addExperienceSchema } = await import('../../middleware/validation-middleware.js');

describe('Validation Middleware - date format break (line 284)', () => {
  it('should hit break when valid date string is provided', () => {
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
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
