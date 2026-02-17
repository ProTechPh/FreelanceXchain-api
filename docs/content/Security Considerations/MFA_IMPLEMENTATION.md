# Multi-Factor Authentication (MFA) Implementation Guide

## Overview

The FreelanceXchain API implements Multi-Factor Authentication (MFA) using Time-based One-Time Passwords (TOTP) for enhanced security. MFA is **required for admin accounts** and optional for other user roles.

## Architecture

### Technology Stack
- **Provider**: Supabase Auth MFA
- **Method**: TOTP (Time-based One-Time Password)
- **Standard**: RFC 6238
- **Authenticator Apps**: Google Authenticator, Authy, Microsoft Authenticator, 1Password, etc.

### Enforcement Policy
- **Admin Role**: MFA is **required** before accessing protected resources
- **Freelancer/Employer Roles**: MFA is optional but recommended
- **Enforcement Middleware**: `mfa-enforcement.ts` checks MFA status for admin users

## API Endpoints

### 1. Enroll MFA
**Endpoint**: `POST /api/auth/mfa/enroll`  
**Authentication**: Required (Bearer token)  
**Description**: Initiates MFA enrollment and returns QR code for authenticator app

**Request Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "qrCode": "data:image/png;base64,...",
  "secret": "JBSWY3DPEHPK3PXP",
  "factorId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Usage Flow**:
1. User calls enrollment endpoint
2. Backend generates TOTP secret via Supabase
3. QR code is returned for scanning with authenticator app
4. User scans QR code or manually enters secret
5. User proceeds to verification step

---

### 2. Verify MFA Enrollment
**Endpoint**: `POST /api/auth/mfa/verify-enrollment`  
**Authentication**: Required (Bearer token)  
**Description**: Verifies the TOTP code to complete MFA enrollment

**Request Headers**:
```
Authorization: Bearer <access_token>
```

**Request Body**:
```json
{
  "factorId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "code": "123456"
}
```

**Response** (200 OK):
```json
{
  "message": "MFA enrollment verified successfully"
}
```

**Error Response** (400 Bad Request):
```json
{
  "error": {
    "code": "MFA_VERIFICATION_FAILED",
    "message": "Invalid verification code"
  },
  "timestamp": "2026-02-18T10:30:00.000Z",
  "requestId": "abc123"
}
```

---

### 3. Create MFA Challenge
**Endpoint**: `POST /api/auth/mfa/challenge`  
**Authentication**: Required (Bearer token)  
**Description**: Creates an MFA challenge for login verification

