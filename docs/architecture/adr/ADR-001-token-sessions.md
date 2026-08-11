# ADR-001: Appwrite session secret used for both access and refresh token (BLF-4.1)

- **Status:** Accepted (with known limitation)
- **Date:** 2026-08-11
- **Related code:** `src/services/auth-service.ts` (`register`, `login`, `refreshTokens`, `exchangeCodeForSession`, `loginWithAppwrite`)

## Context

FreelanceXchain authenticates users against Appwrite Auth. Appwrite issues a
per-session opaque secret that authorizes all session-scoped operations
(`account.get()`, session deletion, etc.). The API has no custom JWT layer.

The API contract exposes two token fields to clients — `accessToken` and
`refreshToken` — and both are set to the **same Appwrite session secret**.

This is a deliberate, documented trade-off (tagged `BLF-4.1` in the code), not
an accident: there is currently no short-lived credential that could serve as a
true access token.

## Decision

- `accessToken` and `refreshToken` carry the identical Appwrite session secret.
- Token refresh re-validates the session with Appwrite and returns the **same**
  secret (no rotation).
- The Appwrite session itself remains the single source of truth: every request
  is validated server-side via `account.get()`, so a revoked session fails
  immediately.

## Consequences

### Risks (accepted)

1. **Leak scope:** an access-token leak is a full-session leak — the same secret
   refreshes indefinitely. There is no short-lived credential to bound the
   blast radius.
2. **No rotation:** a compromised token is valid until the session is deleted or
   expires; there is no automatic rotation on refresh to limit replay window.
3. **Detection lag:** without rotation, token theft is only observable through
   abnormal usage patterns, not through token reuse signals.

### Mitigations already in place

| Control | Where |
| --- | --- |
| Server-side validation of the session on every request (`account.get()` in `validateToken`) | `src/services/auth-service.ts` |
| Logout deletes the current Appwrite session | `logout` → `account.deleteSession({ sessionId: 'current' })` |
| Password change invalidates **all** sessions (BLF-4.2) | `updatePassword` → `account.deleteSessions()` |
| MFA challenge gates sensitive session establishment (login returns `MFA_REQUIRED` with a non-final session) | `login`, `verifyMFAChallenge` |
| `account.get()` throws `user_more_factors_required` for unverified MFA sessions, so partially-authenticated tokens cannot pass `authMiddleware` | `src/middleware/auth-middleware.ts` |
| Rate limiting on auth endpoints (fail-closed on Redis errors) | `src/middleware/rate-limiter.ts` |

## Migration path (future work)

The recommended fix is a two-token architecture:

1. Issue short-lived **JWTs** (e.g. 15 min) signed with `JWT_SECRET` as the
   `accessToken`, carrying `userId`/`role`/`sessionId`.
2. Keep the Appwrite session secret **only** as the `refreshToken`.
3. On refresh, validate the Appwrite session (checking revocation), then mint a
   fresh access JWT. Optionally rotate the Appwrite session to invalidate the
   previous refresh token.
4. Add server-side revocation checks (session version or a deny-list) for the
   short access JWT so password changes/logout take effect within the token
   lifetime.

This bounds the blast radius of an access-token leak and enables rotation-based
replay detection. It requires coordinated changes in `auth-service.ts`,
`auth-middleware.ts`, and all clients that store/refresh tokens.

## Reviewers

Security review (2026-08-11): accepted as a known limitation with the
mitigations above; the ADR documents the risk and migration path so the
decision is explicit rather than implicit.
