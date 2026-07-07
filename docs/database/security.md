# Security Documentation

## Table of Contents

1. [API Security Measures](#api-security-measures)
2. [Authentication Security](#authentication-security)
3. [CSRF Protection](#csrf-protection)
4. [Database Security & Row Level Security](#database-security--row-level-security)
5. [Data Privacy & KYC Protection](#data-privacy--kyc-protection)
6. [Role-Based Access Control](#role-based-access-control)
7. [Smart Contract Security](#smart-contract-security)
8. [Security Considerations](#security-considerations)

---

## API Security Measures

### HTTP Header Hardening with Helmet.js

The API uses Helmet.js middleware to set security headers on all responses:

- **X-Frame-Options**: DENY -- prevents clickjacking
- **X-Content-Type-Options**: nosniff -- prevents MIME sniffing
- **X-XSS-Protection**: Enabled -- browser XSS filters
- **Strict-Transport-Security (HSTS)**: max-age 31536000, includes subdomains and preload
- **Referrer-Policy**: strict-origin-when-cross-origin
- **X-Powered-By**: Removed to hide server technology

**Content Security Policy (CSP)**: Restrictive directive set limiting content to same origin by default. Scripts from same origin with `unsafe-inline` for Swagger UI and Appwrite. `connect-src` permits Appwrite database connections only.

Each request receives a UUID v4 request ID for logging and debugging.

### Rate Limiting and DDoS Protection

Three rate limiting profiles, tracked per client IP:

| Profile | Limit | Use Case |
| ------- | ------- | ---------- |
| **authRateLimiter** | 10 attempts / 15 min | Login, registration |
| **apiRateLimiter** | 100 requests / min | General API usage |
| **sensitiveRateLimiter** | 5 attempts / hour | High-risk operations |

IP is extracted from `X-Forwarded-For` when behind a proxy. Exceeded limits return `429 Too Many Requests` with a `Retry-After` header.

### Input Validation

JSON schema-based validation covers request bodies, URL parameters, and query strings. Each schema defines types, lengths, patterns, formats, and custom business rules.

**Validation schemas exist for:**

- **KYC Data**: Names, dates of birth, address format/length
- **Contract Data**: Financial amounts, dates, milestones
- **Authentication Data**: Email format, password strength, roles
- **Financial Data**: Budget amounts, hourly rates, payment minimums
- **Date/Time**: Regex-validated formatting
- **UUID Parameters**: All identifier-based requests use validated UUIDs

Validation errors return structured responses with field-specific details without exposing system internals.

### Error Handling

A custom `AppError` class standardizes error codes, messages, and HTTP status codes across all endpoints.

**Standard error response format:**

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {}
  },
  "timestamp": "ISO 8601",
  "requestId": "UUID"
}
```

**Error codes:**

| Code | Status | Meaning |
| ------ | -------- | --------- |
| `VALIDATION_ERROR` | 400 | Input validation failure |
| `UNAUTHORIZED` | 401 | Missing or invalid auth |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit hit |
| `NOT_FOUND` | 404 | Resource not found |
| `INTERNAL_ERROR` | 500 | Generic server error |

### CORS Configuration

CORS is configured with a whitelist of allowed origins:

- **Production**: Domains from `CORS_ORIGIN` env variable
- **Development**: localhost domains
- **Allowed Methods**: GET, POST, PUT, PATCH, DELETE, OPTIONS
- **Allowed Headers**: Content-Type, Authorization, X-Request-ID
- **Credentials**: Enabled
- **Wildcard Subdomains**: Supported via pattern matching (e.g., `*.example.com`)

Missing or non-whitelisted origins are rejected in production with 403; development logs a warning and allows.

### OWASP Top 10 Mitigation

| Vulnerability | Mitigation |
| --------------- | ------------ |
| **Injection** | Appwrite parameterized queries, schema validation, type checking |
| **Broken Authentication** | Rate limiting (10/15min), strong password policies, JWT with refresh tokens |
| **Sensitive Data Exposure** | HTTPS enforcement, HSTS, data minimization, generic error messages |
| **XXE** | JSON-only API (no XML), secure body parsing |
| **Broken Access Control** | `requireRole` middleware, ownership verification, UUID validation |
| **Security Misconfiguration** | Secure defaults, Helmet.js, generic production errors |
| **XSS** | CSP, XSS filter headers, input validation |
| **Insecure Deserialization** | JSON-only with schema validation |
| **Known Vulnerabilities** | Regular dependency updates, version pinning, security audits |
| **Insufficient Logging** | Request IDs, structured logging, rate limit tracking |

---

## Authentication Security

### Token Management

Dual-token system using JWT:

| Token | Expiration | Config Variable | Purpose |
| ------- | ----------- | ----------------- | --------- |
| Access Token | 1 hour | `JWT_EXPIRES_IN` | Authenticate API requests |
| Refresh Token | 7 days | `JWT_REFRESH_EXPIRES_IN` | Obtain new access tokens |

**Token payload claims:**

- `userId`: UUID
- `email`: User's email
- `role`: freelancer / employer / admin
- `walletAddress`: Ethereum wallet address
- `type`: access / refresh

Signing secrets: `JWT_SECRET` for access tokens, `JWT_REFRESH_SECRET` for refresh tokens (defaults to `JWT_SECRET`).

### Authentication Middleware

The `authMiddleware` validates the `Authorization` header:

1. Check header exists (else `AUTH_MISSING_TOKEN`)
2. Validate `Bearer <token>` format (else `AUTH_INVALID_FORMAT`)
3. Verify JWT signature and expiration (else `AUTH_TOKEN_EXPIRED` / `AUTH_INVALID_TOKEN`)
4. Fetch user from `public.users` table
5. Attach user to `req` object

**Error codes:** `AUTH_MISSING_TOKEN`, `AUTH_INVALID_FORMAT`, `AUTH_TOKEN_EXPIRED`, `AUTH_INVALID_TOKEN`, `AUTH_INVALID_CREDENTIALS`, `DUPLICATE_EMAIL`, `AUTH_REQUIRE_REGISTRATION`.

### OAuth Flow

Supports Google, GitHub, Azure, and LinkedIn via Appwrite Auth:

1. Client requests OAuth provider URL
2. User authenticates with provider
3. Provider redirects to `/api/auth/callback` with authorization code
4. Backend exchanges code for tokens via Appwrite
5. System validates user in `public.users` and returns `AuthResult`

New OAuth users must select a role (freelancer/employer) before accessing the platform.

### Integration with Appwrite

Appwrite Auth handles user registration, login, email verification, password reset, and session management. On authentication, the system:

1. Authenticates with Appwrite Auth
2. Creates/updates user record in `public.users`
3. Returns custom tokens with extended user data (role, walletAddress, name)

### Secure Token Storage Recommendations

| Token | Storage | Notes |
| ------- | --------- | ------- |
| Access Token | JavaScript memory (variable) | Never persist to avoid XSS |
| Refresh Token | HTTP-only, secure cookie | Not accessible via JS |

**Rules:**

- Never store tokens in `localStorage` or `sessionStorage`
- All auth requests must use HTTPS
- Implement token revocation on logout
- Rotate refresh tokens on each use
- Monitor for suspicious authentication patterns

---

## CSRF Protection

### Why CSRF with JWT?

JWT in the `Authorization` header is not vulnerable to traditional CSRF, but protection is implemented for defense-in-depth, future cookie-based sessions, state-changing operation validation, and compliance (OWASP, IAS).

### Double-Submit Cookie Pattern

**Library:** `csrf-csrf`

1. Server generates a 64-byte cryptographically secure token
2. Token stored in HTTP-only, SameSite cookie
3. Client sends token in `X-CSRF-Token` header
4. Server compares cookie value with header value
5. Token bound to session (IP + User-Agent)

**Cookie configuration:**

| Setting | Value |
| --------- | ------- |
| Name | `__Host-csrf-token` |
| HttpOnly | `true` |
| Secure | `true` (production) |
| SameSite | `strict` |
| Path | `/` |

**Protected methods:** POST, PUT, PATCH, DELETE
**Exempt methods:** GET, HEAD, OPTIONS

### Middleware Setup

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
  getSessionIdentifier: (req) => `${req.ip}-${req.get('user-agent') || 'unknown'}`,
});
```

### Client Implementation (Web)

```typescript
// Fetch CSRF token on init
async function initializeCsrf() {
  await fetch('/api/auth/csrf-token', { method: 'GET', credentials: 'include' });
  return getCsrfTokenFromCookie();
}

function getCsrfTokenFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)__Host-csrf-token=([^;]+)/);
  return match ? match[1] : null;
}

// Include in state-changing requests
async function makeProtectedRequest(url: string, method: string, data: any) {
  const csrfToken = getCsrfTokenFromCookie();
  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-CSRF-Token': csrfToken,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
}
```

**Axios interceptor alternative:**

```typescript
axios.interceptors.request.use((config) => {
  const csrfToken = getCsrfTokenFromCookie();
  if (csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase() || '')) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});
```

**Mobile (React Native):** Extract token from `Set-Cookie` header, store in `AsyncStorage`, manually include in `X-CSRF-Token` header.

### Route Exemptions

```typescript
const exemptPaths = ['/health', '/api/auth/callback', '/api/webhooks/'];

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (exemptPaths.some(path => req.path.startsWith(path))) return next();
  doubleCsrfProtection(req, res, next);
};
```

### API Endpoint

**`GET /api/auth/csrf-token`** -- No auth required. Returns `Set-Cookie: __Host-csrf-token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/`.

### Error Responses

| Code | Status | Meaning |
| ------ | -------- | --------- |
| `CSRF_VALIDATION_FAILED` | 403 | Invalid or missing CSRF token |
| `CSRF_TOKEN_MISSING` | 403 | CSRF token required |

**Common causes:** Missing `X-CSRF-Token` header, token/cookie mismatch, expired token, session identifier changed (IP or User-Agent).

### Security Properties

- **Entropy**: 64 bytes (512 bits), cryptographically random
- **Session Binding**: IP address + User-Agent
- **Token Rotation**: Per-session, automatic refresh on session changes
- **Cookie Security**: HttpOnly, Secure, SameSite=Strict, `__Host-` prefix

### Troubleshooting

| Issue | Cause | Solution |
| ------- | ------- | ---------- |
| Token always invalid | Session identifier changed | Check proxy (X-Forwarded-For), verify consistent User-Agent |
| Token not in cookie | Cookie not sent | Ensure `credentials: 'include'`, verify CORS allows credentials |
| CORS errors with CSRF | CSRF header not allowed | Add `X-CSRF-Token` to `allowedHeaders` in CORS config |
| Mobile can't store cookies | No HTTP-only cookie support | Extract from Set-Cookie header, store in AsyncStorage |

### Testing

```bash
# Get token
curl -X GET https://api.freelancexchain.com/api/auth/csrf-token -c cookies.txt -v

# Protected request
curl -X POST https://api.freelancexchain.com/api/contracts \
  -b cookies.txt \
  -H "Authorization: Bearer <token>" \
  -H "X-CSRF-Token: <csrf_token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Contract"}'
```

### References

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [csrf-csrf Library](https://github.com/Psifi-Solutions/csrf-csrf)

---

## Database Security & Row Level Security

### RLS Overview

All tables have Row Level Security (RLS) enabled via `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. Access is denied by default and only granted through explicit policies. The system uses Appwrite's `auth.uid()` to extract the authenticated user's ID from JWT tokens for policy evaluation.

### Policy Patterns

- **User-owned resources** (projects, contracts, payments): Access restricted by user ID matching owner column
- **Shared resources** (contracts): Access for both freelancer and employer parties
- **Public read** (skills, categories): SELECT allowed for all users
- **Open discovery** (projects with `status = 'open'`): Publicly readable; drafts and completed projects are private

### Service Role Bypass

Backend operations requiring broader access use service role policies with `USING (true)`, bypassing RLS. Used for administrative functions, batch operations, and cross-user business logic. The service role has elevated privileges in Appwrite but is only used in controlled circumstances.

### Defense in Depth

RLS operates alongside application-level security:

1. **Transport**: HTTPS/TLS
2. **Authentication**: JWT Bearer tokens
3. **Authorization**: Role-based access control middleware
4. **Database**: Row Level Security policies
5. **Repository layer**: Explicit user ID filtering as fallback

### Testing RLS

- Simulate different user contexts during development
- Use Appwrite dashboard to test queries as different users
- Unit tests verify repository methods for different roles
- Integration tests validate full auth-to-data-access flows
- Temporarily disable RLS only for local debugging, never in production

---

## Data Privacy & KYC Protection

### Didit KYC Integration

[Didit](https://didit.me) provides enterprise-grade KYC verification for 220+ countries. **Key principle:** Didit handles ALL verification data (documents, liveness, face match, IP analysis). Only session info and the final decision are stored locally.

**Environment configuration:**

```bash
DIDIT_API_KEY=your-didit-api-key
DIDIT_API_URL=https://verification.didit.me
DIDIT_WEBHOOK_SECRET=your-didit-webhook-secret-key
DIDIT_WORKFLOW_ID=your-didit-workflow-id
```

### Verification Features (Handled by Didit)

| Feature | Description |
| --------- | ------------- |
| ID Verification | Passport, national ID, driver's license (220+ countries) |
| Passive Liveness | Anti-spoofing with no user interaction |
| Face Match 1:1 | Selfie-to-document comparison with similarity scoring |
| IP Analysis | Geolocation, VPN/Proxy detection, risk scoring |

### Data Minimization

**Stored locally:** `didit_session_id`, `didit_session_url`, `status`, `decision`, `reviewed_by`, `reviewed_at`, `admin_notes`.

**NOT stored locally (handled by Didit):** Document images, selfie images, raw biometric data, personal information (name, DOB, nationality), document details, liveness results, face match scores, IP analysis data.

### GDPR Compliance

| Right | Implementation |
| ------- | ---------------- |
| Right to Access | `GET /api/kyc/status` returns verification status |
| Right to Erasure | Admin deletes records; Didit handles PII deletion |
| Right to Portability | `GET /api/kyc/history` exports verification history |
| Consent | Explicit consent required before initiating verification |

**Data retention:** Approved verifications retained 1 year (`expires_at`). Rejected retained 90 days. Expired sessions cleaned after 30 days.

### Webhook Security

All Didit webhooks verified using HMAC-SHA256:

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
```

Additional protections: rate limiting, idempotency handling for duplicate webhooks.

### API Endpoints

**User endpoints:**

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| POST | `/api/kyc/initiate` | Start verification, get session URL |
| GET | `/api/kyc/status` | Current verification status |
| GET | `/api/kyc/verified` | Check if user is verified |
| GET | `/api/kyc/history` | Verification history |
| POST | `/api/kyc/refresh/:id` | Manually refresh status from Didit |

**Admin endpoints:**

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| GET | `/api/kyc/admin/pending` | Pending reviews |
| GET | `/api/kyc/admin/status/:status` | Verifications by status |
| POST | `/api/kyc/admin/review/:id` | Approve/reject verification |
| GET | `/api/kyc/admin/verification/:id` | Verification details |

**Webhook:** `POST /api/kyc/webhook` -- Receives Didit status updates.

### Database Schema

```sql
CREATE TABLE kyc_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN (
        'pending', 'in_progress', 'completed',
        'approved', 'rejected', 'expired'
    )),
    didit_session_id VARCHAR(255) UNIQUE NOT NULL,
    didit_session_token VARCHAR(255) NOT NULL,
    didit_session_url TEXT NOT NULL,
    didit_workflow_id VARCHAR(255) NOT NULL,
    decision VARCHAR(20) CHECK (decision IN ('approved', 'declined', 'review')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- RLS: Users see only their own; service role has full access
CREATE POLICY "Users can view own KYC" ON kyc_verifications
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON kyc_verifications
    FOR ALL USING (auth.role() = 'service_role');
```

### Status Values

| Status | Description |
| -------- | ------------- |
| `pending` | Session created, user hasn't started |
| `in_progress` | User completing verification |
| `completed` | Awaiting admin review |
| `approved` | Admin approved |
| `rejected` | Admin rejected or Didit declined |
| `expired` | Session expired without completion |

---

## Role-Based Access Control

### Three-Tier Role Model

| Role | Capabilities |
| ------ | ------------- |
| **Freelancer** | Profile management, proposal submission, contract viewing, milestone tracking |
| **Employer** | Project creation, hiring, milestone approval, payment management |
| **Admin** | Full system access, dispute resolution, skill management, KYC review |

Roles are assigned during registration (freelancer or employer). Admin roles are assigned manually by existing admins only.

### JWT Role Extraction

Roles are embedded in the JWT payload during login/registration. The `authMiddleware` decodes the token and attaches the role to the request object for downstream authorization checks.

### Route-Level Authorization

The `requireRole` middleware restricts endpoint access by role:

```typescript
// Example: Only employers and admins can create projects
router.post('/projects', authMiddleware, requireRole('employer', 'admin'), createProject);
```

Returns `401 Unauthorized` for missing/invalid auth, `403 Forbidden` for insufficient role.

### Permitted Operations

| Operation | Freelancer | Employer | Admin |
| ----------- | :----------: | :--------: | :-----: |
| Manage profile | Yes | Yes | Yes |
| Submit proposals | Yes | No | Yes |
| Create projects | No | Yes | Yes |
| Approve milestones | No | Yes | Yes |
| Resolve disputes | No | No | Yes |
| Manage skills | No | No | Yes |
| Review KYC | No | No | Yes |

### Security Considerations

- **Privilege misalignment**: Mitigated by rigorous validation during role assignment and regular audits
- **Token tampering**: Prevented by strong cryptographic JWT signatures validated on every request
- **Escalation**: No self-service path to admin; requires manual intervention by existing admins

---

## Smart Contract Security

### Reentrancy Protection

The FreelanceEscrow contract uses a manual reentrancy guard with `_status` variable (`NOT_ENTERED=1`, `ENTERED=2`). The `nonReentrant` modifier is applied to all payment functions: `approveMilestone`, `resolveDispute`, `refundMilestone`, `cancelContract`.

```
Function Entry -> Check _status != ENTERED -> Set _status = ENTERED -> Execute Logic -> External Call -> Set _status = NOT_ENTERED -> Exit
```

### Access Control Modifiers

| Modifier | Restricts To |
| ---------- | ------------- |
| `onlyEmployer` | Employer address |
| `onlyFreelancer` | Freelancer address |
| `onlyArbiter` | Dispute arbiter |
| `onlyParties` | Either employer or freelancer |
| `contractActive` | Active contract state only |
| `onlyOwner` | Contract deployer (ContractAgreement, KYCVerification) |
| `onlyVerifier` | Designated verifier (KYCVerification) |

### Input Validation and State Checks

- Constructor validates: non-zero freelancer, at least one milestone, matching array lengths
- `contractActive` modifier prevents operations on cancelled contracts
- Milestone functions check correct status (only submitted milestones can be approved)
- Array bounds checking for milestone indices
- Sufficient balance verification before transfers
- Solidity 0.8+ built-in arithmetic overflow protection

### Checks-Effects-Interactions Pattern

All functions follow this ordering:

1. **Checks**: Validate preconditions and inputs
2. **Effects**: Update contract state
3. **Interactions**: Make external calls

Example in `approveMilestone`: Check milestone is submitted -> Update `releasedAmount` -> Transfer ETH to freelancer.

### Payment Security (Pull-over-Push)

The escrow system requires recipients to claim payments rather than auto-pushing funds. When a milestone is approved, the status is updated and funds are transferred via external call. Benefits:

- Reduced attack surface from limited external calls
- Prevents forced transfer attacks (malicious contracts rejecting ETH)
- Recipient controls when they receive funds
- Better error handling and recovery

### Contract Ownership

- `onlyOwner` modifier restricts administrative functions
- Ownership transfer emits `OwnershipTransferred` event
- Core financial contracts (FreelanceEscrow) are non-upgradable for maximum security
- KYCVerification stores only hashes on-chain; actual data stays off-chain

### Testing with Hardhat

Networks supported: Hardhat local, Ganache, Sepolia testnet, Polygon.

**Security test categories:**

- Reentrancy attack simulations
- Access control enforcement
- Input validation edge cases
- State transition correctness
- Fallback function behavior
- Property-based testing with fast-check for random inputs

---

## Security Considerations

### Security Layers

```
Transport Security (HTTPS/TLS)
  -> Authentication (JWT Bearer Tokens)
    -> Authorization (Role-Based Access Control)
      -> Database Security (Appwrite Row Level Security)
        -> Smart Contract Security
```

### Key Principles

- **Defense in depth**: Multiple security layers at transport, auth, authorization, database, and contract levels
- **Least privilege**: Default deny; access granted only through explicit policies
- **Data minimization**: Collect only what's necessary; KYC data handled by Didit, not stored locally
- **Privacy by design**: On-chain stores only hashes, not personal data
- **Standardization**: Consistent error handling, response formats, and security headers across all endpoints

### Security Testing Guidelines

- **Injection**: Validate all input rules, ensure proper escaping
- **Auth bypass**: Test protected resources with invalid/missing credentials
- **Smart contracts**: Test reentrancy, integer overflow, access control bypasses
- **API**: Test rate limiting bypass, CORS misconfiguration, header manipulation
- **Data exposure**: Examine responses for unintended information disclosure
