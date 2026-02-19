# IAS Checklist Demo Guide for Professor
**Purpose:** Step-by-step demonstration of all implemented security features  
**Date:** February 19, 2026  
**Estimated Demo Time:** 30-45 minutes

---

## Pre-Demo Setup (5 minutes)

### 1. Start the Application
```bash
cd FreelanceXchain-api
npm install
npm run dev
```

**Expected Output:**
```
Server running on port 3000
Supabase connected
```

### 2. Open Required Tools
- **Browser:** For Swagger UI and visual testing
- **Terminal:** For curl commands
- **Postman/Insomnia:** (Optional) For easier API testing
- **Authenticator App:** Google Authenticator or Authy for MFA demo

### 3. Test URLs
- API Base: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/api-docs`
- Health Check: `http://localhost:3000/health`

---

## Category 1: Authentication (15 minutes)

### Demo 1.1: Strong Password Hashing ✅
**What to show:** Passwords are hashed, never stored in plain text

**Steps:**
1. Open browser to Swagger UI: `http://localhost:3000/api-docs`
2. Navigate to "Authentication" section
3. Show the registration endpoint requires password (min 8 chars)

**Code Evidence:**
```bash
# Show password validation in code
cat src/middleware/validation-middleware.ts | grep -A 5 "registerSchema"
```

**Expected Output:**
```typescript
password: { type: 'string', minLength: 8, maxLength: 128 }
```

**Explanation:** "Supabase Auth handles password hashing with bcrypt automatically. We never store plain text passwords."

---

### Demo 1.2: Secure Sessions with Expiry ✅
**What to show:** JWT tokens expire after configured time

**Steps:**

1. Show environment configuration:
```bash
cat .env | grep JWT_EXPIRES
```

**Expected Output:**
```
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
```

2. Show token validation code:
```bash
cat src/middleware/auth-middleware.ts | grep -A 10 "authMiddleware"
```

**Explanation:** "Access tokens expire in 1 hour, refresh tokens in 7 days. This limits the window of opportunity if a token is compromised."

---

### Demo 1.3: Generic Login Errors ✅
**What to show:** Failed login doesn't reveal if email exists

**Steps:**
1. Try login with wrong credentials:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@test.com","password":"wrong"}'
```

**Expected Output:**
```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid credentials"
  }
}
```

**Explanation:** "Notice the error doesn't say 'user not found' or 'wrong password'. This prevents attackers from enumerating valid email addresses."

---

### Demo 1.4: Rate Limiting for Logins ✅
**What to show:** Too many login attempts are blocked

**Steps:**
1. Show rate limiter configuration:
```bash
cat src/middleware/rate-limiter.ts | grep -A 5 "authRateLimiter"
```

**Expected Output:**
```typescript
export const authRateLimiter = rateLimiter('auth', {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // 10 attempts per 15 minutes
});
```

2. Demonstrate rate limiting (run this command 11 times quickly):
```bash
for i in {1..11}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test"}' \
    -w "\nAttempt $i: %{http_code}\n"
done
```

**Expected Output:** First 10 attempts return 401, 11th returns 429 (Too Many Requests)

**Explanation:** "After 10 failed attempts in 15 minutes, the IP is temporarily blocked. This prevents brute force attacks."

---

### Demo 1.5: MFA Available and Enforced ✅
**What to show:** Multi-factor authentication for admin users

**Steps:**
1. Show MFA service functions:
```bash
cat src/services/auth-service.ts | grep "export.*MFA"
```

**Expected Output:**
```typescript
export async function enrollMFA(accessToken: string)
export async function verifyMFAEnrollment(...)
export async function challengeMFA(...)
```

2. Show MFA enforcement middleware:
```bash
cat src/middleware/mfa-enforcement.ts | grep -A 10 "enforceMFAForAdmins"
```

3. **Live Demo - MFA Enrollment:**
```bash
# Step 1: Login as admin
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"YourPassword123"}' \
  | jq -r '.accessToken')

# Step 2: Enroll MFA
curl -X POST http://localhost:3000/api/auth/mfa/enroll \
  -H "Authorization: Bearer $TOKEN" | jq
