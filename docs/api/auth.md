# Authentication API

All authentication endpoints are under `/api/auth` and integrate with Appwrite Auth for user management, email verification, and OAuth providers. Responses use standardized `AuthResult` and `AuthError` schemas.

## Table of Contents

- [Endpoints](#endpoints)
  - [POST /api/auth/register](#post-apiauthregister)
  - [POST /api/auth/login](#post-apiauthlogin)
  - [POST /api/auth/refresh](#post-apiauthrefresh)
  - [POST /api/auth/resend-confirmation](#post-apiauthresend-confirmation)
  - [POST /api/auth/forgot-password](#post-apiauthforgot-password)
  - [POST /api/auth/reset-password](#post-apiauthreset-password)
  - [GET /api/auth/oauth/:provider](#get-apiauthoauthprovider)
  - [GET /api/auth/callback](#get-apiauthcallback)
  - [POST /api/auth/oauth/callback](#post-apiauthoauthcallback)
  - [POST /api/auth/oauth/register](#post-apiauthoauthregister)
- [Schemas](#schemas)
- [Rate Limiting](#rate-limiting)
- [OAuth Flow](#oauth-flow)
- [Password Recovery](#password-recovery)

## Endpoints

### POST /api/auth/register

Register a new user with email/password.

- **Auth required:** No
- **Rate limit:** authRateLimiter (10 req / 15 min per IP)

**Request body** (`RegisterInput`):

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| email | string | yes | Valid email format |
| password | string | yes | Min 8 chars, must include uppercase, lowercase, digit, special char (`@$!%*?&`) |
| role | string | yes | `freelancer` or `employer` |
| name | string | no | Min 2 chars if provided |
| walletAddress | string | no | Pattern: `0x` + 40 hex chars |

**Responses:**

| Status | Schema | Description |
|--------|--------|-------------|
| 201 | AuthResult | User created successfully |
| 400 | AuthError | VALIDATION_ERROR |
| 409 | AuthError | DUPLICATE_EMAIL |

---

### POST /api/auth/login

Authenticate a user with email/password. Requires a verified email.

- **Auth required:** No
- **Rate limit:** authRateLimiter (10 req / 15 min per IP)

**Request body** (`LoginInput`):

| Field | Type | Required |
|-------|------|----------|
| email | string | yes |
| password | string | yes |

**Responses:**

| Status | Schema | Description |
|--------|--------|-------------|
| 200 | AuthResult | Login successful |
| 400 | AuthError | VALIDATION_ERROR |
| 401 | AuthError | AUTH_INVALID_CREDENTIALS |

---

### POST /api/auth/refresh

Rotate access and refresh tokens using a valid refresh token.

- **Auth required:** No (uses refresh token)
- **Rate limit:** authRateLimiter

**Request body** (`RefreshInput`):

| Field | Type | Required |
|-------|------|----------|
| refreshToken | string | yes |

**Responses:**

| Status | Schema | Description |
|--------|--------|-------------|
| 200 | AuthResult | Tokens refreshed |
| 400 | AuthError | VALIDATION_ERROR (missing/invalid token) |
| 401 | AuthError | AUTH_INVALID_TOKEN or AUTH_TOKEN_EXPIRED |

---

### POST /api/auth/resend-confirmation

Resend email confirmation link.

- **Auth required:** No
- **Rate limit:** authRateLimiter

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| email | string | yes |

**Responses:**

| Status | Schema | Description |
|--------|--------|-------------|
| 200 | - | Confirmation email sent |
| 400 | AuthError | VALIDATION_ERROR |

---

### POST /api/auth/forgot-password

Send a password reset email via Appwrite Auth.

- **Auth required:** No
- **Rate limit:** authRateLimiter

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| email | string | yes |

**Responses:**

| Status | Schema | Description |
|--------|--------|-------------|
| 200 | - | Password reset email sent |
| 400 | AuthError | VALIDATION_ERROR |

---

### POST /api/auth/reset-password

Update password using the reset token from the email.

- **Auth required:** No (uses reset token)
- **Rate limit:** authRateLimiter

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| accessToken | string | yes | Reset token from email |
| password | string | yes | Min 8 chars, must include uppercase, lowercase, digit, special char |

**Responses:**

| Status | Schema | Description |
|--------|--------|-------------|
| 200 | - | Password updated |
| 400 | AuthError | VALIDATION_ERROR |
| 401 | AuthError | INVALID_TOKEN |

---

### GET /api/auth/oauth/:provider

Initiate OAuth login by redirecting to the provider.

- **Auth required:** No
- **Rate limit:** None

**Path parameters:**

| Param | Type | Values |
|-------|------|--------|
| provider | string | `google`, `github`, `azure`, `linkedin` |

**Responses:**

| Status | Description |
|--------|-------------|
| 302 | Redirect to provider authorization URL |
| 400 | VALIDATION_ERROR (invalid provider) |

---

### GET /api/auth/callback

Handle OAuth callback. Supports both PKCE (code in query) and implicit (tokens in URL fragment) flows.

- **Auth required:** No
- **Rate limit:** None

**Query parameters (PKCE flow):**

| Param | Type | Description |
|-------|------|-------------|
| code | string | Authorization code from provider |
| error | string | Error from provider (if any) |

**Responses:**

| Status | Schema | Description |
|--------|--------|-------------|
| 200 | AuthResult | Login successful, user exists |
| 202 | `{ status: "registration_required", accessToken }` | User authenticated but needs to select role |
| 400 | AuthError | OAUTH_ERROR |
| 401 | AuthError | AUTH_EXCHANGE_FAILED or AUTH_INVALID_TOKEN |

---

### POST /api/auth/oauth/callback

Receive access token from frontend after OAuth redirect (implicit flow).

- **Auth required:** No
- **Rate limit:** None

**Request body:**

| Field | Type | Required |
|-------|------|----------|
| access_token | string | yes |

**Responses:**

| Status | Schema | Description |
|--------|--------|-------------|
| 200 | `{ status: "success" }` | Login successful |
| 202 | `{ status: "registration_required", accessToken }` | Registration required |
| 401 | AuthError | AUTH_INVALID_TOKEN |

---

### POST /api/auth/oauth/register

Complete OAuth registration by selecting a role and optionally providing profile details.

- **Auth required:** No (uses OAuth access token)
- **Rate limit:** authRateLimiter

**Request body:**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| accessToken | string | yes | Appwrite access token from OAuth flow |
| role | string | yes | `freelancer` or `employer` |
| name | string | no | Min 2 chars if provided |
| walletAddress | string | no | Pattern: `0x` + 40 hex chars |

**Responses:**

| Status | Schema | Description |
|--------|--------|-------------|
| 201 | AuthResult | Registration complete |
| 400 | AuthError | VALIDATION_ERROR |
| 401 | AuthError | AUTH_INVALID_TOKEN |

---

## Schemas

### AuthResult

```json
{
  "user": {
    "id": "string",
    "email": "string",
    "role": "freelancer | employer | admin",
    "walletAddress": "string",
    "createdAt": "ISO 8601 datetime"
  },
  "accessToken": "string",
  "refreshToken": "string"
}
```

### AuthError

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": [{ "field": "string", "message": "string" }]
  },
  "timestamp": "ISO 8601 datetime",
  "requestId": "string"
}
```

**Error codes:** `DUPLICATE_EMAIL`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `AUTH_EXCHANGE_FAILED`, `AUTH_INVALID_TOKEN`, `AUTH_INVALID_CREDENTIALS`, `AUTH_REQUIRE_REGISTRATION`, `VALIDATION_ERROR`, `INTERNAL_ERROR`, `RATE_LIMIT_EXCEEDED`

---

## Rate Limiting

| Limiter | Window | Max Requests | Applied To |
|---------|--------|-------------|------------|
| authRateLimiter | 15 min | 10 per IP | All `/api/auth/*` endpoints |
| apiRateLimiter | 1 min | 100 per IP | General API endpoints |
| sensitiveRateLimiter | 1 hour | 5 per IP | Critical auth operations |
| webhookRateLimiter | 1 min | 60 per IP | Unauthenticated webhook endpoints: `/api/inbox/webhook`, `/api/kyc/webhook`, `/api/webhooks/blockchain` |

Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header.

Webhook endpoints are rate-limited **per IP** (not per user) so provider spikes
can't exhaust a shared account budget, and they fail **open** on Redis errors —
signature verification, not rate limiting, is the real authorization boundary
for webhooks (see below).

### Webhook Signature Verification & rawBody

All three webhook endpoints verify an HMAC signature over the **raw request
bytes** (`req.rawBody`, captured by the `express.json` verify hook for webhook
paths). When `rawBody` is unavailable, verification falls back to a
re-serialization of the parsed body (`JSON.stringify(req.body ?? {})`) so the
handler never crashes on a missing body — the signature simply fails and the
request is rejected.

- `POST /api/inbox/webhook` — `x-webhook-signature` (HMAC-SHA256 over `EMAIL_WEBHOOK_SECRET`)
- `POST /api/kyc/webhook` — `x-signature-v2` + `x-timestamp` (Didit signing)
- `POST /api/webhooks/blockchain` — `x-blockchain-signature` (HMAC-SHA256 over `BLOCKCHAIN_WEBHOOK_SECRET`)

`POST /api/kyc/webhook` and `POST /api/webhooks/blockchain` are exempt from CSRF
protection (server-to-server, no browser session); `/api/inbox/webhook` is also
CSRF-exempt.

---

## OAuth Flow

**Supported providers:** Google, GitHub, Azure, LinkedIn

**PKCE flow (recommended):**

1. Client navigates to `GET /api/auth/oauth/:provider`
2. User authenticates with the provider
3. Provider redirects to `GET /api/auth/callback?code=...`
4. Backend exchanges code for tokens via Appwrite
5. If user exists: returns `200` with `AuthResult`
6. If user is new: returns `202` with `registration_required`; client calls `POST /api/auth/oauth/register` to complete

**Implicit flow (legacy):**

1. Provider redirects to `GET /api/auth/callback` with tokens in URL fragment
2. Backend serves minimal HTML that extracts tokens and POSTs to `POST /api/auth/oauth/callback`
3. Backend returns `200`, `202`, or `401`

---

## Password Recovery

1. **Request reset:** `POST /api/auth/forgot-password` with email -- sends a reset link via Appwrite Auth
2. **Complete reset:** `POST /api/auth/reset-password` with the access token from the email and the new password

Reset tokens are time-limited (default: 1 hour) and single-use.

---

[Back to API Reference](README.md)
