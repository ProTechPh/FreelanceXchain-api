# Data Privacy & KYC Protection

<cite>
**Referenced Files in This Document**   
- [didit-kyc.ts](file://src/models/didit-kyc.ts)
- [didit-kyc-repository.ts](file://src/repositories/didit-kyc-repository.ts)
- [didit-kyc-service.ts](file://src/services/didit-kyc-service.ts)
- [didit-client.ts](file://src/services/didit-client.ts)
- [didit-kyc-routes.ts](file://src/routes/didit-kyc-routes.ts)
- [003_didit_kyc_verifications.sql](file://supabase/migrations/003_didit_kyc_verifications.sql)
- [security-middleware.ts](file://src/middleware/security-middleware.ts)
- [auth-middleware.ts](file://src/middleware/auth-middleware.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Didit KYC Integration](#didit-kyc-integration)
3. [Verification Features](#verification-features)
4. [Data Minimization Principle](#data-minimization-principle)
5. [GDPR Compliance Measures](#gdpr-compliance-measures)
6. [Webhook Security](#webhook-security)
7. [Encryption Strategies](#encryption-strategies)
8. [API Endpoints](#api-endpoints)
9. [Database Schema](#database-schema)
10. [System Architecture](#system-architecture)

## Introduction

FreelanceXchain uses [Didit](https://didit.me) for enterprise-grade KYC (Know Your Customer) verification. Didit provides professional identity verification with support for 220+ countries, replacing the previous custom KYC implementation.

The system follows the data minimization principle by collecting only essential identity information. Personal data is stored encrypted in Supabase, while Didit handles document images and biometric processing.

## Didit KYC Integration

### Overview

Didit provides a hosted verification page where users complete identity verification. The backend creates sessions via API and receives results through webhooks.

### Environment Configuration

```bash
# Didit KYC Configuration
DIDIT_API_KEY=your-didit-api-key
DIDIT_API_URL=https://verification.didit.me
DIDIT_WEBHOOK_SECRET=your-didit-webhook-secret-key
DIDIT_WORKFLOW_ID=your-didit-workflow-id
```

### Workflow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Didit
    participant Database

    User->>Frontend: Request KYC Verification
    Frontend->>Backend: POST /api/kyc/initiate
    Backend->>Didit: Create Session
    Didit-->>Backend: Session URL + ID
    Backend->>Database: Store Session
    Backend-->>Frontend: Return Session URL
    Frontend-->>User: Redirect to Didit

    User->>Didit: Complete Verification
    Didit->>Backend: Webhook (session.completed)
    Backend->>Didit: Fetch Full Results
    Didit-->>Backend: Verification Data
    Backend->>Database: Update Status
    
    User->>Frontend: Check Status
    Frontend->>Backend: GET /api/kyc/status
    Backend->>Database: Query Status
    Backend-->>Frontend: Return Status
    Frontend-->>User: Display Result
```

## Verification Features

Didit provides four verification features:

| Feature | Description |
|---------|-------------|
| **ID Verification** | Document verification for passports, national IDs, driver's licenses (220+ countries) |
| **Passive Liveness** | Anti-spoofing technology with no user interaction required |
| **Face Match 1:1** | Compares selfie to document photo with similarity scoring |
| **IP Analysis** | Geolocation, VPN/Proxy detection, risk scoring |

### Verification Results

```typescript
type DiditVerificationResult = {
  decision: 'approved' | 'declined' | 'review';
  document_verified: boolean;
  liveness_passed: boolean;
  liveness_confidence_score: number;
  spoofing_detected: boolean;
  face_matched: boolean;
  face_similarity_score: number;
  ip_risk_score: number;
  threat_level: 'low' | 'medium' | 'high';
  is_vpn: boolean;
  is_proxy: boolean;
};
```

## Data Minimization Principle

FreelanceXchain adheres to data minimization by:

1. **Didit Handles Sensitive Data**: Document images and biometric data are processed by Didit, not stored locally
2. **Store Only Results**: Only verification results and extracted data are stored
3. **No Raw Documents**: Document images are never stored in the application database
4. **Encrypted Storage**: All personal data is encrypted at rest in Supabase

### Data Stored Locally

| Field | Purpose |
|-------|---------|
| `first_name`, `last_name` | Identity confirmation |
| `date_of_birth` | Age verification |
| `nationality` | Compliance requirements |
| `document_type` | Verification record |
| `decision` | Verification outcome |
| `ip_risk_score` | Risk assessment |

### Data NOT Stored Locally

- Document images (front/back)
- Selfie images
- Raw biometric data
- Full document scans

## GDPR Compliance Measures

### User Rights Implementation

| Right | Implementation |
|-------|----------------|
| **Right to Access** | `GET /api/kyc/status` returns user's verification data |
| **Right to Erasure** | Admin can delete verification records |
| **Right to Portability** | `GET /api/kyc/history` exports verification history |
| **Consent** | Explicit consent required before initiating verification |

### Data Retention

- **Approved Verifications**: Retained for 1 year from approval date (`expires_at`)
- **Rejected Verifications**: Retained for 90 days for dispute resolution
- **Expired Sessions**: Automatically cleaned up after 30 days

### Audit Trail

All KYC operations are logged:

```typescript
type KycAuditLog = {
  user_id: string;
  action: 'initiate' | 'complete' | 'approve' | 'reject' | 'expire';
  timestamp: Date;
  ip_address: string;
  admin_id?: string;
  notes?: string;
};
```

## Webhook Security

### HMAC-SHA256 Signature Verification

All webhooks from Didit are verified using HMAC-SHA256:

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Webhook Endpoint Security

- Signature verification required
- IP allowlisting (optional)
- Rate limiting applied
- Idempotency handling for duplicate webhooks

## Encryption Strategies

### At Rest

- Supabase encryption enabled for all tables
- Sensitive fields use additional application-level encryption
- Encryption keys managed via environment variables

### In Transit

- TLS 1.3 for all API communications
- HTTPS enforced for webhook endpoints
- Certificate pinning for mobile clients

### Key Management

```mermaid
graph LR
    A[Environment Variables] --> B[Application]
    B --> C[Supabase Client]
    C --> D[Encrypted Database]
    
    E[Didit API Key] --> B
    F[Webhook Secret] --> B
```

## API Endpoints

### User Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/kyc/initiate` | Start verification, get session URL |
| `GET` | `/api/kyc/status` | Get current verification status |
| `GET` | `/api/kyc/verified` | Check if user is verified |
| `GET` | `/api/kyc/history` | Get verification history |
| `POST` | `/api/kyc/refresh/:id` | Manually refresh status from Didit |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/kyc/admin/pending` | Get pending reviews |
| `GET` | `/api/kyc/admin/status/:status` | Get verifications by status |
| `POST` | `/api/kyc/admin/review/:id` | Approve/reject verification |
| `GET` | `/api/kyc/admin/verification/:id` | Get verification details |

### Webhook Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/kyc/webhook` | Receive Didit status updates |

### Example: Initiate Verification

```bash
curl -X POST http://localhost:3000/api/kyc/initiate \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "contact_details": {
      "email": "[email protected]"
    }
  }'
```

Response:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "status": "pending",
  "didit_session_url": "https://verify.didit.me/session/token",
  "created_at": "2026-01-14T10:00:00Z"
}
```

## Database Schema

### Table: `kyc_verifications`

```sql
CREATE TABLE kyc_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL CHECK (status IN (
        'pending', 'in_progress', 'completed', 
        'approved', 'rejected', 'expired'
    )),
    
    -- Didit Session
    didit_session_id VARCHAR(255) UNIQUE NOT NULL,
    didit_session_token VARCHAR(500),
    didit_session_url TEXT NOT NULL,
    didit_workflow_id VARCHAR(255),
    
    -- Decision
    decision VARCHAR(20) CHECK (decision IN ('approved', 'declined', 'review')),
    decline_reasons TEXT[],
    review_reasons TEXT[],
    
    -- Document Info
    document_type VARCHAR(50),
    document_number VARCHAR(100),
    issuing_country VARCHAR(3),
    
    -- Personal Data (extracted)
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    nationality VARCHAR(3),
    
    -- Verification Results
    document_verified BOOLEAN,
    liveness_passed BOOLEAN,
    liveness_confidence_score DECIMAL(5,4),
    spoofing_detected BOOLEAN,
    face_matched BOOLEAN,
    face_similarity_score DECIMAL(5,4),
    
    -- IP Analysis
    ip_address VARCHAR(45),
    ip_country_code VARCHAR(3),
    ip_risk_score DECIMAL(5,2),
    is_vpn BOOLEAN,
    is_proxy BOOLEAN,
    threat_level VARCHAR(10) CHECK (threat_level IN ('low', 'medium', 'high')),
    
    -- Admin Review
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    admin_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_kyc_user_id ON kyc_verifications(user_id);
CREATE INDEX idx_kyc_status ON kyc_verifications(status);
CREATE INDEX idx_kyc_didit_session_id ON kyc_verifications(didit_session_id);
CREATE INDEX idx_kyc_pending_review ON kyc_verifications(status, reviewed_by) 
    WHERE status = 'completed' AND reviewed_by IS NULL;
```

### Row Level Security

```sql
-- Users can only see their own verifications
CREATE POLICY "Users can view own KYC" ON kyc_verifications
    FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update
CREATE POLICY "Service role full access" ON kyc_verifications
    FOR ALL USING (auth.role() = 'service_role');
```

## System Architecture

```mermaid
graph TD
    subgraph "Client Layer"
        A[Web App] --> B[API Gateway]
        M[Mobile App] --> B
    end
    
    subgraph "API Layer"
        B --> C[Auth Middleware]
        C --> D[KYC Routes]
        D --> E[KYC Service]
    end
    
    subgraph "Service Layer"
        E --> F[Didit Client]
        E --> G[KYC Repository]
    end
    
    subgraph "External Services"
        F --> H[Didit API]
        H --> I[Webhook Handler]
        I --> E
    end
    
    subgraph "Data Layer"
        G --> J[(Supabase)]
    end
    
    style A fill:#4CAF50
    style M fill:#4CAF50
    style H fill:#2196F3
    style J fill:#FF9800
```

### File Structure

```
src/
├── models/
│   └── didit-kyc.ts              # Type definitions
├── services/
│   ├── didit-client.ts           # Didit API client
│   └── didit-kyc-service.ts      # Business logic
├── repositories/
│   └── didit-kyc-repository.ts   # Database operations
└── routes/
    └── didit-kyc-routes.ts       # API endpoints

supabase/
└── migrations/
    └── 003_didit_kyc_verifications.sql
```

## Quick Reference

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | Session created, user hasn't started |
| `in_progress` | User is completing verification |
| `completed` | Verification done, awaiting admin review |
| `approved` | Admin approved, user is verified |
| `rejected` | Admin rejected or Didit declined |
| `expired` | Session expired without completion |

### Decision Values

| Decision | Description |
|----------|-------------|
| `approved` | All checks passed |
| `declined` | Failed verification checks |
| `review` | Needs manual review |

### Threat Levels

| Level | IP Risk Score | Action |
|-------|---------------|--------|
| `low` | 0-30 | Auto-approve eligible |
| `medium` | 31-70 | Manual review recommended |
| `high` | 71-100 | Manual review required |

## Support Resources

- **Didit Documentation**: https://docs.didit.me
- **API Reference**: https://docs.didit.me/reference/
- **Business Console**: https://business.didit.me
- **Support Email**: [email protected]