```

**Expected Output:**
```json
{
  "qrCode": "data:image/svg+xml;base64,...",
  "secret": "JBSWY3DPEHPK3PXP",
  "factorId": "uuid-here"
}
```

4. **Show QR Code:** Open the qrCode URL in browser, scan with Google Authenticator

5. **Verify Enrollment:**
```bash
# Get code from authenticator app (e.g., 123456)
curl -X POST http://localhost:3000/api/auth/mfa/verify-enrollment \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"factorId":"<factor-id>","code":"123456"}' | jq
```

**Explanation:** "Admin users must enroll MFA. The system uses TOTP (Time-based One-Time Password) standard, compatible with Google Authenticator, Authy, etc."

---

### Demo 1.6: Validated Tokens (JWT) ✅
**What to show:** Invalid tokens are rejected

**Steps:**
1. Try accessing protected endpoint without token:
```bash
curl -X GET http://localhost:3000/api/profile
```

**Expected Output:**
```json
{
  "error": {
    "code": "AUTH_MISSING_TOKEN",
    "message": "Authorization header is required"
  }
}
```

2. Try with invalid token:
```bash
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer invalid_token_here"
```

**Expected Output:**
```json
{
  "error": {
    "code": "AUTH_INVALID_TOKEN",
    "message": "Invalid token"
  }
}
```

**Explanation:** "All protected endpoints validate JWT tokens. Invalid or missing tokens are rejected immediately."

---

### Demo 1.7: Strong Password Policy ✅
**What to show:** Weak passwords are rejected

**Steps:**
1. Try registering with weak password:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123","role":"freelancer"}'
```

**Expected Output:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "password",
        "message": "password must be at least 8 characters"
      }
    ]
  }
}
```

**Explanation:** "Passwords must be at least 8 characters. This is enforced at the validation layer before reaching the database."

---

### Demo 1.8: Logout Invalidates Session ✅
**What to show:** Logout makes token unusable

**Steps:**
1. Login and get token:
```bash
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password123"}' \
  | jq -r '.accessToken')

echo "Token: $TOKEN"
```

2. Use token (should work):
```bash
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer $TOKEN"
```

3. Logout:
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

4. Try using token again (should fail):
```bash
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Output:** 401 Unauthorized

**Explanation:** "Logout calls Supabase signOut() which invalidates the session server-side. The token becomes unusable immediately."

---

### Demo 1.9: OAuth/SSO ✅
**What to show:** OAuth integration endpoints exist

**Steps:**
1. Show OAuth endpoints in Swagger UI:
   - Navigate to `http://localhost:3000/api-docs`
   - Find "Authentication" section
   - Show OAuth endpoints: `/api/auth/oauth/callback`, `/api/auth/oauth/register`

2. Show code:
```bash
cat src/routes/auth-routes.ts | grep -A 5 "oauth"
```

**Explanation:** "OAuth integration with Supabase Auth supports Google, GitHub, Microsoft, LinkedIn. Users can login with their existing accounts."

---

## Category 2: Input Validation (10 minutes)

### Demo 2.1: Server-Side Validation ✅
**What to show:** All inputs are validated before processing

**Steps:**
1. Show validation middleware:
```bash
cat src/middleware/validation-middleware.ts | grep -A 20 "export function validate"
```

2. Try invalid input:
```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"AB","description":"short","budget":-100}'
```

**Expected Output:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      {"field": "title", "message": "title must be at least 5 characters"},
      {"field": "description", "message": "description must be at least 20 characters"},
      {"field": "budget", "message": "budget must be at least 100"}
    ]
  }
}
```

**Explanation:** "Every field is validated against a schema. Invalid data is rejected before reaching business logic."

---

### Demo 2.2: Parameterized SQL Queries ✅
**What to show:** No SQL injection possible

**Steps:**
1. Show repository code using Supabase query builder:
```bash
cat src/repositories/user-repository.ts | grep -A 5 "findByEmail"
```

**Expected Output:**
```typescript
const { data, error } = await client
  .from(this.tableName)
  .select('*')
  .ilike('email', email.toLowerCase())
  .single();
```

2. Try SQL injection:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com OR 1=1--","password":"anything"}'
```

