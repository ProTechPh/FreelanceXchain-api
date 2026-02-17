# CSRF Protection Implementation Guide

## Overview

The FreelanceXchain API implements Cross-Site Request Forgery (CSRF) protection using the **double-submit cookie pattern** via the `csrf-csrf` library. This provides defense-in-depth security even though the API primarily uses JWT-based authentication.

## Why CSRF Protection with JWT?

While JWT tokens in the `Authorization` header are not vulnerable to traditional CSRF attacks, we implement CSRF protection for:

1. **Defense in Depth**: Multiple layers of security reduce overall risk
2. **Cookie-Based Sessions**: Future support for session cookies alongside JWTs
3. **State-Changing Operations**: Extra validation for critical mutations
4. **Compliance**: Meeting security audit requirements (OWASP, IAS)
5. **Browser Security**: Protection against confused deputy attacks

## Architecture

### Technology Stack
- **Library**: `csrf-csrf` (double-submit cookie pattern)
- **Token Storage**: HTTP-only cookie + request header
- **Session Binding**: IP address + User-Agent combination
- **Token Rotation**: Per-session tokens with automatic refresh

### Double-Submit Cookie Pattern

1. **Token Generation**: Server generates cryptographically secure token
2. **Cookie Storage**: Token stored in HTTP-only, SameSite cookie
3. **Header Requirement**: Client must send token in `X-CSRF-Token` header
4. **Validation**: Server compares cookie value with header value
5. **Session Binding**: Token bound to client session (IP + User-Agent)

## Configuration

### Middleware Setup

The CSRF middleware is configured in `src/middleware/csrf-middleware.ts`:

```typescript
const { doubleCsrf } = require('csrf-csrf');

const { csrfProtection, generateToken } = doubleCsrf({
  getSecret: () => config.jwt.secret,
  cookieName: '__Host-csrf-token',
  cookieOptions: {
    httpOnly: true,
    secure: config.env === 'production',
    sameSite: 'strict',
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req) => {
    return `${req.ip}-${req.get('user-agent') || 'unknown'}`;
  },
});
```

### Cookie Configuration

- **Name**: `__Host-csrf-token` (prefix enforces secure, path=/, no domain)
- **HttpOnly**: `true` (prevents JavaScript access)
- **Secure**: `true` in production (HTTPS only)
- **SameSite**: `strict` (blocks cross-site requests)
- **Path**: `/` (available to all routes)

### Protected Methods

CSRF validation is enforced for:
- `POST` - Create operations
- `PUT` - Full update operations
- `PATCH` - Partial update operations
- `DELETE` - Delete operations

Exempt methods:
- `GET` - Read operations (idempotent)
- `HEAD` - Metadata requests
- `OPTIONS` - CORS preflight requests

## API Endpoints

### Get CSRF Token

**Endpoint**: `GET /api/auth/csrf-token`  
**Authentication**: Not required  
**Description**: Generates and returns a CSRF token for the client session

**Response** (200 OK):
```json
{
  "message": "CSRF token generated successfully"
}
```

**Response Headers**:
```
Set-Cookie: __Host-csrf-token=<token_value>; HttpOnly; Secure; SameSite=Strict; Path=/
```

**Usage**:
```bash
curl -X GET https://api.freelancexchain.com/api/auth/csrf-token \
  -c cookies.txt
```

The token is automatically stored in the cookie and must be extracted for subsequent requests.

---

## Client Implementation

### Web Application (JavaScript/TypeScript)

#### 1. Fetch CSRF Token

```typescript
// Fetch CSRF token on app initialization
async function initializeCsrf() {
  const response = await fetch('/api/auth/csrf-token', {
    method: 'GET',
    credentials: 'include', // Include cookies
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch CSRF token');
  }
  
  // Token is now stored in cookie
  // Extract from cookie for header
  const csrfToken = getCsrfTokenFromCookie();
  return csrfToken;
}

function getCsrfTokenFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)__Host-csrf-token=([^;]+)/);
  return match ? match[1] : null;
}
```