**Request Body**:
```json
{
  "factorId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Response** (200 OK):
```json
{
  "challengeId": "c47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

---

### 4. Verify MFA Challenge
**Endpoint**: `POST /api/auth/mfa/verify`  
**Authentication**: Required (Bearer token)  
**Description**: Verifies the TOTP code for an MFA challenge

**Request Body**:
```json
{
  "factorId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "challengeId": "c47ac10b-58cc-4372-a567-0e02b2c3d479",
  "code": "123456"
}
```

**Response** (200 OK):
```json
{
  "message": "MFA verified successfully"
}
```

---

### 5. Get MFA Factors
**Endpoint**: `GET /api/auth/mfa/factors`  
**Authentication**: Required (Bearer token)  
**Description**: Returns list of enrolled MFA factors for the user

**Response** (200 OK):
```json
{
  "factors": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "type": "totp",
      "status": "verified",
      "created_at": "2026-02-18T10:00:00.000Z"
    }
  ]
}
```

---

### 6. Disable MFA
**Endpoint**: `POST /api/auth/mfa/disable`  
**Authentication**: Required (Bearer token)  
**Description**: Disables MFA for the user

**Request Body**:
```json
{
  "factorId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Response** (200 OK):
```json
{
  "message": "MFA disabled successfully"
}
```

---

## Implementation Details

### MFA Enforcement Middleware

The `enforceMFAForAdmins` middleware automatically checks if admin users have MFA enabled:

```typescript
// Applied to protected admin routes
router.post('/admin/action', authMiddleware, enforceMFAForAdmins, handler);
```

**Behavior**:
- Non-admin users: Middleware passes through without checks
- Admin users without MFA: Returns 403 with `MFA_REQUIRED` error
- Admin users with MFA: Proceeds to route handler

**Error Response** (403 Forbidden):
```json
{
  "error": {
    "code": "MFA_REQUIRED",
    "message": "Multi-factor authentication is required for admin accounts. Please enroll MFA to continue."
  },
  "timestamp": "2026-02-18T10:30:00.000Z",
  "requestId": "abc123"
}
```

---

## User Flows

### Admin User - First Login (MFA Enrollment Required)

1. **Login**: User logs in with email/password
2. **Access Protected Resource**: User attempts to access admin endpoint
3. **MFA Check**: Middleware detects no MFA enrolled
4. **403 Response**: User receives `MFA_REQUIRED` error
5. **Enroll MFA**: User calls `/api/auth/mfa/enroll`
6. **Scan QR Code**: User scans QR code with authenticator app
7. **Verify Enrollment**: User calls `/api/auth/mfa/verify-enrollment` with TOTP code
8. **Success**: MFA is now enabled, user can access admin resources

### Admin User - Subsequent Logins (MFA Already Enrolled)

1. **Login**: User logs in with email/password
2. **Access Protected Resource**: User attempts to access admin endpoint
3. **MFA Check**: Middleware detects MFA is enrolled
4. **Success**: User can access admin resources (TOTP verification happens at Supabase level)

### Regular User (Freelancer/Employer) - Optional MFA

1. **Login**: User logs in with email/password
2. **Optional Enrollment**: User can choose to enroll MFA for added security
3. **No Enforcement**: MFA is not required for regular operations

---

## Security Considerations

### TOTP Secret Storage
- Secrets are stored securely by Supabase Auth
- Never exposed in API responses after initial enrollment
- Encrypted at rest in Supabase database

### Code Validation
- TOTP codes are 6 digits
- Valid for 30-second time window
- One-time use (replay protection)
- Time-drift tolerance: ±1 time step

### Recovery Mechanisms
- **Account Recovery**: Users can disable MFA through account recovery flow
- **Admin Override**: System administrators can disable MFA for locked-out users
- **Backup Codes**: Consider implementing backup codes for account recovery (future enhancement)

### Rate Limiting
- MFA verification attempts are rate-limited
- Prevents brute-force attacks on TOTP codes
- Lockout after multiple failed attempts

---

## Testing

### Manual Testing

1. **Enroll MFA**:
```bash
curl -X POST https://api.freelancexchain.com/api/auth/mfa/enroll \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

2. **Verify Enrollment**:
```bash
curl -X POST https://api.freelancexchain.com/api/auth/mfa/verify-enrollment \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"factorId": "<factor_id>", "code": "123456"}'
```

3. **Check MFA Status**:
```bash
curl -X GET https://api.freelancexchain.com/api/auth/mfa/factors \
  -H "Authorization: Bearer <token>"
```

### Integration Tests

Create tests for:
- MFA enrollment flow
- TOTP code verification
- MFA enforcement for admin users
- MFA bypass for non-admin users
- Error handling for invalid codes
- Factor management (list, disable)

---

## Troubleshooting

### Issue: QR Code Not Displaying
**Cause**: QR code data is base64-encoded PNG  
**Solution**: Ensure frontend properly decodes and displays the image

### Issue: TOTP Codes Always Invalid
**Cause**: Time synchronization issue between server and client  
**Solution**: 
- Verify server time is accurate (use NTP)
- Check authenticator app time settings
- Ensure time zone is correct

### Issue: MFA Enforcement Not Working
**Cause**: Middleware not applied to route  
**Solution**: Verify `enforceMFAForAdmins` is added to route middleware chain

### Issue: User Locked Out After MFA Enrollment
**Cause**: User lost access to authenticator app  
**Solution**: 
- Use admin override to disable MFA
- Implement account recovery flow
- Consider adding backup codes

---

## Future Enhancements

1. **Backup Codes**: Generate one-time backup codes during enrollment
2. **SMS/Email MFA**: Alternative MFA methods for users without smartphones
3. **Remember Device**: Option to skip MFA for trusted devices (30 days)
4. **MFA Analytics**: Track MFA adoption rates and usage patterns
5. **Biometric MFA**: Support for WebAuthn/FIDO2 hardware keys
6. **Conditional MFA**: Require MFA based on risk factors (IP, location, device)

---

## References

- [RFC 6238 - TOTP Specification](https://tools.ietf.org/html/rfc6238)
- [Supabase MFA Documentation](https://supabase.com/docs/guides/auth/auth-mfa)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

**Last Updated**: February 18, 2026  
**Maintained By**: FreelanceXchain Security Team
