import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

jest.unstable_mockModule('helmet', () => {
  const mockMiddleware = jest.fn((_req: any, _res: any, next: any) => next());
  return { default: jest.fn(() => mockMiddleware) };
});

const {
  securityHeaders,
  requestIdMiddleware,
  httpsEnforcement,
  validateCorsOrigin,
  getAllowedOrigins,
} = await import('../security-middleware.js');

const { v4: uuidv4 } = await import('uuid') as any;

function createMockReq(overrides: Record<string, any> = {}) {
  return {
    headers: {},
    secure: false,
    hostname: 'localhost',
    url: '/',
    ...overrides,
  } as any;
}

function createMockRes(overrides: Record<string, any> = {}) {
  return {
    redirect: jest.fn(),
    setHeader: jest.fn(),
    removeHeader: jest.fn(),
    getHeader: jest.fn(),
    hasHeader: jest.fn(() => false),
    ...overrides,
  } as any;
}

function createMockNext() {
  return jest.fn();
}

describe('securityHeaders', () => {
  it('should be a function', () => {
    expect(typeof securityHeaders).toBe('function');
  });

  it('should call next when invoked with mock req/res/next', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    securityHeaders(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requestIdMiddleware', () => {
  beforeEach(() => {
    (uuidv4 as jest.Mock).mockClear();
    (uuidv4 as jest.Mock).mockReturnValue('mock-uuid-1234');
  });

  it('should add a UUID when no x-request-id header exists', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    requestIdMiddleware(req, res, next);

    expect(req.headers['x-request-id']).toBe('mock-uuid-1234');
    expect(next).toHaveBeenCalled();
  });

  it('should preserve an existing x-request-id header', () => {
    const req = createMockReq({ headers: { 'x-request-id': 'existing-id-999' } });
    const res = createMockRes();
    const next = createMockNext();

    requestIdMiddleware(req, res, next);

    expect(req.headers['x-request-id']).toBe('existing-id-999');
    expect(uuidv4).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should replace x-request-id when it is not a string', () => {
    const req = createMockReq({ headers: { 'x-request-id': ['array-value'] } });
    const res = createMockRes();
    const next = createMockNext();

    requestIdMiddleware(req, res, next);

    expect(req.headers['x-request-id']).toBe('mock-uuid-1234');
    expect(next).toHaveBeenCalled();
  });

  it('should replace x-request-id when it is an empty string', () => {
    const req = createMockReq({ headers: { 'x-request-id': '' } });
    const res = createMockRes();
    const next = createMockNext();

    requestIdMiddleware(req, res, next);

    expect(req.headers['x-request-id']).toBe('mock-uuid-1234');
    expect(next).toHaveBeenCalled();
  });
});

describe('httpsEnforcement', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env['NODE_ENV'];
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  it('should call next in non-production environment', () => {
    process.env['NODE_ENV'] = 'development';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    httpsEnforcement(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('should call next in test environment', () => {
    process.env['NODE_ENV'] = 'test';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    httpsEnforcement(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('should call next in production when request is already secure', () => {
    process.env['NODE_ENV'] = 'production';
    const req = createMockReq({ secure: true });
    const res = createMockRes();
    const next = createMockNext();

    httpsEnforcement(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('should redirect 301 in production when request is not secure', () => {
    process.env['NODE_ENV'] = 'production';
    const req = createMockReq({ secure: false, headers: { host: 'example.com' }, url: '/path' });
    const res = createMockRes();
    const next = createMockNext();

    httpsEnforcement(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/path');
    expect(next).not.toHaveBeenCalled();
  });

  it('should use hostname when host header is missing', () => {
    process.env['NODE_ENV'] = 'production';
    const req = createMockReq({ secure: false, hostname: 'fallback.host', headers: {}, url: '/api' });
    const res = createMockRes();
    const next = createMockNext();

    httpsEnforcement(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(301, 'https://fallback.host/api');
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next when x-forwarded-proto is https', () => {
    process.env['NODE_ENV'] = 'production';
    const req = createMockReq({ secure: false, headers: { 'x-forwarded-proto': 'https', host: 'example.com' } });
    const res = createMockRes();
    const next = createMockNext();

    httpsEnforcement(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('should redirect when x-forwarded-proto is http', () => {
    process.env['NODE_ENV'] = 'production';
    const req = createMockReq({ secure: false, headers: { 'x-forwarded-proto': 'http', host: 'example.com' }, url: '/' });
    const res = createMockRes();
    const next = createMockNext();

    httpsEnforcement(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('validateCorsOrigin', () => {
  it('should return false for null origin', () => {
    expect(validateCorsOrigin(null as any, ['https://example.com'])).toBe(false);
  });

  it('should return false for undefined origin', () => {
    expect(validateCorsOrigin(undefined, ['https://example.com'])).toBe(false);
  });

  it('should return false for empty string origin', () => {
    expect(validateCorsOrigin('', ['https://example.com'])).toBe(false);
  });

  it('should return false for invalid URL', () => {
    expect(validateCorsOrigin('not-a-url', ['https://example.com'])).toBe(false);
  });

  it('should return false for non-http/https protocol', () => {
    expect(validateCorsOrigin('ftp://example.com', ['ftp://example.com'])).toBe(false);
  });

  it('should return true for exact match', () => {
    expect(validateCorsOrigin('https://example.com', ['https://example.com'])).toBe(true);
  });

  it('should return false when no allowed origin matches', () => {
    expect(validateCorsOrigin('https://unknown.com', ['https://example.com'])).toBe(false);
  });

  it('should return false for empty allowed origins array', () => {
    expect(validateCorsOrigin('https://example.com', [])).toBe(false);
  });

  it('should match wildcard subdomain *.example.com against sub.example.com', () => {
    expect(validateCorsOrigin('https://sub.example.com', ['*.example.com'])).toBe(true);
  });

  it('should match wildcard subdomain with deep subdomain', () => {
    expect(validateCorsOrigin('https://a.b.example.com', ['*.example.com'])).toBe(true);
  });

  it('should NOT match wildcard subdomain *.example.com against evil-example.com', () => {
    expect(validateCorsOrigin('https://evil-example.com', ['*.example.com'])).toBe(false);
  });

  it('should NOT match wildcard subdomain *.example.com against exact domain example.com', () => {
    expect(validateCorsOrigin('https://example.com', ['*.example.com'])).toBe(false);
  });

  it('should match case-insensitively', () => {
    expect(validateCorsOrigin('https://EXAMPLE.COM', ['https://example.com'])).toBe(true);
    expect(validateCorsOrigin('https://example.com', ['https://EXAMPLE.COM'])).toBe(true);
  });

  it('should skip malformed allowed origins without throwing', () => {
    expect(validateCorsOrigin('https://example.com', ['not-a-valid-url', 'https://example.com'])).toBe(true);
  });

  it('should return false when all allowed origins are malformed', () => {
    expect(validateCorsOrigin('https://example.com', ['not-a-valid-url'])).toBe(false);
  });

  it('should match against multiple allowed origins', () => {
    const allowed = ['https://site1.com', 'https://site2.com', 'https://site3.com'];
    expect(validateCorsOrigin('https://site2.com', allowed)).toBe(true);
    expect(validateCorsOrigin('https://site4.com', allowed)).toBe(false);
  });

  it('should trim whitespace from allowed origins', () => {
    expect(validateCorsOrigin('https://example.com', ['  https://example.com  '])).toBe(true);
  });

  it('should handle wildcard with different port', () => {
    expect(validateCorsOrigin('https://sub.example.com:8443', ['*.example.com'])).toBe(true);
  });

  it('should respect port in exact match', () => {
    expect(validateCorsOrigin('https://example.com:3000', ['https://example.com:3000'])).toBe(true);
    expect(validateCorsOrigin('https://example.com:3000', ['https://example.com'])).toBe(false);
  });
});

describe('getAllowedOrigins', () => {
  let originalNodeEnv: string | undefined;
  let originalCorsOrigin: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env['NODE_ENV'];
    originalCorsOrigin = process.env['CORS_ORIGIN'];
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    if (originalCorsOrigin === undefined) {
      delete process.env['CORS_ORIGIN'];
    } else {
      process.env['CORS_ORIGIN'] = originalCorsOrigin;
    }
  });

  it('should split CORS_ORIGIN by comma when set', () => {
    process.env['CORS_ORIGIN'] = 'https://site1.com, https://site2.com, https://site3.com';
    process.env['NODE_ENV'] = 'production';

    const origins = getAllowedOrigins();

    expect(origins).toEqual(['https://site1.com', 'https://site2.com', 'https://site3.com']);
  });

  it('should trim whitespace from each origin in CORS_ORIGIN', () => {
    process.env['CORS_ORIGIN'] = '  https://site1.com  ,  https://site2.com  ';
    process.env['NODE_ENV'] = 'production';

    const origins = getAllowedOrigins();

    expect(origins).toEqual(['https://site1.com', 'https://site2.com']);
  });

  it('should filter out empty strings from CORS_ORIGIN', () => {
    process.env['CORS_ORIGIN'] = 'https://site1.com,,https://site2.com,';
    process.env['NODE_ENV'] = 'production';

    const origins = getAllowedOrigins();

    expect(origins).toEqual(['https://site1.com', 'https://site2.com']);
  });

  it('should return localhost defaults in development without CORS_ORIGIN', () => {
    delete process.env['CORS_ORIGIN'];
    process.env['NODE_ENV'] = 'development';

    const origins = getAllowedOrigins();

    expect(origins).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ]);
  });

  it('should return empty array in production without CORS_ORIGIN', () => {
    delete process.env['CORS_ORIGIN'];
    process.env['NODE_ENV'] = 'production';

    const origins = getAllowedOrigins();

    expect(origins).toEqual([]);
  });

  it('should use CORS_ORIGIN in production when set', () => {
    process.env['CORS_ORIGIN'] = 'https://prod.example.com';
    process.env['NODE_ENV'] = 'production';

    const origins = getAllowedOrigins();

    expect(origins).toEqual(['https://prod.example.com']);
  });

  it('should use CORS_ORIGIN over defaults in development when set', () => {
    process.env['CORS_ORIGIN'] = 'https://dev.example.com';
    process.env['NODE_ENV'] = 'development';

    const origins = getAllowedOrigins();

    expect(origins).toEqual(['https://dev.example.com']);
  });

  it('should handle single origin without commas', () => {
    process.env['CORS_ORIGIN'] = 'https://single.example.com';
    process.env['NODE_ENV'] = 'production';

    const origins = getAllowedOrigins();

    expect(origins).toEqual(['https://single.example.com']);
  });
});