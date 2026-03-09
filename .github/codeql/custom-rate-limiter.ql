/**
 * @name Custom Rate Limiter Recognition
 * @description Recognizes custom rate limiter middleware as valid rate limiting
 * @kind problem
 * @problem.severity recommendation
 * @id js/custom-rate-limiter
 * @tags security
 *       external/cwe/cwe-770
 * @precision high
 */

import javascript
import semmle.javascript.security.dataflow.MissingRateLimitingQuery

/**
 * A call to a custom rate limiter function
 */
class CustomRateLimiterCall extends CallExpr {
  CustomRateLimiterCall() {
    // Match calls to our custom rate limiter functions
    this.getCalleeName() = "apiRateLimiter" or
    this.getCalleeName() = "withdrawalRateLimiter" or
    this.getCalleeName() = "fileUploadRateLimiter" or
    this.getCalleeName() = "loginRateLimiter" or
    this.getCalleeName() = "registerRateLimiter" or
    this.getCalleeName() = "passwordResetRateLimiter" or
    this.getCalleeName() = "authRateLimiter" or
    this.getCalleeName() = "sensitiveRateLimiter"
  }
}

/**
 * Recognize Express route handlers that use our custom rate limiters
 */
predicate hasCustomRateLimiter(Express::RouteHandler handler) {
  exists(CustomRateLimiterCall rateLimiter |
    // The rate limiter is used as middleware in the same route setup
    rateLimiter.getParent*() = handler.getRouteSetup()
  )
}

from Express::RouteHandler handler
where hasCustomRateLimiter(handler)
select handler, "This route handler has custom rate limiting applied."