**Expected Output:** Login fails (SQL injection doesn't work)

**Explanation:** "We use Supabase query builder which automatically parameterizes queries. SQL injection is impossible."

---

### Demo 2.3: XSS Protection ✅
**What to show:** XSS headers are set

**Steps:**
1. Check response headers:
```bash
curl -I http://localhost:3000/api/health
```

**Expected Output:**
```
X-XSS-Protection: 1; mode=block
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'self'...
```

2. Show security middleware:
```bash
cat src/middleware/security-middleware.ts | grep -A 10 "xssFilter"
```

**Explanation:** "Helmet middleware sets security headers including XSS protection, CSP, and content type sniffing prevention."

---

### Demo 2.4: File Upload Validation ✅
**What to show:** File uploads are validated by type, size, and magic numbers

**Steps:**
1. Show file upload middleware:
```bash
cat src/middleware/file-upload-middleware.ts | grep -A 10 "ALLOWED_MIME_TYPES"
```

**Expected Output:**
```typescript
export const ALLOWED_MIME_TYPES = {
  'application/pdf': true,
  'image/png': true,
  'image/jpeg': true,
  // ...
}
```

2. Show magic number validation:
```bash
cat src/middleware/file-upload-middleware.ts | grep -A 15 "validateFileMimeType"
```

3. Show rate limiting for uploads:
```bash
cat src/middleware/rate-limiter.ts | grep -A 5 "fileUploadRateLimiter"
```

**Expected Output:**
```typescript
export const fileUploadRateLimiter = rateLimiter('file-upload', {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20, // 20 file uploads per hour
});
```

**Explanation:** "Files are validated by:
1. Extension check
2. Magic number detection (actual file type)
3. Size limits (10MB per file, 25MB total)
4. Filename sanitization
5. Rate limiting (20 uploads/hour)"

---

### Demo 2.5: API Schema Validation ✅
**What to show:** Predefined schemas for all endpoints

**Steps:**
1. Show available schemas:
```bash
cat src/middleware/validation-middleware.ts | grep "export const.*Schema"
```

**Expected Output:**
```typescript
export const registerSchema
export const loginSchema
export const createProjectSchema
export const submitProposalSchema
// ... 20+ schemas
```

2. Show schema structure:
```bash
cat src/middleware/validation-middleware.ts | grep -A 20 "registerSchema ="
```

**Explanation:** "We have 20+ predefined schemas covering all API endpoints. Each schema defines required fields, types, formats, and constraints."

---

### Demo 2.6: NoSQL Injection Protection ✅
**What to show:** Query builder prevents injection

**Steps:**
1. Show query examples:
```bash
cat src/repositories/project-repository.ts | grep -A 5 "\.select\|\.eq\|\.ilike"
```

**Expected Output:**
```typescript
.select('*')
.eq('id', projectId)
.ilike('title', `%${keyword}%`)
```

**Explanation:** "All queries use Supabase's query builder methods (.eq, .ilike, .select). No raw queries or string concatenation means no injection vulnerabilities."

---

### Demo 2.7: CSRF Protection ✅
**What to show:** CSRF tokens required for state-changing requests

**Steps:**
1. Show CSRF middleware:
```bash
cat src/middleware/csrf-middleware.ts | grep -A 10 "csrfProtection"
```

2. **Live Demo - Get CSRF Token:**
```bash
curl -X POST http://localhost:3000/api/auth/csrf-token \
  -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

**Expected Output:**
```json
{
  "message": "CSRF token generated and set in cookie",
  "token": "64-byte-token-here",
  "cookieName": "psifi.x-csrf-token"
}
```

3. **Try POST without CSRF token (should fail):**
```bash
curl -X POST http://localhost:3000/api/contracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}'
```

**Expected Output:** 403 Forbidden - CSRF validation failed

4. **Try POST with CSRF token (should work):**
```bash
CSRF_TOKEN=$(grep csrf-token cookies.txt | awk '{print $7}')

curl -X POST http://localhost:3000/api/contracts \
  -b cookies.txt \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Contract","amount":1000}'
```

**Explanation:** "CSRF protection uses double-submit cookie pattern. State-changing requests (POST/PUT/DELETE) require both cookie and header token. This prevents cross-site request forgery attacks."

---

## Category 3: Authorization (5 minutes)

### Demo 3.1: Role-Based Access Control ✅
**What to show:** Different roles have different permissions

**Steps:**
1. Show role middleware:
```bash
cat src/middleware/auth-middleware.ts | grep -A 20 "requireRole"
```

2. **Try accessing admin endpoint as freelancer:**
```bash
# Login as freelancer
FREELANCER_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"freelancer@test.com","password":"password123"}' \
  | jq -r '.accessToken')

# Try admin endpoint
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $FREELANCER_TOKEN"
```

**Expected Output:**
```json
{
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "Insufficient permissions"
  }
}
```

3. **Try with admin token:**
```bash
# Login as admin
ADMIN_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password123"}' \
  | jq -r '.accessToken')

# Try admin endpoint
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected Output:** Success - returns user list

**Explanation:** "Role-based access control ensures users can only access resources appropriate for their role. Freelancers can't access admin endpoints, employers can't access freelancer-only features, etc."

---

## Category 4: Threat Modeling (5 minutes)

### Demo 4.1: STRIDE Analysis & OWASP Mapping ✅
**What to show:** Comprehensive threat analysis documentation

