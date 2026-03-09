# CodeQL Configuration

This directory contains CodeQL configuration files for the FreelanceXchain API security scanning.

## Files

### `codeql-config.yml`
Main CodeQL configuration file that:
- Defines which queries to run (security-and-quality)
- Excludes paths that don't need scanning (node_modules, dist, tests, etc.)
- Disables the built-in `js/missing-rate-limiting` query because we use custom rate limiter middleware

### `custom-rate-limiter.ql`
Custom CodeQL query that recognizes our rate limiter functions:
- `apiRateLimiter` - General API rate limiting (100 req/min)
- `withdrawalRateLimiter` - Withdrawal operations (10 req/hour)
- `fileUploadRateLimiter` - File uploads (20 req/hour)
- `loginRateLimiter` - Login attempts (10 req/15min)
- `registerRateLimiter` - Registration (5 req/hour)
- `passwordResetRateLimiter` - Password resets (5 req/15min)
- `authRateLimiter` - Authentication operations
- `sensitiveRateLimiter` - Sensitive operations (5 req/hour)

### `qlpack.yml`
CodeQL query pack definition for custom queries.

## Why Disable Built-in Rate Limiting Query?

CodeQL's built-in `js/missing-rate-limiting` query only recognizes standard rate limiting libraries like `express-rate-limit`. Our application uses a custom-built rate limiter implementation in `src/middleware/rate-limiter.ts` that provides:

1. **Better control** - Custom configuration per endpoint type
2. **Memory efficiency** - Automatic cleanup of expired entries
3. **Security** - Proper IP detection respecting Express trust proxy settings
4. **Flexibility** - Easy to add new rate limiter presets

All routes in the application have appropriate rate limiting applied. The false positives from CodeQL are due to it not recognizing our custom implementation.

## Rate Limiter Implementation

Our rate limiter is located at `src/middleware/rate-limiter.ts` and provides:
- In-memory rate limiting with automatic cleanup
- Configurable time windows and request limits
- Proper client IP detection (respects trust proxy)
- Standard HTTP 429 responses with Retry-After headers
- Multiple preset configurations for different endpoint types

## Verification

To verify rate limiting is properly applied:
1. Check `src/routes/*.ts` files - all routes should have a rate limiter middleware
2. Run the application and test endpoints with excessive requests
3. Verify HTTP 429 responses are returned when limits are exceeded