#### 2. Include Token in Requests

```typescript
// Add CSRF token to all state-changing requests
async function makeProtectedRequest(url: string, method: string, data: any) {
  const csrfToken = getCsrfTokenFromCookie();
  
  if (!csrfToken) {
    throw new Error('CSRF token not found');
  }
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-CSRF-Token': csrfToken, // Include CSRF token
    },
    credentials: 'include', // Include cookies
    body: JSON.stringify(data),
  });
  
  return response;
}

// Example usage
await makeProtectedRequest('/api/contracts', 'POST', {
  title: 'New Contract',
  amount: 1000,
});
```

#### 3. Axios Interceptor (Alternative)

```typescript
import axios from 'axios';

// Add CSRF token to all requests
axios.interceptors.request.use((config) => {
  const csrfToken = getCsrfTokenFromCookie();
  
  if (csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  
  return config;
});
```

---

### Mobile Application (React Native)

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Fetch and store CSRF token
async function initializeCsrf() {
  const response = await fetch('/api/auth/csrf-token', {
    method: 'GET',
    credentials: 'include',
  });
  
  const setCookieHeader = response.headers.get('set-cookie');
  const csrfToken = extractCsrfToken(setCookieHeader);
  
  await AsyncStorage.setItem('csrf_token', csrfToken);
}

// Include token in requests
async function makeProtectedRequest(url: string, method: string, data: any) {
  const csrfToken = await AsyncStorage.getItem('csrf_token');
  const accessToken = await AsyncStorage.getItem('access_token');
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(data),
  });
  
  return response;
}
```

---

## Route Exemptions

Certain routes are exempt from CSRF validation:

### Health Checks
```typescript
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

### OAuth Callbacks
```typescript
app.post('/api/auth/callback', (req, res) => {
  // OAuth callback handling
});
```

### Webhook Endpoints
```typescript
app.post('/api/webhooks/stripe', (req, res) => {
  // Webhook signature validation instead
});
```

**Implementation**:
```typescript
// In csrf-middleware.ts
const exemptPaths = [
  '/health',
  '/api/auth/callback',
  '/api/webhooks/',
];

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Check if path is exempt
  if (exemptPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  // Apply CSRF validation
  doubleCsrfProtection(req, res, next);
};
```

---

## Error Handling

### Invalid CSRF Token

**Response** (403 Forbidden):
```json
{
  "error": {
    "code": "CSRF_VALIDATION_FAILED",
    "message": "Invalid or missing CSRF token"
  },
  "timestamp": "2026-02-18T10:30:00.000Z",
  "requestId": "abc123"
}
```

**Common Causes**:
- Missing `X-CSRF-Token` header
- Token mismatch between cookie and header
- Expired or invalid token
- Session identifier changed (IP or User-Agent)

### Missing CSRF Token

**Response** (403 Forbidden):
```json
{
  "error": {
    "code": "CSRF_TOKEN_MISSING",
    "message": "CSRF token is required for this request"
  },
  "timestamp": "2026-02-18T10:30:00.000Z",
  "requestId": "abc123"
}
```

---

## Security Considerations

### Token Entropy
- **Size**: 64 bytes (512 bits)
- **Generation**: Cryptographically secure random values
- **Collision Resistance**: Astronomically low probability of duplicates

### Session Binding
- **IP Address**: Binds token to client IP
- **User-Agent**: Binds token to browser/client
- **Purpose**: Prevents token theft and reuse from different clients

### Cookie Security
- **HttpOnly**: Prevents XSS attacks from stealing token
- **Secure**: Enforces HTTPS in production
- **SameSite=Strict**: Blocks cross-site cookie transmission
- **__Host- Prefix**: Enforces secure, path=/, no domain restrictions

### Token Rotation
- Tokens are session-scoped
- New token generated per session
- Automatic refresh on session changes

---

