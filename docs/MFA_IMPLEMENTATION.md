# Multi-Factor Authentication (MFA) Implementation

## Overview

MFA is already fully implemented in the FreelanceXchain API using Supabase's built-in MFA capabilities with TOTP (Time-based One-Time Password) authentication.

## Implementation Status ✅

The following MFA features are **already implemented**:

### 1. MFA Enrollment
- **Endpoint**: `POST /api/auth/mfa/enroll`
- **Authentication**: Required (Bearer token)
- **Description**: Initiates MFA enrollment and returns QR code for authenticator app
- **Response**: 
  ```json
  {
    "qrCode": "data:image/svg+xml;base64,...",
    "secret": "JBSWY3DPEHPK3PXP",
    "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429"
  }
  ```

### 2. Verify MFA Enrollment
- **Endpoint**: `POST /api/auth/mfa/verify-enrollment`
- **Authentication**: Required (Bearer token)
- **Body**:
  ```json
  {
    "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429",
    "code": "123456"
  }
  ```
- **Description**: Verifies the TOTP code to complete MFA enrollment

### 3. MFA Challenge (Login)
- **Endpoint**: `POST /api/auth/mfa/challenge`
- **Authentication**: Required (Bearer token)
- **Body**:
  ```json
  {
    "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429"
  }
  ```
- **Response**:
  ```json
  {
    "challengeId": "c2cd3f6c-fa27-4c78-a7e7-f0c3c3f4f5e5"
  }
  ```

### 4. Verify MFA Challenge
- **Endpoint**: `POST /api/auth/mfa/verify`
- **Authentication**: Required (Bearer token)
- **Body**:
  ```json
  {
    "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429",
    "challengeId": "c2cd3f6c-fa27-4c78-a7e7-f0c3c3f4f5e5",
    "code": "123456"
  }
  ```

### 5. List MFA Factors
- **Endpoint**: `GET /api/auth/mfa/factors`
- **Authentication**: Required (Bearer token)
- **Response**:
  ```json
  {
    "factors": [
      {
        "id": "d30fd651-184e-4748-a928-0a4b9be1d429",
        "friendly_name": "My Authenticator",
        "factor_type": "totp",
        "status": "verified"
      }
    ]
  }
  ```

### 6. Disable MFA
- **Endpoint**: `POST /api/auth/mfa/disable`
- **Authentication**: Required (Bearer token)
- **Body**:
  ```json
  {
    "factorId": "d30fd651-184e-4748-a928-0a4b9be1d429"
  }
  ```

## MFA Enforcement

### Admin Role Enforcement
The system includes middleware (`enforceMFAForAdmins`) that enforces MFA for admin users:

- **Location**: `src/middleware/mfa-enforcement.ts`
- **Behavior**: 
  - Checks if user has admin role
  - Verifies at least one MFA factor is enrolled and verified
  - Returns `403 MFA_REQUIRED` error if MFA is not set up
  - Allows access if MFA is properly configured

### Optional MFA Recommendation
The `recommendMFA` middleware adds headers to responses suggesting MFA enrollment without blocking access.

## Technical Implementation

### Service Layer
All MFA logic is implemented in `src/services/auth-service.ts`:

- `enrollMFA()` - Initiates enrollment with Supabase
- `verifyMFAEnrollment()` - Verifies enrollment code
- `challengeMFA()` - Creates login challenge
- `verifyMFAChallenge()` - Verifies login code
- `getMFAFactors()` - Lists user's factors
- `disableMFA()` - Removes MFA factor

### Supabase Integration
The implementation uses Supabase's native MFA APIs:

```typescript
// Enrollment
await supabase.auth.mfa.enroll({ factorType: 'totp' })

// Challenge
await supabase.auth.mfa.challenge({ factorId })

// Verify
await supabase.auth.mfa.verify({ factorId, challengeId, code })

// List factors
await supabase.auth.mfa.listFactors()

// Unenroll
await supabase.auth.mfa.unenroll({ factorId })
```

## User Flow

### Enrollment Flow
1. User logs in with email/password
2. User calls `/api/auth/mfa/enroll` with Bearer token
3. Backend returns QR code and secret
4. User scans QR code with authenticator app (Google Authenticator, Authy, 1Password, etc.)
5. User enters 6-digit code from app
6. User calls `/api/auth/mfa/verify-enrollment` with code
7. MFA is now active for the account

### Login Flow with MFA
1. User logs in with email/password → receives access token (AAL1)
2. Frontend checks if user has MFA enrolled
3. If MFA enrolled:
   - Call `/api/auth/mfa/challenge` with factorId
   - Receive challengeId
   - User enters 6-digit code from authenticator app
   - Call `/api/auth/mfa/verify` with code
   - Session upgraded to AAL2 (higher assurance level)

