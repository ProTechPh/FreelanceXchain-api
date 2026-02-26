# MFA Testing Guide

## Quick Start Testing

This guide shows you how to test the MFA implementation step by step.

## Prerequisites

1. Running FreelanceXchain API server
2. A registered user account
3. An authenticator app (Google Authenticator, Authy, etc.) OR online TOTP generator

## Step-by-Step Testing

### Step 1: Login and Get Access Token

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "YourPassword123!"
  }'
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "email": "your-email@example.com",
    "role": "admin"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "..."
}
```

**Save the `accessToken` for next steps!**

---

### Step 2: Enroll MFA

```bash
curl -X POST http://localhost:3000/api/auth/mfa/enroll \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "qrCode": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>...</svg>",
  "secret": "JBSWY3DPEHPK3PXP",
  "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429"
}
```

**What to do:**
1. Copy the `qrCode` SVG and save it as an HTML file to view it
2. OR copy the `secret` and manually enter it in your authenticator app
3. Save the `factorId` for verification

**To view QR code:**
```bash
# Save response to file
curl -X POST http://localhost:3000/api/auth/mfa/enroll \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  | jq -r '.qrCode' > qr.svg

# Open qr.svg in browser
```

---

### Step 3: Scan QR Code or Enter Secret

**Option A: Scan QR Code**
1. Open your authenticator app
2. Tap "Add account" or "+"
3. Scan the QR code from qr.svg
4. The app will show a 6-digit code that changes every 30 seconds

**Option B: Manual Entry**
1. Open your authenticator app
2. Tap "Enter a setup key" or "Manual entry"
3. Enter the `secret` from Step 2
4. Account name: "FreelanceXchain"
5. The app will show a 6-digit code

**Option C: Online TOTP Generator (for testing only)**
1. Go to https://totp.danhersam.com/
2. Paste the `secret` from Step 2
3. Click "Generate"
4. Use the displayed 6-digit code

---

### Step 4: Verify MFA Enrollment

```bash
curl -X POST http://localhost:3000/api/auth/mfa/verify-enrollment \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429",
    "code": "123456"
  }'
```

**Replace:**
- `YOUR_ACCESS_TOKEN` with your token from Step 1
- `factorId` with the ID from Step 2
- `code` with the 6-digit code from your authenticator app

**Success Response:**
```json
{
  "message": "MFA enrollment verified successfully"
}
```

**MFA is now active on your account! 🎉**

---

### Step 5: List Your MFA Factors

```bash
curl -X GET http://localhost:3000/api/auth/mfa/factors \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "factors": [
    {
      "id": "d30fd651-184e-4748-a928-0a4b9be1d429",
      "friendly_name": "totp",
      "factor_type": "totp",
      "status": "verified",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:35:00Z"
    }
  ]
}
```

---

### Step 6: Test MFA Login Flow

Now that MFA is enrolled, test the login flow:

**6.1: Login (First Factor)**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "YourPassword123!"
  }'
```

You'll get an access token, but it's at AAL1 (Authenticator Assurance Level 1).

**6.2: Create MFA Challenge**
```bash
curl -X POST http://localhost:3000/api/auth/mfa/challenge \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429"
  }'
```

**Response:**
```json
{
  "challengeId": "c2cd3f6c-fa27-4c78-a7e7-f0c3c3f4f5e5"
}
```

**6.3: Verify MFA Challenge**
```bash
curl -X POST http://localhost:3000/api/auth/mfa/verify \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429",
    "challengeId": "c2cd3f6c-fa27-4c78-a7e7-f0c3c3f4f5e5",
    "code": "123456"
  }'
```

**Success Response:**
```json
{
  "message": "MFA verified successfully"
}
```

**Your session is now at AAL2! 🔒**

---

### Step 7: Test MFA Enforcement (Admin Only)

If you're an admin user, try accessing an admin endpoint without completing MFA:

```bash
# This should fail with MFA_REQUIRED error
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer YOUR_AAL1_TOKEN"
```

**Expected Error:**
```json
{
  "error": {
    "code": "MFA_REQUIRED",
    "message": "Multi-factor authentication is required for admin and arbitrator accounts. Please enroll MFA to continue."
  }
}
```

After completing MFA verification (Step 6), the same request should succeed.

---

