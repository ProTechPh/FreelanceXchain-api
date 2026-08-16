# Troubleshooting Guide & Feature Documentation

Centralized index for troubleshooting resources and feature documentation for the FreelanceXchain API.

## Table of Contents

- [Troubleshooting](#troubleshooting)
- [Contract Activation Fix](#contract-activation-fix)
- [Custom Skills API](#custom-skills-api)
- [Milestone File Attachments](#milestone-file-attachments)
- [Platform Features Overview](#platform-features-overview)
- [Project Attachments](#project-attachments)
- [Project Tags](#project-tags)
- [Proposal with Employer History](#proposal-with-employer-history)
- [Audit Logs](#audit-logs)
- [Proposal File Uploads](#proposal-file-uploads)

---

## Troubleshooting

### General Setup & Configuration

**Developer Environment** - [Setup Guide - Troubleshooting](setup.md#troubleshooting)

- Environment variable configuration, database connection problems, dependency failures, port conflicts

**Deployment** - [Configuration Guide](configuration.md)

- Docker container failures, environment-specific config, log aggregation setup

### Blockchain Integration

| Component | Guide | Common Issues |
| --- | --- | --- |
| Blockchain Client | [client.md](../blockchain/client.md) | Misconfigured env vars, invalid private keys, network connectivity, transaction failures |
| Contract Agreement | [agreements.md](../blockchain/agreements.md) | Creation failures, status transition errors, sync issues |
| Escrow System | [escrow.md](../blockchain/escrow.md) | Fund deposit failures, release/refund errors, balance sync |
| KYC Verification | [kyc.md](../blockchain/kyc.md) | Submission failures, status update delays, document validation |
| Milestone Registry | [milestones.md](../blockchain/milestones.md) | Creation failures, status update problems, payment release errors |

**General Blockchain**: [Integration - Troubleshooting](../blockchain/integration.md#troubleshooting) | [Testing](../blockchain/testing.md)

### Authentication & Security

- **Authentication** - [Authentication API](../api/auth.md): Login failures, token validation, OAuth issues, session expiry
- **Appwrite Permissions** - [database-schema.md](../architecture/database-schema.md): Permission denied errors, collection access rules, role-based access

### Business Logic Services

| Service | Guide | Common Issues |
| --- | --- | --- |
| Matching | [Matching API](../api/matching.md) | AI matching failures, score calculation errors, performance |
| Notification | [Notifications API](../api/notifications.md) | Delivery failures, template rendering, batch problems |
| Payment | [Payments API](../api/payments.md) | Processing failures, escrow sync errors, status mismatches |
| Project | [Projects API](../api/projects.md) | Creation failures, status transitions, search/filter problems |
| Proposal | [Proposals API](../api/proposals.md) | Submission failures, accept/reject errors, status sync |
| Reputation | [Reputation API](../api/reputation.md) | Score calculation errors, rating submission, blockchain sync |

### Data Models

- [Data Models](../architecture/data-models.md): Appwrite collections, TypeScript model mapping, and common model-level issues (validation, status transitions, associations)

### AI Matching System

- [AI-Powered Matching](../architecture/ai-matching.md): LLM integration, API connection failures, rate limiting, response parsing, score normalization, and fallback behavior

### Common Issues

**Missing/incorrect environment variables:**

1. Verify `.env` file exists and contains all required variables
2. Check `src/config/env.ts` for required variable names
3. Ensure Appwrite credentials are correct
4. Validate blockchain RPC URLs and private keys

**Database connection errors:**

1. Verify Appwrite credentials
2. Check network connectivity
3. Ensure `npx tsx scripts/setup-appwrite-db.ts` has been run to create the schema
4. Verify Appwrite collection permissions are not blocking access

**Blockchain transaction failures:**

1. Check wallet has sufficient funds for gas
2. Verify RPC endpoint is responsive
3. Ensure contract addresses are correct
4. Check transaction parameters and nonce
5. Review blockchain network status

**JWT token issues:**

1. Verify `JWT_SECRET` is configured correctly
2. Check token expiration settings
3. Ensure Appwrite Auth is properly initialized
4. Validate token format in Authorization header
5. Check for clock skew between client and server

**Rate limiting:** Check middleware config, implement exponential backoff, review IP vs user-based limits, consider upgrading tiers for production.

**Performance:** Enable query logging, check database indexes, review N+1 patterns, monitor blockchain RPC times, implement caching, use pagination.

**CORS errors:** Verify `CORS_ORIGIN` env var, check security middleware, whitelist frontend URL, validate request headers/methods.

**File upload/URL validation:** Ensure URLs are properly formatted, check SSRF protection rules, verify allowed domains/protocols, validate file size/type constraints.

### Debugging Tools

- **Logging**: Correlation IDs per request, structured JSON logs, appropriate log levels. See [Middleware & Interceptors](../architecture/middleware.md).
- **Testing**: `pnpm test` for unit tests, integration tests for full workflows, blockchain-specific tests. See [testing.md](testing.md) and [blockchain/testing.md](../blockchain/testing.md).
- **Monitoring**: `/health` endpoint, centralized error tracking with stack traces, request duration metrics.

### Getting Help

1. Review application logs with correlation ID
2. Consult the specific component documentation
3. Run relevant test suites to identify failures
4. Run `pnpm run security:audit` for vulnerability checks

---

## Contract Activation Fix

### Issue

When an employer accepted a freelancer's proposal, the contract was created with `'pending'` status and remained there indefinitely. Escrow initialization and contract activation were separate manual steps.

### Root Cause

The `acceptProposal` function in [proposal-service.ts](../../src/services/proposal-service.ts) created a contract with `'pending'` status and a blockchain agreement, but did not initialize escrow or activate the contract.

### Solution

Modified `acceptProposal` to automatically initialize escrow and activate the contract:

```typescript
const { initializeContractEscrow } = await import('./payment-service.js');
const escrowResult = await initializeContractEscrow(
  createdContract, project, employer.wallet_address, freelancer.wallet_address
);

if (escrowResult.success) {
  const updatedContractEntity = await contractRepository.updateContract(createdContract.id, {
    status: 'active',
  });
  if (updatedContractEntity) {
    createdContract.status = 'active';
    createdContract.escrowAddress = escrowResult.data.escrowAddress;
  }
}
```

### Status Flow

**Before:** `Proposal Accepted -> Contract (pending) -> [Manual Fund] -> Contract (active)`

**After:** `Proposal Accepted -> Contract (pending) -> Escrow Initialized -> Contract (active)`

### Status Transitions

- `pending` -> `active` (escrow funded)
- `pending` -> `cancelled` (cancelled before funding)
- `active` -> `completed` (all milestones completed)
- `active` -> `disputed` (dispute raised)
- `active` -> `cancelled` (cancelled after funding)

### Error Handling

If escrow initialization fails, the contract remains `'pending'`, the error is logged but does not fail proposal acceptance, and the employer can manually fund via `/api/contracts/:id/fund`.

### Related Files

- [src/services/proposal-service.ts](../../src/services/proposal-service.ts)
- [src/services/payment-service.ts](../../src/services/payment-service.ts)
- [src/services/contract-service.ts](../../src/services/contract-service.ts)
- [src/**tests**/unit/proposal-service.test.ts](../../src/__tests__/unit/proposal-service.test.ts)

---

## Custom Skills API

Users can add skills not in the global taxonomy. Popular skills can be promoted to global via admin approval.

### Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/skills/custom` | Create custom skill |
| `GET` | `/api/skills/custom` | Get your custom skills |
| `GET` | `/api/skills/custom/search?keyword=` | Search your custom skills |
| `PUT` | `/api/skills/custom/{id}` | Update custom skill |
| `DELETE` | `/api/skills/custom/{id}` | Delete custom skill |
| `POST` | `/api/freelancers/profile/skills` | Add mixed global + custom skills to profile |
| `GET` | `/api/skills/suggestions` | Get skill suggestions (admin) |
| `PUT` | `/api/skills/suggestions/{id}/status` | Approve/reject suggestion (admin) |

### Create Custom Skill

```http
POST /api/skills/custom
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Advanced React Patterns",
  "description": "Experience with render props, higher-order components, and compound components",
  "yearsOfExperience": 3,
  "categoryName": "Frontend Development",
  "suggestForGlobal": true
}
```

### Validation Rules

- **name**: 2-100 characters, required
- **description**: 10-500 characters, required
- **yearsOfExperience**: 0-50, required
- **categoryName**: max 100 characters, optional
- **suggestForGlobal**: boolean, optional (default: false)

### Error Codes

- `SKILL_EXISTS_GLOBALLY` (409) - Skill already in global taxonomy
- `DUPLICATE_USER_SKILL` (409) - User already has this custom skill
- `VALIDATION_ERROR` (400) - Invalid request data

### Workflow

1. User wants to add a skill not in global taxonomy
2. System checks global taxonomy -> not found
3. User creates custom skill with `suggestForGlobal: true`
4. Admin reviews suggestions -> approves popular ones
5. Skill promoted to global taxonomy for all users

---

## Milestone File Attachments

Freelancers can upload deliverable files when completing milestones for employer review.

### Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/milestones/:id/upload-deliverables` | Upload files without submitting |
| `POST` | `/api/milestones/:id/submit-with-files` | Upload files and submit in one request |
| `POST` | `/api/milestones/:id/submit` | Submit with pre-uploaded file references |

### Upload Deliverables

```http
POST /api/milestones/:id/upload-deliverables
Authorization: Bearer <freelancer-token>
Content-Type: multipart/form-data

Body: files (up to 10 files, 25MB each)
```

### Submit with Files

```http
POST /api/milestones/:id/submit-with-files
Authorization: Bearer <freelancer-token>
Content-Type: multipart/form-data

Body:
- files: Array of files
- notes: Optional submission notes
- existingDeliverables: JSON string of previously uploaded files
```

### Supported File Types

- **Documents**: PDF, DOC, DOCX, XLSX, PPTX, TXT, CSV
- **Images**: PNG, JPG, JPEG, GIF, WebP, SVG
- **Archives**: ZIP, RAR, 7Z
- **Code**: HTML, CSS, JS, JSON, XML
- **Video**: MP4, WebM, MOV

### Limits

- Max 10 files per upload, 25MB per file
- Storage bucket: `milestone-deliverables`
- Files organized by milestone ID

### Security

- File type validation (extension + magic number)
- Malware scanning, size limits, rate limiting
- Authenticated freelancers only

### Common Errors

- `"No files provided"` - Empty upload
- `"File size exceeds 25MB limit"` - File too large
- `"Invalid file type"` - Unsupported file type
- `"Milestone not found"` - Invalid milestone ID
- `"You are not authorized to submit this milestone"` - Not the assigned freelancer

---

## Platform Features Overview

Summary of all implemented platform features.

### Messaging System

- **Endpoints**: `POST /api/messages/send`, `GET /api/messages/conversations`, `GET /api/messages/conversations/:id`, `PATCH /api/messages/conversations/:id/read`, `GET /api/messages/unread-count`
- Real-time messaging, conversation threading, unread tracking, file attachments, pagination

### Review System

- **Endpoints**: `POST /api/reviews`, `GET /api/reviews/:id`, `GET /api/reviews/user/:userId`, `GET /api/reviews/project/:projectId`, `GET /api/reviews/can-review/:contractId`
- Multi-dimensional ratings (work quality, communication, professionalism), "would work again" indicator, contract-based eligibility

### Admin Dashboard

- **Endpoints**: `GET /api/admin/stats`, `GET /api/admin/users`, `POST /api/admin/users/:userId/suspend`, `POST /api/admin/users/:userId/unsuspend`, `POST /api/admin/users/:userId/verify`, `GET /api/admin/disputes`, `GET /api/admin/system/health`
- Platform statistics, user management, dispute oversight, system health monitoring

### Transaction History

- **Endpoints**: `GET /api/transactions`, `GET /api/transactions/:id`, `GET /api/transactions/contract/:contractId`
- Paginated history, filter by type/status, contract-specific view, export-ready format

### Health Checks

- **Endpoints**: `GET /api/health`, `GET /api/health/ready`
- Database connectivity, service status, uptime tracking, Kubernetes-compatible probes

### File Management

- **Endpoints**: `GET /api/file-management`, `DELETE /api/file-management/:bucket/:path`, `GET /api/file-management/quota`
- File listing by bucket, secure deletion, storage quota tracking

### Analytics & Reporting

- **Endpoints**: `GET /api/analytics/freelancer`, `GET /api/analytics/employer`, `GET /api/analytics/skill-trends`, `GET /api/analytics/platform`
- Earnings/spending reports, skill demand analysis, platform metrics, date range filtering

### Favorites/Bookmarks

- **Endpoints**: `POST /api/favorites`, `GET /api/favorites`, `DELETE /api/favorites/:targetType/:targetId`, `GET /api/favorites/check/:targetType/:targetId`
- Bookmark projects and freelancers, filter by type, quick status check

### Portfolio Management

- **Endpoints**: `POST /api/portfolio`, `GET /api/portfolio/freelancer/:id`, `GET /api/portfolio/:id`, `PATCH /api/portfolio/:id`, `DELETE /api/portfolio/:id`
- Multi-image upload, project details, skill tagging, external links, completion date tracking

### Email Preferences

- **Endpoints**: `GET /api/email-preferences`, `PATCH /api/email-preferences`, `POST /api/email-preferences/unsubscribe-all`
- Granular notification controls, marketing opt-in/out, weekly digest, complete unsubscribe

### Saved Searches

- **Endpoints**: `POST /api/saved-searches`, `GET /api/saved-searches`, `PATCH /api/saved-searches/:id`, `DELETE /api/saved-searches/:id`, `POST /api/saved-searches/:id/execute`
- Save project/freelancer searches, optional new match notifications, filter persistence

### Escrow Refund Flow

- Partial refund support in dispute resolution
- Refund request workflow with approval process
- Transaction tracking for refunds

### Database Schema Summary

Required collections: `conversations`, `messages`, `reviews`, `favorites`, `portfolio_items`, `email_preferences`, `saved_searches`, `transactions`. They are created by running `npx tsx scripts/setup-appwrite-db.ts` (idempotent).

Required storage buckets: `portfolio-images`, `message-attachments`

### Recommended Indexes

The declared Appwrite indexes (see `scripts/setup-appwrite-db.ts`) back uniqueness invariants:

| Collection | Index | Attributes |
| ---------- | ----- | ---------- |
| `reviews` | `unique_contract_reviewer` | `contract_id`, `reviewer_id` (unique) |
| `user_custom_skills` | `unique_user_skill` | `user_id`, `name` (unique) |
| `skill_suggestions` | `unique_suggestion_name` | `skill_name` (unique) |
| `favorites` | `unique_user_target` | `user_id`, `target_type`, `target_id` (unique) |

Frequently-queried attributes (e.g. `participant1_id`, `conversation_id`, `user_id`) are left to Appwrite's per-collection query optimization rather than manual index sprawl.

### Security

All endpoints include authentication middleware, authorization checks, rate limiting, input validation, CSRF protection, and UUID validation.

---

## Project Attachments

Employers can attach reference files (images, documents) when creating projects.

### Create Project with Attachments

```http
POST /api/projects/with-attachments
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**Form Fields:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | yes | min 5 characters |
| `description` | string | yes | min 20 characters |
| `requiredSkills` | JSON string | yes | Array of `{skillId}` objects |
| `budget` | number | yes | > 0 |
| `deadline` | string | yes | ISO date |
| `tags` | JSON string | no | max 10 tags |
| `files` | files | no | max 10 files, 10MB each |

**Allowed types:** PDF, DOC, DOCX, TXT, PNG, JPG, JPEG, GIF

**Database:** Added the `attachments` attribute to the `projects` collection (JSON string, see `scripts/setup-appwrite-db.ts`) and created the `project-attachments` Appwrite Storage bucket with private/authenticated permissions.

---

## Project Tags

Employers can add tags to projects for categorization and search.

### Usage

```bash
POST /api/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Build React Dashboard",
  "description": "Need an experienced developer...",
  "requiredSkills": [{"skillId": "uuid-1"}, {"skillId": "uuid-2"}],
  "budget": 5000,
  "deadline": "2026-06-30T00:00:00Z",
  "tags": ["react", "typescript", "dashboard", "frontend"]
}
```

### Validation

- Optional field, max 10 tags per project
- Empty/duplicate tags automatically removed
- Tags trimmed of whitespace

### Tag Queries

`tags` is stored as a JSON string array on the `projects` collection. The service layer parses and filters tags in application code (see `src/services/project-service.ts`), e.g. matching when a project's parsed tags contain the requested tag(s).

### Migration

The `tags` attribute on the `projects` collection is defined in `scripts/setup-appwrite-db.ts` and applied by re-running it (idempotent). There is no SQL migration runner.

---

## Proposal with Employer History

Freelancers can view an employer's track record when reviewing a proposal.

### Endpoint

```http
GET /api/proposals/{id}/with-employer-history
Authorization: Bearer <freelancer-token>
```

### Response

```json
{
  "proposal": {
    "id": "proposal-uuid",
    "projectId": "project-uuid",
    "freelancerId": "freelancer-uuid",
    "proposedRate": 5000,
    "estimatedDuration": 30,
    "status": "pending"
  },
  "project": {
    "id": "project-uuid",
    "title": "E-commerce Website Development",
    "employerId": "employer-uuid"
  },
  "employerHistory": {
    "completedProjectsCount": 15,
    "averageRating": 4.7,
    "reviewCount": 12,
    "companyName": "Tech Solutions Inc.",
    "industry": "Technology"
  }
}
```

### Authorization

- Only the freelancer who submitted the proposal can view
- Employers cannot view their own history through this endpoint
- Only aggregated statistics shown (not individual reviews)

### Implementation

The `getProposalWithEmployerHistory()` function fetches the proposal, queries employer contracts for completed ones, calculates average rating from reviews, and fetches employer profile info. Consider caching for frequently viewed proposals.

---

## Audit Logs

Tracks all important platform actions for compliance, security, and debugging. Logs are immutable -- once created, they cannot be modified or deleted.

### Collection Schema

Audit entries are stored in the `audit_log_entries` Appwrite collection (see `scripts/setup-appwrite-db.ts`):

| Attribute | Type | Notes |
| --------- | ---- | ----- |
| `user_id` / `actor_id` | string(36) | optional |
| `action` | string(100) | required |
| `resource_type` | string(50) | required |
| `resource_id` | string(36) | optional |
| `payload` | string(100000) | JSON string, default `'{}'` |
| `ip_address` | string(45) | optional |
| `user_agent` | string(2000) | optional |
| `status` | string(20) | default `'success'` |
| `error_message` | string(5000) | optional |

### Auditable Actions

| Category | Actions |
| --- | --- |
| Authentication | `user_login`, `user_logout`, `user_signup`, `user_password_change` |
| User Management | `user_created`, `user_updated`, `user_deleted` |
| Contracts | `contract_created`, `contract_signed`, `contract_updated`, `contract_cancelled` |
| Payments | `payment_initiated`, `payment_completed`, `payment_failed`, `payment_refunded` |
| Disputes | `dispute_created`, `dispute_resolved`, `dispute_escalated` |
| KYC | `kyc_submitted`, `kyc_approved`, `kyc_rejected` |

### API Endpoints

| Endpoint | Access | Description |
| --- | --- | --- |
| `GET /api/audit-logs/me` | All users | Current user's own audit logs |
| `GET /api/audit-logs/user/:userId` | Admin | User's audit logs |
| `GET /api/audit-logs/resource/:type/:id` | Admin | Resource audit logs |
| `GET /api/audit-logs/action/:action` | Admin | Logs by action type |
| `GET /api/audit-logs/failed` | Admin | Failed actions |
| `GET /api/audit-logs/range?startDate=&endDate=` | Admin | Logs by date range |
| `GET /api/audit-logs/report/user/:userId` | Admin | User audit report |
| `GET /api/audit-logs/report/system` | Admin | System-wide audit report |

### Usage

**Manual logging:**

```typescript
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

await logAuditEvent(req, {
  action: AUDITABLE_ACTIONS.CONTRACT_SIGNED,
  resourceType: 'contract',
  resourceId: contractId,
  payload: { contractAmount: 1000, signerRole: 'freelancer' },
  status: 'success',
});
```

**Automatic middleware:**

```typescript
import { auditMiddleware, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

router.post(
  '/contracts/:id/sign',
  authenticateToken,
  auditMiddleware(AUDITABLE_ACTIONS.CONTRACT_SIGNED, 'contract'),
  signContractHandler
);
```

**Database triggers (optional):** Uncomment triggers in the migration file to auto-log INSERT/UPDATE/DELETE on specific tables.

### Integration Examples

**Auth routes** -- Log login success/failure with email and login method.

**Contract routes** -- Use `auditMiddleware` for simple CRUD, manual `logAuditEvent` for operations needing custom payload (e.g., signer role, contract amount).

**Payment routes** -- Log initiation (pending), completion (success), and failure. Webhook handlers log blockchain status updates.

**KYC routes** -- Log submission (pending) and admin approval (success with admin ID).

**Dispute routes** -- Log creation with reason and resolution with winner/outcome.

**Service layer** -- Use `AuditLogRepository` directly for status changes that bypass routes.

**Background jobs** -- Log automated payment processing with system actor ID (`system:payment-processor`).

### Security

- **Access control**: Ownership filtering is applied in `src/repositories/audit-log-repository.ts` (`getByUserId`, `Query.equal('user_id', ...)`); admin queries can list across users
- **Immutable**: The application never updates or deletes audit log entries
- **Appwrite permissions**: Collections use default permissions; access rules are enforced in the repository layer

### Best Practices

1. Log both success and failure outcomes
2. Include relevant context in payload (but never passwords, tokens, or PII)
3. Use consistent `AUDITABLE_ACTIONS` constants
4. Use middleware for simple CRUD, manual logging for complex operations
5. Handle errors gracefully -- audit logging failures should not break the application
6. Monitor failed actions regularly for security incidents
7. Consider retention policies -- archive old logs after 1-2 years

### Compliance

Helps meet GDPR, SOC 2, PCI DSS, and HIPAA requirements.

### Troubleshooting

- **Logs not appearing**: Verify the audit log repository is writing to the `audit_log_entries` collection, check collection permissions, and check app logs for audit errors
- **Performance issues**: Add indexes for frequent queries, reduce date ranges, paginate large result sets
- **Missing context**: Ensure middleware extracts user info, IP address, and user agent correctly

---

## Proposal File Uploads

Proposals support file attachments (1-5 files) instead of text-based cover letters.

### Upload Patterns

**Server-side upload (recommended):** Client sends files via `multipart/form-data` to the API. API validates with multer (extension, magic numbers, size), uploads to Appwrite Storage, stores metadata in DB.

**URL reference (legacy/backward-compatible):** Client uploads directly to Appwrite Storage, receives URLs, submits proposal with file metadata. API validates metadata and stores references.

### File Requirements

| Constraint | Value |
| --- | --- |
| File count | 1-5 files required |
| Per-file size | 10MB max |
| Total size | 25MB max |
| Allowed types | PDF, DOC, DOCX, TXT, PNG, JPG, JPEG, GIF |

### API (Server-Side Upload)

```http
POST /api/proposals
Content-Type: multipart/form-data
Authorization: Bearer <token>

Fields:
- projectId (string, required)
- proposedRate (number, required)
- estimatedDuration (number, required)
- files (file array, required, 1-5 files)
```

### API (URL Reference)

```http
POST /api/proposals
Content-Type: application/json
Authorization: Bearer <token>

{
  "projectId": "uuid",
  "attachments": [
    {
      "url": "https://<project>.appwrite.co/storage/v1/object/public/proposal-attachments/file.pdf",
      "filename": "proposal.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }
  ],
  "proposedRate": 5000,
  "estimatedDuration": 30
}
```

### Response

```json
{
  "id": "uuid",
  "projectId": "uuid",
  "freelancerId": "uuid",
  "coverLetter": null,
  "attachments": [
    {
      "url": "https://<project>.appwrite.co/storage/v1/object/public/proposal-attachments/user-id/uuid_proposal.pdf",
      "filename": "proposal.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }
  ],
  "proposedRate": 5000,
  "estimatedDuration": 30,
  "status": "pending"
}
```

### Security Validations

**Server-side:** Extension validation, magic number detection, size validation (per-file and total), count validation, filename sanitization, rate limiting (20 uploads/hour/user).

**URL reference:** URL domain validation (Appwrite Storage only), MIME type whitelist, extension validation, size validation (metadata-based), count validation.

### Deployment

1. The `attachments` attribute on the `proposals` collection is created by `scripts/setup-appwrite-db.ts` (idempotent)
2. Create Appwrite Storage bucket: `proposal-attachments` (private, authenticated access)
3. Set env var: `APPWRITE_PROPOSAL_ATTACHMENTS_BUCKET=proposal-attachments`
4. Configure bucket permissions for access control

### Backward Compatibility

The `cover_letter` field remains in the database (nullable). Existing proposals with text cover letters continue to work.

### Client-Side Validation

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024;       // 10MB
const MAX_TOTAL_SIZE = 25 * 1024 * 1024;      // 25MB
const ALLOWED_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'image/png', 'image/jpeg', 'image/gif',
];

function validateFiles(files: File[]): string[] {
  const errors: string[] = [];
  if (files.length < 1 || files.length > 5) errors.push('Select 1-5 files');
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) errors.push('Total exceeds 25MB');
  files.forEach(file => {
    if (file.size > MAX_FILE_SIZE) errors.push(`${file.name} exceeds 10MB`);
    if (!ALLOWED_TYPES.includes(file.type)) errors.push(`${file.name} has invalid type`);
  });
  return errors;
}
```

### Troubleshooting

- **"File URL must be from Appwrite Storage domain"** -- Upload to Appwrite Storage first; verify URL format: `https://<project-ref>.appwrite.co/storage/...`
- **"MIME type not allowed"** -- Check file type is in allowed list; ensure MIME type matches extension
- **"Total file size exceeds limit"** -- Check individual (max 10MB) and total (max 25MB) sizes
- **"Storage bucket not found"** -- Create bucket in Appwrite Dashboard; verify name matches config
- **"Permission denied" when uploading** -- Check Appwrite Storage bucket permissions, ensure user is authenticated
- **Files upload but proposal fails** -- Verify metadata (URL, filename, size, mimeType); check all required fields present

### QA Test Cases

**Valid:** 1 PDF, 5 mixed files, max sizes per file, all allowed types.

**Invalid:** 0 files, 6 files, file > 10MB, total > 25MB, invalid type, external URL, non-HTTPS URL.

**Edge cases:** Special chars in filename, long filename, duplicate filenames, deleted file URL (404), race condition on immediate submit.

---

[Back to Deployment](README.md)