### Unenrollment Flow
1. User navigates to security settings
2. User calls `/api/auth/mfa/factors` to list factors
3. User selects factor to remove
4. User calls `/api/auth/mfa/disable` with factorId
5. MFA is removed from account

## Authenticator Assurance Levels (AAL)

Supabase uses AAL to indicate authentication strength:

- **AAL1**: User authenticated with single factor (email/password)
- **AAL2**: User authenticated with MFA (second factor verified)

The JWT token contains an `aal` claim that can be checked:

```typescript
// Check AAL level
const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
console.log(data.currentLevel) // 'aal1' or 'aal2'
console.log(data.nextLevel)    // 'aal1' or 'aal2'
```

## Supported Authenticator Apps

Users can use any TOTP-compatible authenticator app:

- Google Authenticator
- Microsoft Authenticator
- Authy
- 1Password
- Bitwarden
- LastPass Authenticator
- Any app supporting RFC 6238 (TOTP)

## Security Features

1. **Time-based codes**: Codes expire after 30 seconds
2. **Clock skew tolerance**: Allows 1 interval tolerance for time differences
3. **QR code format**: Standard `otpauth://` URI format
4. **Manual entry**: Secret can be manually entered if QR scan fails
5. **Multiple factors**: Users can enroll multiple TOTP factors
6. **Factor management**: Users can list and remove factors

## Testing MFA

### Using Postman/cURL

1. **Enroll MFA**:
```bash
curl -X POST http://localhost:3000/api/auth/mfa/enroll \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

2. **Verify Enrollment**:
```bash
curl -X POST http://localhost:3000/api/auth/mfa/verify-enrollment \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "factorId": "FACTOR_ID_FROM_ENROLL",
    "code": "123456"
  }'
```

3. **List Factors**:
```bash
curl -X GET http://localhost:3000/api/auth/mfa/factors \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Using a Test Authenticator

For testing, you can use:
- **Online TOTP Generator**: https://totp.danhersam.com/
- **Browser Extension**: Authenticator extension for Chrome/Firefox
- **Mobile App**: Google Authenticator or Authy

## Frontend Integration Example

```typescript
// Enroll MFA
async function enrollMFA(accessToken: string) {
  const response = await fetch('/api/auth/mfa/enroll', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  const { qrCode, secret, factorId } = await response.json();
  
  // Display QR code to user
  document.getElementById('qr-code').innerHTML = qrCode;
  
  return { secret, factorId };
}

// Verify enrollment
async function verifyEnrollment(accessToken: string, factorId: string, code: string) {
  const response = await fetch('/api/auth/mfa/verify-enrollment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ factorId, code })
  });
  
  return response.ok;
}

// Challenge during login
async function challengeMFA(accessToken: string, factorId: string) {
  const response = await fetch('/api/auth/mfa/challenge', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ factorId })
  });
  
  const { challengeId } = await response.json();
  return challengeId;
}

// Verify challenge
async function verifyChallenge(
  accessToken: string, 
  factorId: string, 
  challengeId: string, 
  code: string
) {
  const response = await fetch('/api/auth/mfa/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ factorId, challengeId, code })
  });
  
  return response.ok;
}
```

## Configuration

MFA is enabled by default in Supabase. No additional configuration is required.

To customize MFA settings:
1. Go to Supabase Dashboard
2. Navigate to Authentication → Settings
3. Configure MFA options under "Multi-Factor Authentication"

## Error Codes

| Code | Description |
|------|-------------|
| `MFA_ENROLLMENT_FAILED` | Failed to initiate MFA enrollment |
| `MFA_VERIFICATION_FAILED` | Invalid verification code |
| `MFA_CHALLENGE_FAILED` | Failed to create MFA challenge |
| `MFA_LIST_FAILED` | Failed to list MFA factors |
| `MFA_DISABLE_FAILED` | Failed to disable MFA |
| `MFA_REQUIRED` | MFA is required for this account (admin enforcement) |
| `INVALID_TOKEN` | Invalid or expired access token |

## Next Steps

The MFA implementation is complete. To use it:

1. **Test the endpoints** using Postman or cURL
2. **Integrate with frontend** using the example code above
3. **Enable MFA enforcement** for specific routes by adding the `enforceMFAForAdmins` middleware
4. **Customize MFA policies** in Supabase Dashboard if needed

## Additional Resources

- [Supabase MFA Documentation](https://supabase.com/docs/guides/auth/auth-mfa)
- [TOTP RFC 6238](https://tools.ietf.org/html/rfc6238)
- [Google Authenticator Key URI Format](https://github.com/google/google-authenticator/wiki/Key-Uri-Format)