### Step 8: Disable MFA (Optional)

To remove MFA from your account:

```bash
curl -X POST http://localhost:3000/api/auth/mfa/disable \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429"
  }'
```

**Success Response:**
```json
{
  "message": "MFA disabled successfully"
}
```

---

## Testing with Postman

### Import Collection

Create a Postman collection with these requests:

1. **Login** - POST `/api/auth/login`
2. **Enroll MFA** - POST `/api/auth/mfa/enroll`
3. **Verify Enrollment** - POST `/api/auth/mfa/verify-enrollment`
4. **List Factors** - GET `/api/auth/mfa/factors`
5. **Challenge** - POST `/api/auth/mfa/challenge`
6. **Verify Challenge** - POST `/api/auth/mfa/verify`
7. **Disable MFA** - POST `/api/auth/mfa/disable`

### Environment Variables

Set these in Postman:
- `baseUrl`: `http://localhost:3000`
- `accessToken`: (set after login)
- `factorId`: (set after enrollment)
- `challengeId`: (set after challenge)

---

## Common Issues

### Issue 1: "Invalid verification code"

**Cause**: Time sync issue between server and authenticator app

**Solution**:
- Ensure your device time is synced (automatic time)
- Try the next code (wait 30 seconds)
- Check if you're using the correct secret/QR code

### Issue 2: "Invalid or expired token"

**Cause**: Access token expired

**Solution**:
- Login again to get a fresh token
- Use the refresh token endpoint if available

### Issue 3: QR code not displaying

**Cause**: SVG rendering issue

**Solution**:
- Save the QR code to an HTML file
- Use the secret for manual entry instead
- Use a base64 decoder if needed

### Issue 4: "MFA_REQUIRED" error

**Cause**: Admin user hasn't completed MFA verification

**Solution**:
- Complete the MFA challenge flow (Steps 6.2 and 6.3)
- Ensure you're using the updated access token after verification

---

## Automated Testing Script

Save this as `test-mfa.sh`:

```bash
#!/bin/bash

# Configuration
API_URL="http://localhost:3000"
EMAIL="admin@example.com"
PASSWORD="Admin123!"

echo "=== MFA Testing Script ==="
echo ""

# Step 1: Login
echo "1. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')
echo "✓ Access token obtained"
echo ""

# Step 2: Enroll MFA
echo "2. Enrolling MFA..."
ENROLL_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/mfa/enroll" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

SECRET=$(echo $ENROLL_RESPONSE | jq -r '.secret')
FACTOR_ID=$(echo $ENROLL_RESPONSE | jq -r '.factorId')
echo "✓ MFA enrollment initiated"
echo "Secret: $SECRET"
echo "Factor ID: $FACTOR_ID"
echo ""

# Save QR code
echo $ENROLL_RESPONSE | jq -r '.qrCode' > qr.svg
echo "✓ QR code saved to qr.svg"
echo ""

echo "3. Please scan the QR code or enter the secret in your authenticator app"
echo "   Then enter the 6-digit code:"
read -p "Code: " MFA_CODE
echo ""

# Step 3: Verify enrollment
echo "4. Verifying MFA enrollment..."
VERIFY_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/mfa/verify-enrollment" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"factorId\":\"$FACTOR_ID\",\"code\":\"$MFA_CODE\"}")

echo $VERIFY_RESPONSE | jq '.'
echo ""

# Step 4: List factors
echo "5. Listing MFA factors..."
FACTORS_RESPONSE=$(curl -s -X GET "$API_URL/api/auth/mfa/factors" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

echo $FACTORS_RESPONSE | jq '.'
echo ""

echo "=== MFA Testing Complete ==="
```

Make it executable:
```bash
chmod +x test-mfa.sh
./test-mfa.sh
```

---

## Next Steps

1. ✅ Test all MFA endpoints
2. ✅ Verify QR code scanning works
3. ✅ Test MFA enforcement for admin users
4. ✅ Integrate with frontend application
5. ✅ Add MFA to user settings page
6. ✅ Document MFA flow for end users

## Support

For issues or questions:
- Check the main documentation: `docs/MFA_IMPLEMENTATION.md`
- Review Supabase MFA docs: https://supabase.com/docs/guides/auth/auth-mfa
- Check server logs for detailed error messages
