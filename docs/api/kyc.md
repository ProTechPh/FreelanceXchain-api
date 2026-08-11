# KYC Verification API

The FreelanceXchain KYC system uses [Didit](https://docs.didit.me) as the identity verification provider. Didit handles document verification, liveness checks, face matching, and IP analysis. The API manages verification sessions, receives webhook updates, and provides admin review workflows.

## Table of Contents

- [Endpoints](#endpoints)
  - [User Endpoints](#user-endpoints)
  - [Webhook](#webhook)
  - [Admin Endpoints](#admin-endpoints)
- [Schemas](#schemas)
  - [KycVerification](#kycverification)
  - [KycStatus](#kycstatus)
- [Didit Integration](#didit-integration)
  - [Session Flow](#session-flow)
  - [Webhook Events](#webhook-events)
  - [Verification Results](#verification-results)

## Endpoints

### User Endpoints

#### POST /api/kyc/initiate

Create a new Didit verification session. Returns a session URL where the user completes identity verification.

- **Auth:** Bearer JWT
- **Response:** `201` - KycVerification object with `didit_session_url`
- **Errors:**
  - `400` - User already has an active verification
  - `401` - Unauthorized
  - `404` - User not found

#### GET /api/kyc/status

Get the current user's KYC verification status.

- **Auth:** Bearer JWT
- **Response:** `200` - KycVerification object
- **Errors:**
  - `401` - Unauthorized
  - `404` - No verification found

#### GET /api/kyc/verified

Quick check whether the current user is verified.

- **Auth:** Bearer JWT
- **Response:** `200` - `{ verified: boolean }`

#### GET /api/kyc/profile-data

Returns verified KYC data for pre-populating user profiles.

- **Auth:** Bearer JWT
- **Response:** `200` - `{ name, first_name, last_name, location, nationality, kyc_verified, kyc_verified_at }`
- **Errors:**
  - `400` - KYC not approved or not found

#### GET /api/kyc/history

Get all verification records for the current user.

- **Auth:** Bearer JWT
- **Response:** `200` - KycVerification[]

#### POST /api/kyc/refresh/:verificationId

Manually fetch the latest status from the Didit API.

- **Auth:** Bearer JWT
- **Path Params:** `verificationId` (UUID)
- **Response:** `200` - Updated KycVerification object
- **Errors:**
  - `403` - Not the verification owner (unless admin)
  - `404` - Verification not found

### Webhook

#### POST /api/kyc/webhook

Receives verification status updates from Didit. No JWT auth -- validated via `x-signature-v2` and `x-timestamp` headers.

- **Request Body:** Didit webhook payload (see [Webhook Events](#webhook-events))
- **Rate limit:** webhookRateLimiter (60 req / min per IP, fail-open on Redis errors)
- **Response:** `200` - `{ message: "Webhook processed" }`
- **Errors:**
  - `400` - Invalid payload
  - `401` - Invalid signature

**Signature verification:** the HMAC is computed over the raw request bytes
(`req.rawBody`, captured by the `express.json` verify hook for webhook paths),
falling back to `JSON.stringify(req.body ?? {})` when rawBody is unavailable.

**Idempotency:** Didit delivers at-least-once. Duplicate `event_id`s are
acknowledged and skipped (per-process dedup), and the per-session lock plus a
final-state guard (approved/rejected/expired never regress) make re-delivery
safe across instances.

### Admin Endpoints

All admin endpoints require Bearer JWT with `admin` role.

#### GET /api/kyc/admin/pending

Get verifications pending admin review.

- **Response:** `200` - KycVerification[]

#### GET /api/kyc/admin/status/:status

Get verifications filtered by status.

- **Path Params:** `status` - one of `pending`, `in_progress`, `completed`, `approved`, `rejected`, `expired`
- **Response:** `200` - Transformed verification list (camelCase)

#### POST /api/kyc/admin/review/:verificationId

Approve or reject a completed verification.

- **Path Params:** `verificationId` (UUID)
- **Request Body:**

  ```json
  {
    "decision": "approved | rejected",
    "notes": "optional admin notes"
  }
  ```

- **Response:** `200` - Updated KycVerification
- **Errors:**
  - `400` - Invalid decision
  - `404` - Verification not found

#### GET /api/kyc/admin/verification/:verificationId

Get full verification details for a specific record.

- **Path Params:** `verificationId` (UUID)
- **Response:** `200` - KycVerification object
- **Errors:**
  - `400` - Invalid ID
  - `404` - Verification not found

#### POST /api/kyc/admin/manual-verify

Upload user documents for manual verification via Didit standalone APIs.

- **Content-Type:** `multipart/form-data`
- **Fields:**
  - `userId` (UUID, required)
  - `id_front` (image file, required)
  - `id_back` (image file, optional)
  - `selfie` (image file, required)
- **File Limits:** 10MB per file, images only
- **Response:** `200` - `{ message: "Manual verification completed", verification: KycVerification }`
- **Errors:**
  - `400` - Missing files or user ID
  - `404` - User not found

## Schemas

### KycVerification

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "status": "pending | in_progress | completed | approved | rejected | expired",
  "didit_session_id": "string",
  "didit_session_url": "string (URL for user verification)",
  "didit_session_token": "string | null",
  "didit_workflow_id": "string",
  "decision": "approved | declined | review | null",
  "decline_reasons": ["string"] | null,
  "review_reasons": ["string"] | null,
  "document_type": "string | null",
  "document_number": "string | null",
  "issuing_country": "string | null",
  "first_name": "string | null",
  "last_name": "string | null",
  "date_of_birth": "string | null",
  "nationality": "string | null",
  "document_verified": "boolean | null",
  "liveness_passed": "boolean | null",
  "liveness_confidence_score": "string | null",
  "spoofing_detected": "boolean | null",
  "face_matched": "boolean | null",
  "face_similarity_score": "string | null",
  "ip_address": "string | null",
  "ip_country_code": "string | null",
  "ip_risk_score": "string | null",
  "is_vpn": "boolean | null",
  "is_proxy": "boolean | null",
  "threat_level": "string | null",
  "reviewed_by": "uuid | null",
  "reviewed_at": "date-time | null",
  "admin_notes": "string | null",
  "created_at": "date-time",
  "updated_at": "date-time",
  "completed_at": "date-time | null",
  "expires_at": "date-time | null"
}
```

### KycStatus

| Status | Description |
|--------|-------------|
| `pending` | Session created, user has not started verification |
| `in_progress` | User is actively completing verification on Didit |
| `completed` | Didit finished processing, awaiting decision or admin review |
| `approved` | Verification passed (auto via Didit or manual admin review) |
| `rejected` | Verification failed or was rejected by admin |
| `expired` | Session expired before completion |

## Didit Integration

### Session Flow

1. Client calls `POST /api/kyc/initiate` to create a verification session.
2. API creates a Didit session via their API and stores the `session_id`, `session_url`, and `session_token` locally.
3. Client redirects the user to the `didit_session_url` to complete document upload, liveness check, and face matching.
4. Didit processes the verification and sends webhook updates to `POST /api/kyc/webhook`.
5. The webhook handler updates local verification records with results.
6. If configured, Didit auto-approves/declines; otherwise the verification goes to admin review.
7. Admins can review via `POST /api/kyc/admin/review/:id` or run manual verification via `POST /api/kyc/admin/manual-verify`.

### Webhook Events

Didit sends two webhook types:

| Type | Description |
|------|-------------|
| `status.updated` | Verification status changed |
| `data.updated` | Verification data updated (decision available) |

Possible webhook statuses: `Not Started`, `In Progress`, `Awaiting User`, `In Review`, `Approved`, `Declined`, `Resubmitted`, `Abandoned`, `Expired`, `Kyc Expired`.

Webhook payloads include a `decision` object (when status is `Approved`/`Declined`/`In Review`) containing:

- Document verification results (type, number, name, DOB, nationality)
- Liveness check results (method, score, age estimation)
- Face match results (score, source/target images)
- IP analysis results (country, VPN/proxy detection, threat level)

### Verification Results

Didit performs multiple checks per session. Results stored locally include:

| Check | Fields |
|-------|--------|
| **Document** | `document_verified`, `document_type`, `document_number`, `issuing_country` |
| **Liveness** | `liveness_passed`, `liveness_confidence_score`, `spoofing_detected` |
| **Face Match** | `face_matched`, `face_similarity_score` |
| **IP Analysis** | `ip_address`, `ip_country_code`, `ip_risk_score`, `is_vpn`, `is_proxy`, `threat_level` |

---

[Back to API Reference](README.md)
