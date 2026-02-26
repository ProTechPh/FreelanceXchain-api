# 15-Minute Quick Demo Script for Professor
**For when you have limited time**

---

## Setup (1 minute)
```bash
cd FreelanceXchain-api
npm run dev
```

Open browser tabs:
1. `http://localhost:3000/api-docs` (Swagger UI)
2. `http://localhost:3000/health` (Health check)

---

## Demo Flow (14 minutes)

### 1. Authentication & MFA (4 minutes)

**Show:** "We have comprehensive authentication with MFA enforcement"

```bash
# Show rate limiting - try 11 login attempts
for i in {1..11}; do
  curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}' \
    -w "\nAttempt $i: HTTP %{http_code}\n"
done
```

**Point out:** "First 10 fail with 401, 11th blocked with 429 - rate limiting works!"

**Show MFA enrollment:**
```bash
# Login as admin
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"YourPassword"}' \
  | jq -r '.accessToken')

# Enroll MFA
curl -X POST http://localhost:3000/api/auth/mfa/enroll \
  -H "Authorization: Bearer $TOKEN" | jq '.qrCode' -r
```

**Show QR code in browser** - "Scan with Google Authenticator"

---

### 2. Input Validation (3 minutes)

**Show:** "All inputs are validated with detailed error messages"

```bash
# Try invalid project creation
curl -X POST http://localhost:3000/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"AB","description":"short","budget":-100}' | jq
```

**Point out:** "See the detailed validation errors for each field"

**Show code:**
```bash
cat src/middleware/validation-middleware.ts | grep -A 10 "createProjectSchema"
```

---

### 3. CSRF Protection (3 minutes)

**Show:** "CSRF tokens prevent cross-site attacks"

```bash
# Get CSRF token
curl -X POST http://localhost:3000/api/auth/csrf-token \
  -c cookies.txt -d '{}' | jq

# Try POST without CSRF (fails)
curl -X POST http://localhost:3000/api/contracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}' -w "\nHTTP: %{http_code}\n"
```

**Point out:** "403 Forbidden - CSRF protection working"

```bash
# Try with CSRF token (works)
CSRF=$(grep csrf-token cookies.txt | awk '{print $7}')
curl -X POST http://localhost:3000/api/contracts \
  -b cookies.txt \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}' -w "\nHTTP: %{http_code}\n"
```

---

### 4. Role-Based Access Control (2 minutes)

**Show:** "Different roles have different permissions"

```bash
# Login as freelancer
FREELANCER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"freelancer@test.com","password":"password123"}' \
  | jq -r '.accessToken')

# Try admin endpoint (fails)
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $FREELANCER_TOKEN" | jq
```

**Point out:** "403 Forbidden - insufficient permissions"

---

### 5. Documentation & Security Posture (2 minutes)

**Show Swagger UI in browser:**
- Navigate to `http://localhost:3000/api-docs`
- Show different API sections
- Show request/response schemas

**Show security documentation:**
```bash
cat docs/SECURITY_IMPLEMENTATION.md | grep -A 10 "Overall Security Posture"
```

**Point out:** "HIGH - Production Ready ✅"

**Show IAS Checklist:**
```bash
cat docs/IAS-Checklist.md | grep "Status:"
```

**Point out:** "All 30 items verified and implemented"

---

## Closing Statement

"We have implemented:
- ✅ 9/9 Authentication features (including MFA)
- ✅ 7/7 Input validation features (including CSRF)
- ✅ Role-based access control
- ✅ 7/7 Threat modeling items
- ✅ 7/7 Documentation items

**Total: 30/30 items complete**

Security posture: HIGH - Production Ready

All code is available in the repository with comprehensive documentation."

---

## If Professor Asks Questions

### "How do you prevent SQL injection?"
```bash
cat src/repositories/user-repository.ts | grep -A 5 "findByEmail"
```
"We use Supabase query builder which automatically parameterizes all queries."

### "Show me the password policy"
```bash
cat src/middleware/validation-middleware.ts | grep -A 5 "password:"
```
"Minimum 8 characters, maximum 128, enforced at validation layer."

### "How do you handle file uploads?"
```bash
cat src/middleware/file-upload-middleware.ts | grep -A 10 "ALLOWED_MIME_TYPES"
```
"Magic number validation, size limits, filename sanitization, rate limiting."

### "What about logging?"
```bash
cat src/config/logger.ts | grep -A 10 "sanitize"
```
"All logs are sanitized to remove sensitive data like tokens, passwords, PII."

### "Show me the threat model"
```bash
cat docs/SECURITY_IMPLEMENTATION.md | grep -A 20 "OWASP Top 10"
```
"7/10 PASS, 3/10 PARTIAL. All critical vulnerabilities resolved."

---

## Emergency Backup (If Demo Fails)

If the server won't start or something breaks:

1. **Show the code instead:**
   - Open VS Code
   - Navigate through key files
   - Show implementation details

2. **Show documentation:**
   - Open `docs/IAS-Checklist.md`
   - Open `docs/SECURITY_IMPLEMENTATION.md`
   - Walk through each verified item

3. **Show test results:**
   ```bash
   npm test
   ```

4. **Show Swagger JSON:**
   ```bash
   cat src/config/swagger.js
   ```

---

## Time Variants

### 5-Minute Version
1. Show IAS-Checklist.md (1 min)
2. Demo rate limiting (1 min)
3. Demo CSRF protection (1 min)
4. Show Swagger UI (1 min)
5. Show security posture (1 min)

### 10-Minute Version
Add:
- MFA enrollment demo
- Input validation demo
- RBAC demo

### 30-Minute Version
Use full IAS-DEMO-GUIDE.md

---

**Remember:**
- Stay calm
- Explain WHY each feature matters
- Show code + live demo for each feature
- Be ready to dive deeper on any topic
- Have documentation open as backup

**Good luck! 🎓**