## Testing

### Manual Testing

1. **Get CSRF Token**:
```bash
curl -X GET https://api.freelancexchain.com/api/auth/csrf-token \
  -c cookies.txt -v
```

2. **Extract Token from Cookie**:
```bash
# View cookie file
cat cookies.txt | grep csrf-token
```

3. **Make Protected Request**:
```bash
curl -X POST https://api.freelancexchain.com/api/contracts \
  -b cookies.txt \
  -H "Authorization: Bearer <token>" \
  -H "X-CSRF-Token: <csrf_token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Contract"}'
```

4. **Test Without CSRF Token** (should fail):
```bash
curl -X POST https://api.freelancexchain.com/api/contracts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Contract"}'
```

### Integration Tests

```typescript
describe('CSRF Protection', () => {
  it('should generate CSRF token', async () => {
    const response = await request(app)
      .get('/api/auth/csrf-token')
      .expect(200);
    
    expect(response.headers['set-cookie']).toBeDefined();
    expect(response.headers['set-cookie'][0]).toContain('__Host-csrf-token');
  });
  
  it('should reject POST without CSRF token', async () => {
    await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test' })
      .expect(403);
  });
  
  it('should accept POST with valid CSRF token', async () => {
    const csrfResponse = await request(app).get('/api/auth/csrf-token');
    const csrfToken = extractCsrfToken(csrfResponse.headers['set-cookie']);
    
    await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${token}`)
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', csrfResponse.headers['set-cookie'])
      .send({ title: 'Test' })
      .expect(201);
  });
});
```

---

## Troubleshooting

### Issue: CSRF Token Always Invalid
**Cause**: Session identifier mismatch (IP or User-Agent changed)  
**Solution**: 
- Check if client is behind proxy (use X-Forwarded-For)
- Verify User-Agent is consistent across requests
- Consider relaxing session binding for mobile apps

### Issue: Token Not Found in Cookie
**Cause**: Cookie not being sent by client  
**Solution**:
- Ensure `credentials: 'include'` in fetch requests
- Verify CORS configuration allows credentials
- Check cookie domain and path settings

### Issue: CORS Errors with CSRF
**Cause**: CORS not configured to allow CSRF header  
**Solution**:
```typescript
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));
```

### Issue: Mobile App Can't Store Cookies
**Cause**: React Native doesn't support HTTP-only cookies  
**Solution**:
- Extract token from Set-Cookie header
- Store in AsyncStorage
- Manually include in X-CSRF-Token header

---

## Performance Considerations

### Token Generation Overhead
- **Impact**: Minimal (~1ms per token generation)
- **Caching**: Tokens are session-scoped, not per-request
- **Optimization**: Token reused for entire session

### Cookie Size
- **Size**: ~100 bytes per cookie
- **Impact**: Negligible on request size
- **Bandwidth**: <0.1% overhead on typical requests

---

## Compliance

### OWASP Top 10
- **A01:2021 - Broken Access Control**: CSRF protection prevents unauthorized actions
- **A05:2021 - Security Misconfiguration**: Secure cookie configuration

### IAS Checklist
- ✅ CSRF tokens enabled (csrf-csrf middleware)
- ✅ Double-submit cookie pattern implemented
- ✅ Session binding for token validation
- ✅ Secure cookie configuration (HttpOnly, Secure, SameSite)

---

## Future Enhancements

1. **Origin Validation**: Additional check of Origin/Referer headers
2. **Token Rotation**: Rotate tokens after sensitive operations
3. **Rate Limiting**: Limit CSRF token generation per IP
4. **Monitoring**: Track CSRF validation failures for security analysis
5. **Custom Token Header**: Support custom header names for flexibility

---

## References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [csrf-csrf Library Documentation](https://github.com/Psifi-Solutions/csrf-csrf)
- [Double-Submit Cookie Pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie)

---

**Last Updated**: February 18, 2026  
**Maintained By**: FreelanceXchain Security Team