**Steps:**
1. Show security implementation document:
```bash
cat docs/SECURITY_IMPLEMENTATION.md | head -50
```

2. Show OWASP compliance:
```bash
cat docs/SECURITY_IMPLEMENTATION.md | grep -A 20 "OWASP Top 10"
```

**Expected Output:**
```
- **PASS:** A01 (Broken Access Control) ✅
- **PASS:** A02 (Cryptographic Failures) ✅
- **PASS:** A03 (Injection) ✅
- **PASS:** A06 (Vulnerable Components) ✅
- **PASS:** A07 (Authentication Failures) ✅
- **PASS:** A09 (Logging/Monitoring) ✅
- **PASS:** A10 (SSRF) ✅
```

3. Show maintenance schedule:
```bash
cat docs/MAINTENANCE.md | grep -A 10 "Quarterly Tasks"
```

**Expected Output:**
```
### Quarterly Tasks
- Threat model review: Update docs/IAS.md
- Security assessment: OWASP Top 10 validation
- Next review: May 18, 2026
```

**Explanation:** "We have comprehensive threat modeling with STRIDE analysis, OWASP Top 10 mapping, and a quarterly review schedule to keep security current."

---

## Category 5: Documentation (5 minutes)

### Demo 5.1: Complete Documentation ✅
**What to show:** All documentation is comprehensive and organized

**Steps:**
1. **Show README:**
```bash
cat README.md | head -100
```

2. **Show Swagger UI:**
   - Open browser: `http://localhost:3000/api-docs`
   - Navigate through different API sections
   - Show request/response schemas

3. **Show documentation structure:**
```bash
ls -la docs/
```

**Expected Output:**
```
SECURITY_IMPLEMENTATION.md
MAINTENANCE.md
TROUBLESHOOTING.md
BLOCKCHAIN_INTEGRATION.md
IAS-Checklist.md
IAS-DEMO-GUIDE.md
content/
```

4. **Show troubleshooting guide:**
```bash
cat docs/TROUBLESHOOTING.md | grep "##"
```

**Expected Output:**
```
## General Setup & Configuration
## Blockchain Integration
## Authentication & Security
## Business Logic Services
## API Endpoints
## Data Models & Database
## AI-Powered Matching System
## Common Issues
```

**Explanation:** "We have comprehensive documentation including:
- Complete README with setup instructions
- Security implementation guide
- Interactive API documentation (Swagger)
- Deployment guides
- Troubleshooting guide with 30+ sections
- Maintenance runbook with schedules
- All organized and cross-referenced"

---

## Additional Demos (If Time Permits)

### Bonus Demo 1: Automated Dependency Scanning ✅
```bash
# Show Dependabot configuration
cat .github/dependabot.yml

# Run security audit
npm run security:audit
```

### Bonus Demo 2: Structured Logging with Sanitization ✅
```bash
# Show logger configuration
cat src/config/logger.ts | grep -A 10 "sanitize"

# Show log sanitizer
cat src/utils/log-sanitizer.ts | grep -A 10 "SENSITIVE_PATTERNS"
```

### Bonus Demo 3: SSRF Protection ✅
```bash
# Show URL validator
cat src/utils/url-validator.ts | grep -A 10 "validateUrl"
```

---

## Demo Checklist

Before presenting to professor, verify:

- [ ] Application is running (`npm run dev`)
- [ ] Swagger UI is accessible (`http://localhost:3000/api-docs`)
- [ ] Test user accounts exist (freelancer, employer, admin)
- [ ] Authenticator app is installed on phone
- [ ] Terminal commands are tested and working
- [ ] Browser tabs are prepared
- [ ] Code files are ready to show
- [ ] Documentation files are accessible

---

## Presentation Tips

1. **Start with Overview:** Show IAS-Checklist.md to give context
2. **Follow Categories:** Go through each category systematically
3. **Show Code + Live Demo:** For each feature, show code first, then demonstrate
4. **Explain Why:** Don't just show what, explain why it's important
5. **Handle Questions:** Be ready to dive deeper into any area
6. **Time Management:** Prioritize critical features if time is limited

---

## Quick Reference Commands

```bash
# Start server
npm run dev

# Get auth token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"password123"}' \
  | jq -r '.accessToken')

# Test authenticated endpoint
curl -X GET http://localhost:3000/api/profile \
  -H "Authorization: Bearer $TOKEN"

# Get CSRF token
curl -X POST http://localhost:3000/api/auth/csrf-token \
  -c cookies.txt -d '{}'

# Run security audit
npm run security:audit

# Show logs
tail -f logs/app.log
```

---

**Good luck with your demo! 🎓**
