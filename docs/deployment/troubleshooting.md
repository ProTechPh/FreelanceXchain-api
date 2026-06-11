# Troubleshooting Guide & Feature Documentation

This document serves as a centralized index to all troubleshooting resources across the FreelanceXchain API documentation. Each section links to detailed troubleshooting guides for specific components.

## Table of Contents

- [Troubleshooting](#troubleshooting)
- [Contract Activation Fix](#contract-activation-fix)
- [Custom Skills API Usage Guide](#custom-skills-api-usage-guide)
- [Milestone File Attachments](#milestone-file-attachments)
- [New Features Implementation Summary](#new-features-implementation-summary)
- [Project Attachments Feature](#project-attachments-feature)
- [Project Tags Feature](#project-tags-feature)
- [Proposal with Employer History](#proposal-with-employer-history)
- [Audit Logs Integration Examples](#audit-logs-integration-examples)
- [Audit Logs Documentation](#audit-logs-documentation)
- [Proposal File Upload Implementation Summary](#proposal-file-upload-implementation-summary)
- [Proposal File Uploads](#proposal-file-uploads)
- [Proposal File Upload - Quick Start Guide](#proposal-file-upload---quick-start-guide)

---

## Troubleshooting

### General Setup & Configuration

#### Developer Environment Setup
- **Guide**: [Developer Setup Guide - Troubleshooting](setup.md#troubleshooting)
- **Common Issues**: 
  - Environment variable configuration
  - Database connection problems
  - Dependency installation failures
  - Port conflicts

#### Deployment Issues
- **Guide**: [Deployment Configuration](configuration.md)
- **Common Issues**:
  - Docker container failures
  - Environment-specific configuration
  - Log aggregation setup

### Blockchain Integration

#### Blockchain Client
- **Guide**: [Blockchain Client](../blockchain/client.md)
- **Common Issues**:
  - Misconfigured environment variables
  - Invalid private keys
  - Network connectivity problems
  - Transaction failures

#### Contract Agreement
- **Guide**: [Contract Agreement](../blockchain/contracts.md)
- **Common Issues**:
  - Contract creation failures
  - Status transition errors
  - Blockchain synchronization issues

#### Escrow System
- **Guide**: [Escrow System](../blockchain/escrow.md)
- **Common Issues**:
  - Fund deposit failures
  - Release/refund transaction errors
  - Balance synchronization problems

#### KYC Verification
- **Guide**: [KYC Verification](../blockchain/kyc.md)
- **Common Issues**:
  - Verification submission failures
  - Status update delays
  - Document validation errors

#### Milestone Registry
- **Guide**: [Milestone Registry](../blockchain/milestones.md)
- **Common Issues**:
  - Milestone creation failures
  - Status update problems
  - Payment release errors

#### General Blockchain Troubleshooting
- **Guide**: [Blockchain Integration - Troubleshooting](../blockchain/integration.md#troubleshooting)
- **Testing Guide**: [Blockchain Testing](../blockchain/testing.md)

### Authentication & Security

#### Authentication Service
- **Guide**: [Authentication Service](../architecture/service-auth.md)
- **Common Issues**:
  - Login failures
  - Token validation errors
  - OAuth integration problems
  - Session expiry issues

#### Row Level Security (RLS)
- **Guide**: [Database RLS](../architecture/database-rls.md)
- **Common Issues**:
  - Permission denied errors
  - RLS policy conflicts
  - Role-based access problems

### Business Logic Services

#### Matching Service
- **Guide**: [Matching Service](../architecture/service-matching.md)
- **Common Issues**:
  - AI matching failures
  - Score calculation errors
  - Performance degradation

#### Notification Service
- **Guide**: [Notification Service](../architecture/service-notification.md)
- **Common Issues**:
  - Notification delivery failures
  - Template rendering errors
  - Batch notification problems

#### Payment Service
- **Guide**: [Payment Service](../architecture/service-payment.md)
- **Common Issues**:
  - Payment processing failures
  - Escrow synchronization errors
  - Transaction status mismatches

#### Project Service
- **Guide**: [Project Service](../architecture/service-project.md)
- **Common Issues**:
  - Project creation failures
  - Status transition errors
  - Search/filter problems

#### Proposal Service
- **Guide**: [Proposal Service](../architecture/service-proposal.md)
- **Common Issues**:
  - Proposal submission failures
  - Acceptance/rejection errors
  - Status synchronization issues

#### Reputation Service
- **Guide**: [Reputation Service](../architecture/service-reputation.md)
- **Common Issues**:
  - Score calculation errors
  - Rating submission failures
  - Blockchain synchronization delays

### API Endpoints

#### Reputation API
- **Main Guide**: [Reputation Service](../architecture/service-reputation.md)

#### Search API
- **Guide**: [API Overview](../architecture/api-overview.md)

### Data Models & Database

#### Contract Model
- **Guide**: [Contract Model](../architecture/model-contract.md)
- **Common Issues**:
  - Model validation errors
  - Foreign key constraint violations
  - Status transition problems

#### Dispute Model
- **Guide**: [Dispute Model](../architecture/model-dispute.md)
- **Common Issues**:
  - Dispute creation failures
  - Evidence submission errors
  - Resolution workflow problems

#### KYC Verification Model
- **Guide**: [KYC Model](../architecture/model-kyc.md)
- **Common Issues**:
  - Model synchronization errors
  - Status update failures
  - Document URL validation

#### Notification Model
- **Guide**: [Notification Model](../architecture/model-notification.md)
- **Common Issues**:
  - Notification persistence errors
  - Read status synchronization
  - Batch operation failures

#### Project Model
- **Guide**: [Project Model](../architecture/model-project.md)
- **Common Issues**:
  - Project creation validation errors
  - Skill association problems
  - Status workflow violations

#### Proposal Model
- **Guide**: [Proposal Model](../architecture/model-proposal.md)
- **Common Issues**:
  - Proposal validation failures
  - Milestone structure errors
  - Status transition problems

#### Skill Model
- **Guide**: [Skill Model](../architecture/model-skill.md)
- **Common Issues**:
  - Skill seeding failures
  - Category hierarchy problems
  - Association errors

### AI-Powered Matching System

#### AI Client
- **Guide**: [AI Client](../architecture/ai-client.md)
- **Common Issues**:
  - API connection failures
  - Rate limiting errors
  - Response parsing problems

#### Matching Service
- **Guide**: [Matching Service](../architecture/service-matching.md)
- **Common Issues**:
  - Match calculation failures
  - Performance degradation
  - Score normalization errors

#### AI-Powered Matching System Overview
- **Guide**: [AI Overview](../architecture/ai-overview.md)
- **Common Issues**:
  - System integration problems
  - Data pipeline failures
  - Algorithm tuning issues

### Common Issues

#### Environment Configuration
**Problem**: Missing or incorrect environment variables  
**Solution**: 
1. Verify `.env` file exists and contains all required variables
2. Check `src/config/env.ts` for required variable names
3. Ensure Appwrite credentials are correct
4. Validate blockchain RPC URLs and private keys

**Related Guides**:
- [Developer Setup Guide](setup.md#troubleshooting)

#### Database Connection Errors
**Problem**: Cannot connect to PostgreSQL/Appwrite  
**Solution**:
1. Verify `DATABASE_URL` or Appwrite credentials
2. Check network connectivity
3. Ensure database migrations are applied
4. Verify RLS policies are not blocking access

**Related Guides**:
- [Database RLS](../architecture/database-rls.md)

#### Blockchain Transaction Failures
**Problem**: Transactions fail or timeout  
**Solution**:
1. Check wallet has sufficient funds for gas
2. Verify RPC endpoint is responsive
3. Ensure contract addresses are correct
4. Check transaction parameters and nonce
5. Review blockchain network status

**Related Guides**:
- [Blockchain Integration](../blockchain/integration.md#troubleshooting)
- [Blockchain Client](../blockchain/client.md)

#### Authentication Token Issues
**Problem**: JWT tokens invalid or expired  
**Solution**:
1. Verify `JWT_SECRET` is configured correctly
2. Check token expiration settings
3. Ensure Appwrite Auth is properly initialized
4. Validate token format in Authorization header
5. Check for clock skew between client and server

**Related Guides**:
- [Authentication Service](../architecture/service-auth.md)

#### API Rate Limiting
**Problem**: Requests being rate limited  
**Solution**:
1. Check rate limit configuration in middleware
2. Implement exponential backoff in client
3. Review IP-based vs user-based limits
4. Consider upgrading rate limit tiers for production

#### Performance Issues
**Problem**: Slow API responses or timeouts  
**Solution**:
1. Enable query logging to identify slow queries
2. Check database indexes are properly created
3. Review N+1 query patterns in ORM usage
4. Monitor blockchain RPC response times
5. Implement caching for frequently accessed data
6. Use pagination for large result sets

**Related Guides**:
- [Request Logging Middleware](../architecture/middleware-logging.md)

#### CORS Errors
**Problem**: Cross-origin requests blocked  
**Solution**:
1. Verify `CORS_ORIGIN` environment variable
2. Check security middleware configuration
3. Ensure frontend URL is whitelisted
4. Validate request headers and methods

#### File Upload/URL Validation Errors
**Problem**: File URLs rejected or validation fails  
**Solution**:
1. Ensure URLs are properly formatted
2. Check SSRF protection rules
3. Verify allowed domains/protocols
4. Validate file size and type constraints

### Debugging Tools & Techniques

#### Logging
- **Correlation IDs**: Every request has a unique correlation ID for tracing
- **Log Levels**: Use appropriate log levels (error, warn, info, debug)
- **Structured Logging**: Logs are JSON-formatted for easy parsing

**Related Guides**:
- [Request Logging Middleware](../architecture/middleware-logging.md)
- [Error Handling Middleware](../architecture/middleware-errors.md)

#### Testing
- **Unit Tests**: Run `pnpm test` for comprehensive test suite
- **Integration Tests**: Test full API workflows
- **Blockchain Tests**: Dedicated blockchain integration tests

**Related Guides**:
- [Testing Strategy](testing.md)
- [Blockchain Testing](../blockchain/testing.md)

#### Monitoring
- **Health Checks**: Use `/health` endpoint for system status
- **Error Tracking**: Centralized error logging with stack traces
- **Performance Metrics**: Request duration and response time tracking

### Getting Help

If you cannot resolve an issue using these guides:

1. **Check Logs**: Review application logs with correlation ID
2. **Review Documentation**: Consult the specific component documentation
3. **Run Tests**: Execute relevant test suites to identify failures
4. **Security Audit**: Run `pnpm run security:audit` for vulnerability checks
5. **Community Support**: Reach out to the development team

### Contributing to Troubleshooting Docs

Found a solution to a new issue? Help improve this documentation:

1. Document the problem clearly
2. Provide step-by-step solution
3. Add to the relevant component's troubleshooting section
4. Update this index if adding a new section

---

**Last Updated**: February 18, 2026  
**Maintained By**: FreelanceXchain Development Team

---

## Contract Activation Fix

### Issue
When an employer accepted a freelancer's proposal, the contract was created with `'pending'` status and remained in that state indefinitely. The contract was never automatically activated, causing confusion for users.

### Root Cause
The `acceptProposal` function in [proposal-service.ts](../../src/services/proposal-service.ts) was:
1. Creating a contract with `'pending'` status (via the `accept_proposal_atomic` RPC)
2. Creating a blockchain agreement
3. **NOT** initializing the escrow or activating the contract

The escrow initialization and contract activation were separate manual steps that required calling the `/api/contracts/:id/fund` endpoint.

### Solution
Modified the `acceptProposal` function to automatically:
1. Create the blockchain agreement (existing behavior)
2. **Initialize the escrow** by calling `initializeContractEscrow`
3. **Activate the contract** by updating its status from `'pending'` to `'active'`

#### Changes Made

##### 1. Updated proposal-service.ts
Added automatic escrow initialization and contract activation after creating the blockchain agreement:

```typescript
// Initialize escrow and activate contract
const { initializeContractEscrow } = await import('./payment-service.js');
const escrowResult = await initializeContractEscrow(
  createdContract,
  project,
  employer.wallet_address,
  freelancer.wallet_address
);

if (escrowResult.success) {
  // Update contract status to active
  const updatedContractEntity = await contractRepository.updateContract(createdContract.id, {
    status: 'active',
  });
  if (updatedContractEntity) {
    createdContract.status = 'active';
    createdContract.escrowAddress = escrowResult.data.escrowAddress;
  }
}
```

##### 2. Updated Tests
- Added mocks for `payment-service` and `agreement-contract` services
- Updated mock RPC to create contracts with `'pending'` status (matching real implementation)
- Enhanced test assertions to verify contract status is `'active'` and escrow address is set

### Contract Status Flow

#### Before Fix
```
Proposal Accepted → Contract Created (pending) → [Manual Step Required] → Contract Funded (active)
```

#### After Fix
```
Proposal Accepted → Contract Created (pending) → Escrow Initialized → Contract Activated (active)
```

### Status Transitions
The contract status follows this state machine:
- `pending` → `active` (when escrow is funded)
- `pending` → `cancelled` (if cancelled before funding)
- `active` → `completed` (when all milestones are completed)
- `active` → `disputed` (when a dispute is raised)
- `active` → `cancelled` (if cancelled after funding)

### Error Handling
If escrow initialization fails:
- The contract remains in `'pending'` status
- Error is logged but doesn't fail the proposal acceptance
- Employer can manually fund the contract later via `/api/contracts/:id/fund`

This graceful degradation ensures that blockchain failures don't prevent the core business logic from completing.

### Testing
All existing tests pass, including:
- Property-based tests for proposal acceptance
- Unit tests for escrow deployment
- Contract status verification

### Related Files
- [src/services/proposal-service.ts](../../src/services/proposal-service.ts)
- [src/services/payment-service.ts](../../src/services/payment-service.ts)
- [src/services/contract-service.ts](../../src/services/contract-service.ts)
- [appwrite/migrations/20240321000000_concurrency_rpcs.sql](../../appwrite/migrations/20240321000000_concurrency_rpcs.sql)
- [src/__tests__/unit/proposal-service.test.ts](../../src/__tests__/unit/proposal-service.test.ts)

---

## Custom Skills API Usage Guide

### Overview
The Custom Skills feature allows users to add skills that aren't available in the global skill taxonomy. This is perfect for emerging technologies, specialized tools, or niche expertise areas.

### Key Features
- ✅ Create custom skills when global taxonomy doesn't have what you need
- ✅ Suggest custom skills for inclusion in global taxonomy
- ✅ Full CRUD operations on your custom skills
- ✅ Search through your custom skills
- ✅ Admin workflow for reviewing skill suggestions

### API Endpoints

#### 1. Create Custom Skill
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

**Response (201):**
```json
{
  "id": "uuid-here",
  "userId": "user-uuid",
  "name": "Advanced React Patterns",
  "description": "Experience with render props, higher-order components, and compound components",
  "yearsOfExperience": 3,
  "categoryName": "Frontend Development",
  "isApproved": false,
  "suggestedForGlobal": true,
  "createdAt": "2024-03-13T10:00:00Z",
  "updatedAt": "2024-03-13T10:00:00Z"
}
```

#### 2. Get Your Custom Skills
```http
GET /api/skills/custom
Authorization: Bearer <token>
```

**Response (200):**
```json
[
  {
    "id": "uuid-1",
    "name": "Advanced React Patterns",
    "description": "Experience with render props...",
    "yearsOfExperience": 3,
    "categoryName": "Frontend Development",
    "isApproved": false,
    "suggestedForGlobal": true,
    "createdAt": "2024-03-13T10:00:00Z",
    "updatedAt": "2024-03-13T10:00:00Z"
  }
]
```

#### 3. Search Your Custom Skills
```http
GET /api/skills/custom/search?keyword=react
Authorization: Bearer <token>
```

#### 4. Update Custom Skill
```http
PUT /api/skills/custom/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "yearsOfExperience": 4,
  "description": "Updated description with more experience"
}
```

#### 5. Delete Custom Skill
```http
DELETE /api/skills/custom/{id}
Authorization: Bearer <token>
```

#### 6. Add Skills to Profile (Mixed Global + Custom)
```http
POST /api/freelancers/profile/skills
Authorization: Bearer <token>
Content-Type: application/json

{
  "skills": [
    {
      "name": "JavaScript",
      "yearsOfExperience": 5
    },
    {
      "name": "Advanced React Patterns",
      "yearsOfExperience": 3
    }
  ]
}
```

### Admin Endpoints

#### 7. Get Skill Suggestions (Admin Only)
```http
GET /api/skills/suggestions
Authorization: Bearer <admin-token>
```

**Response:**
```json
[
  {
    "id": "suggestion-uuid",
    "skillName": "Advanced React Patterns",
    "skillDescription": "Experience with render props...",
    "categoryName": "Frontend Development",
    "suggestedBy": "John Doe",
    "timesRequested": 5,
    "status": "pending",
    "createdAt": "2024-03-13T10:00:00Z"
  }
]
```

#### 8. Approve/Reject Skill Suggestion (Admin Only)
```http
PUT /api/skills/suggestions/{id}/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "approved"
}
```

### Error Responses

#### Skill Already Exists Globally (409)
```json
{
  "error": {
    "code": "SKILL_EXISTS_GLOBALLY",
    "message": "Skill \"React.js\" already exists in the global skill taxonomy. Use the existing skill instead.",
    "details": [
      "Existing skill ID: global-skill-123",
      "Category: Frontend Development"
    ]
  },
  "timestamp": "2024-03-13T10:00:00Z",
  "requestId": "req-123"
}
```

#### Duplicate Custom Skill (409)
```json
{
  "error": {
    "code": "DUPLICATE_USER_SKILL",
    "message": "You already have a custom skill named \"Advanced React Patterns\"."
  },
  "timestamp": "2024-03-13T10:00:00Z",
  "requestId": "req-123"
}
```

#### Validation Error (400)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "field": "name",
        "message": "Name must be between 2 and 100 characters"
      },
      {
        "field": "yearsOfExperience",
        "message": "Years of experience must be between 0 and 50"
      }
    ]
  },
  "timestamp": "2024-03-13T10:00:00Z",
  "requestId": "req-123"
}
```

### Validation Rules

#### Custom Skill Creation
- **name**: 2-100 characters, required
- **description**: 10-500 characters, required  
- **yearsOfExperience**: 0-50, required
- **categoryName**: max 100 characters, optional
- **suggestForGlobal**: boolean, optional (default: false)

### Security
- Users can only access their own custom skills
- Row-level security enforced at database level
- Admin role required for skill suggestion management
- Input validation and sanitization on all endpoints

### Workflow Example

1. **User wants to add "Svelte Kit" skill**
2. **System checks global taxonomy** → Not found
3. **User creates custom skill** with `suggestForGlobal: true`
4. **Skill added to user's profile** and suggestion created
5. **Admin reviews suggestions** → Sees "Svelte Kit" requested by 10+ users
6. **Admin approves suggestion** → Skill added to global taxonomy
7. **Future users** can now use "Svelte Kit" from global taxonomy

### Benefits

- **No limitations** - Add any skill you need
- **Community-driven growth** - Popular skills get promoted to global taxonomy
- **Quality control** - Admin approval ensures taxonomy quality
- **Seamless integration** - Works with existing profile management
- **Future-proof** - Easily adapt to new technologies and trends

---

## Milestone File Attachments

This feature allows freelancers to upload and submit deliverable files when completing milestones, enabling employers to review the work before approving payments.

### New Endpoints

#### 1. Upload Deliverable Files
**POST** `/api/milestones/:id/upload-deliverables`

Upload files for a milestone without submitting it yet. This allows freelancers to upload files incrementally.

**Headers:**
- `Authorization: Bearer <token>` (freelancer role required)
- `Content-Type: multipart/form-data`

**Body:**
- `files`: Array of files (up to 10 files, 25MB each)

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "filename": "project-source.zip",
      "url": "https://storage.url/milestone-deliverables/user123/milestone-456/project-source.zip",
      "size": 2048576,
      "mimeType": "application/zip"
    }
  ],
  "message": "Successfully uploaded 1 file(s)"
}
```

#### 2. Submit Milestone with File Upload
**POST** `/api/milestones/:id/submit-with-files`

Upload files and submit the milestone in one request.

**Headers:**
- `Authorization: Bearer <token>` (freelancer role required)
- `Content-Type: multipart/form-data`

**Body:**
- `files`: Array of new files to upload
- `notes`: Optional submission notes
- `existingDeliverables`: JSON string of previously uploaded files

**Response:**
```json
{
  "id": "milestone-456",
  "status": "submitted",
  "submittedAt": "2026-03-14T10:00:00Z",
  "deliverableFiles": [
    {
      "filename": "project-source.zip",
      "url": "https://storage.url/...",
      "size": 2048576,
      "mimeType": "application/zip"
    }
  ],
  "uploadedFiles": 1,
  "totalFiles": 1
}
```

#### 3. Submit Milestone (Enhanced)
**POST** `/api/milestones/:id/submit`

Submit milestone with pre-uploaded files or file references.

**Headers:**
- `Authorization: Bearer <token>` (freelancer role required)
- `Content-Type: application/json`

**Body:**
```json
{
  "deliverables": [
    {
      "filename": "project-source.zip",
      "url": "https://storage.url/...",
      "size": 2048576,
      "mimeType": "application/zip"
    }
  ],
  "notes": "Milestone completed as per requirements"
}
```

### Supported File Types

The system supports a wide range of file types for deliverables:

**Documents:**
- PDF (.pdf)
- Word Documents (.doc, .docx)
- Excel Spreadsheets (.xlsx)
- PowerPoint Presentations (.pptx)
- Text Files (.txt)
- CSV Files (.csv)

**Images:**
- PNG (.png)
- JPEG (.jpg, .jpeg)
- GIF (.gif)
- WebP (.webp)
- SVG (.svg)

**Archives:**
- ZIP (.zip)
- RAR (.rar)
- 7-Zip (.7z)

**Code Files:**
- HTML (.html)
- CSS (.css)
- JavaScript (.js)
- JSON (.json)
- XML (.xml)

**Video (for demos):**
- MP4 (.mp4)
- WebM (.webm)
- QuickTime (.mov)

### File Limits

- **Maximum files per upload**: 10 files
- **Maximum file size**: 25MB per file
- **Storage bucket**: `milestone-deliverables`
- **File organization**: Files are stored in folders by milestone ID

### Usage Workflow

#### For Freelancers:

1. **Upload files incrementally** (optional):
   ```bash
   POST /api/milestones/123/upload-deliverables
   # Upload work-in-progress files
   ```

2. **Submit milestone with all deliverables**:
   ```bash
   POST /api/milestones/123/submit-with-files
   # Upload final files and submit milestone
   ```

   OR

   ```bash
   POST /api/milestones/123/submit
   # Submit with previously uploaded file references
   ```

#### For Employers:

- View submitted milestone with deliverable files
- Download and review files before approving
- Request revisions if needed

### Security Features

- **File type validation**: Only allowed file types can be uploaded
- **Magic number validation**: Files are validated by their actual content, not just extension
- **Malware scanning**: Files are checked for malicious content
- **Size limits**: Prevents abuse with oversized files
- **Rate limiting**: Upload endpoints are rate-limited to prevent spam
- **Authentication**: Only authenticated freelancers can upload to their milestones

### Error Handling

Common error responses:

```json
{
  "error": "No files provided"
}
```

```json
{
  "error": "File size exceeds 25MB limit"
}
```

```json
{
  "error": "Invalid file type. Only documents, images, archives, code files, and videos are allowed."
}
```

```json
{
  "error": "Milestone not found"
}
```

```json
{
  "error": "You are not authorized to submit this milestone"
}
```

---

## New Features Implementation Summary

This document outlines all newly implemented features for the FreelanceXchain platform.

### Overview

The following features have been implemented to enhance the platform's functionality, user experience, and administrative capabilities:

1. ✅ Messaging System
2. ✅ Review System
3. ✅ Admin Management Dashboard
4. ✅ Transaction History
5. ✅ Health Check Endpoints
6. ✅ File Management
7. ✅ Analytics & Reporting
9. ✅ Favorites/Bookmarks
10. ✅ Enhanced Portfolio Management
13. ✅ Email Preferences
15. ✅ Saved Searches
18. ✅ Escrow Refund Flow (Enhanced)

---

### 1. Messaging System

**Purpose**: Enable direct communication between freelancers and employers.

#### API Endpoints

- `POST /api/messages/send` - Send a message
- `GET /api/messages/conversations` - Get user's conversations
- `GET /api/messages/conversations/:conversationId` - Get messages in a conversation
- `PATCH /api/messages/conversations/:conversationId/read` - Mark conversation as read
- `GET /api/messages/unread-count` - Get unread message count

#### Features

- Real-time messaging between users
- Conversation threading
- Unread message tracking
- File attachments support
- Message history pagination

#### Files Created

- `src/models/message.ts`
- `src/repositories/message-repository.ts`
- `src/routes/message-routes.ts`
- Service implementation in existing `src/services/message-service.ts`

---

### 2. Review System

**Purpose**: Detailed project reviews separate from blockchain reputation ratings.

#### API Endpoints

- `POST /api/reviews` - Submit a review
- `GET /api/reviews/:id` - Get review details
- `GET /api/reviews/user/:userId` - Get user's reviews
- `GET /api/reviews/project/:projectId` - Get project reviews
- `GET /api/reviews/can-review/:contractId` - Check if user can review

#### Features

- Multi-dimensional ratings (work quality, communication, professionalism)
- "Would work again" indicator
- Contract-based review eligibility
- Duplicate review prevention
- Public review visibility

#### Files Created

- `src/models/review.ts`
- `src/routes/review-routes.ts`
- Service implementation in existing `src/services/review-service.ts`

---

### 3. Admin Management Dashboard

**Purpose**: Comprehensive admin tools for platform management.

#### API Endpoints

- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/users` - User management data
- `POST /api/admin/users/:userId/suspend` - Suspend user
- `POST /api/admin/users/:userId/unsuspend` - Unsuspend user
- `POST /api/admin/users/:userId/verify` - Manually verify user
- `GET /api/admin/disputes` - Dispute management dashboard
- `GET /api/admin/system/health` - System health metrics

#### Features

- Platform-wide statistics
- User management (suspend, verify)
- Dispute oversight
- System health monitoring
- Role-based access (admin only)

#### Files Created

- `src/routes/admin-routes.ts`
- Service implementation in existing `src/services/admin-service.ts`

---

### 4. Transaction History

**Purpose**: Complete payment and transaction tracking for users.

#### API Endpoints

- `GET /api/transactions` - Get user transactions (with filters)
- `GET /api/transactions/:id` - Get transaction details
- `GET /api/transactions/contract/:contractId` - Get contract transactions

#### Features

- Transaction history with pagination
- Filter by type and status
- Contract-specific transaction view
- Authorization checks
- Export-ready data format

#### Files Created

- `src/routes/transaction-routes.ts`
- Service implementation in existing `src/services/transaction-service.ts`

---

### 5. Health Check Endpoints

**Purpose**: System monitoring and readiness checks.

#### API Endpoints

- `GET /api/health` - General health check
- `GET /api/health/ready` - Readiness probe

#### Features

- Database connectivity check
- Service status reporting
- Uptime tracking
- Kubernetes-compatible probes

#### Files Created

- `src/routes/health-routes.ts`

---

### 6. File Management

**Purpose**: Manage uploaded files and storage quotas.

#### API Endpoints

- `GET /api/file-management` - List user's files
- `DELETE /api/file-management/:bucket/:path` - Delete file
- `GET /api/file-management/quota` - Get storage quota

#### Features

- File listing by bucket
- Secure file deletion
- Storage quota tracking
- Authorization checks

#### Files Created

- `src/routes/file-routes.ts`
- Service implementation in existing `src/services/file-service.ts`

---

### 7. Analytics & Reporting

**Purpose**: Insights and metrics for users and platform.

#### API Endpoints

- `GET /api/analytics/freelancer` - Freelancer analytics
- `GET /api/analytics/employer` - Employer analytics
- `GET /api/analytics/skill-trends` - Skill demand trends
- `GET /api/analytics/platform` - Platform-wide metrics

#### Features

- Earnings reports for freelancers
- Spending reports for employers
- Skill demand analysis
- Platform usage statistics
- Date range filtering

#### Files Created

- `src/routes/analytics-routes.ts`
- Service implementation in existing `src/services/analytics-service.ts`

---

### 9. Favorites/Bookmarks

**Purpose**: Save projects and freelancer profiles for later.

#### API Endpoints

- `POST /api/favorites` - Add favorite
- `GET /api/favorites` - Get user favorites
- `DELETE /api/favorites/:targetType/:targetId` - Remove favorite
- `GET /api/favorites/check/:targetType/:targetId` - Check if favorited

#### Features

- Bookmark projects and freelancers
- Filter by target type
- Quick favorite status check
- Duplicate prevention

#### Files Created

- `src/models/favorite.ts`
- `src/routes/favorite-routes.ts`
- Service implementation in existing `src/services/favorite-service.ts`

---

### 10. Enhanced Portfolio Management

**Purpose**: Showcase freelancer work with images and details.

#### API Endpoints

- `POST /api/portfolio` - Create portfolio item (with image upload)
- `GET /api/portfolio/freelancer/:freelancerId` - Get freelancer portfolio
- `GET /api/portfolio/:id` - Get portfolio item
- `PATCH /api/portfolio/:id` - Update portfolio item
- `DELETE /api/portfolio/:id` - Delete portfolio item

#### Features

- Multi-image upload support
- Project details and descriptions
- Skill tagging
- External project links
- Completion date tracking

#### Files Created

- `src/models/portfolio.ts`
- `src/routes/portfolio-routes.ts`
- Service implementation in existing `src/services/portfolio-service.ts`
- Middleware: `uploadPortfolioImages` in file-upload-middleware

---

### 13. Email Preferences

**Purpose**: User control over email notifications.

#### API Endpoints

- `GET /api/email-preferences` - Get preferences
- `PATCH /api/email-preferences` - Update preferences
- `POST /api/email-preferences/unsubscribe-all` - Unsubscribe from all

#### Features

- Granular notification controls
- Marketing email opt-in/out
- Weekly digest option
- Complete unsubscribe option

#### Files Created

- `src/models/email-preference.ts`
- `src/routes/email-preference-routes.ts`
- Service implementation in existing `src/services/email-preference-service.ts`

---

### 15. Saved Searches

**Purpose**: Save and reuse search criteria with notifications.

#### API Endpoints

- `POST /api/saved-searches` - Create saved search
- `GET /api/saved-searches` - Get user's saved searches
- `PATCH /api/saved-searches/:id` - Update saved search
- `DELETE /api/saved-searches/:id` - Delete saved search
- `POST /api/saved-searches/:id/execute` - Execute saved search

#### Features

- Save project and freelancer searches
- Optional new match notifications
- Search execution
- Filter persistence

#### Files Created

- `src/models/saved-search.ts`
- `src/routes/saved-search-routes.ts`
- Service implementation in existing `src/services/saved-search-service.ts`

---

### 18. Escrow Refund Flow (Enhanced)

**Purpose**: Handle partial refunds and refund requests.

#### Enhanced Features

- Partial refund support in dispute resolution
- Refund request workflow
- Refund approval process
- Transaction tracking for refunds

#### Implementation

Enhanced existing dispute and payment services to support refund scenarios.

---

### Database Schema Requirements

The following tables need to be created in Appwrite:

#### 1. conversations
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant1_id UUID NOT NULL REFERENCES users(id),
  participant2_id UUID NOT NULL REFERENCES users(id),
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  unread_count_1 INTEGER DEFAULT 0,
  unread_count_2 INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(participant1_id, participant2_id)
);
```

#### 2. messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  receiver_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  attachments JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 3. reviews
```sql
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID NOT NULL REFERENCES contracts(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewee_id UUID NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  work_quality INTEGER CHECK (work_quality >= 1 AND work_quality <= 5),
  communication INTEGER CHECK (communication >= 1 AND communication <= 5),
  professionalism INTEGER CHECK (professionalism >= 1 AND professionalism <= 5),
  would_work_again BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(contract_id, reviewer_id)
);
```

#### 4. favorites
```sql
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('project', 'freelancer')),
  target_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, target_type, target_id)
);
```

#### 5. portfolio_items
```sql
CREATE TABLE portfolio_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  freelancer_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  project_url TEXT,
  images JSONB NOT NULL,
  skills TEXT[],
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 6. email_preferences
```sql
CREATE TABLE email_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
  proposal_received BOOLEAN DEFAULT TRUE,
  proposal_accepted BOOLEAN DEFAULT TRUE,
  milestone_updates BOOLEAN DEFAULT TRUE,
  payment_notifications BOOLEAN DEFAULT TRUE,
  dispute_notifications BOOLEAN DEFAULT TRUE,
  marketing_emails BOOLEAN DEFAULT FALSE,
  weekly_digest BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 7. saved_searches
```sql
CREATE TABLE saved_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('project', 'freelancer')),
  filters JSONB NOT NULL,
  notify_on_new BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 8. transactions (if not exists)
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id),
  milestone_id UUID,
  from_user_id UUID REFERENCES users(id),
  to_user_id UUID REFERENCES users(id),
  amount DECIMAL(20, 2) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  transaction_hash TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### Storage Buckets Required

Create the following Appwrite Storage buckets:

1. `portfolio-images` - For portfolio item images
2. `message-attachments` - For message file attachments (if not using existing buckets)

---

### Next Steps

#### 1. Database Migration
Run the SQL scripts above to create required tables.

#### 2. Service Implementation
Complete the service layer implementations for:
- `message-service.ts`
- `review-service.ts`
- `admin-service.ts`
- `transaction-service.ts`
- `analytics-service.ts`
- `favorite-service.ts`
- `portfolio-service.ts`
- `email-preference-service.ts`
- `saved-search-service.ts`
- `file-service.ts`

#### 3. Testing
Create comprehensive tests for all new endpoints and services.

#### 4. Documentation
Update API documentation with new endpoints.

#### 5. Frontend Integration
Implement UI components for all new features.

---

### Security Considerations

All new endpoints include:
- ✅ Authentication middleware
- ✅ Authorization checks
- ✅ Rate limiting
- ✅ Input validation
- ✅ CSRF protection (inherited)
- ✅ UUID validation where applicable

---

### Performance Optimizations

- Pagination implemented for all list endpoints
- Database indexes recommended for:
  - `conversations(participant1_id, participant2_id)`
  - `messages(conversation_id, created_at)`
  - `reviews(reviewee_id, created_at)`
  - `favorites(user_id, target_type)`
  - `portfolio_items(freelancer_id)`
  - `saved_searches(user_id, search_type)`
  - `transactions(contract_id, created_at)`

---

### Monitoring & Observability

- Health check endpoints for Kubernetes probes
- Admin dashboard for system metrics
- Transaction logging for audit trails
- Analytics for platform insights

---

### Compliance & Privacy

- Email preferences for GDPR compliance
- User data deletion support in file management
- Audit logging for sensitive operations
- KYC integration maintained

---

### Future Enhancements

Features intentionally excluded (as per requirements):
- ❌ Withdrawal/Payout System (8)
- ❌ Subscription/Premium Features (11)
- ❌ Referral System (12)
- ❌ Multi-language Support (14)
- ❌ Team/Agency Support (16)
- ❌ Invoice Generation (17)

These can be implemented in future iterations based on business needs.

---

### Summary

This implementation adds **13 major feature sets** to the FreelanceXchain platform, significantly enhancing:

- **User Experience**: Messaging, favorites, portfolio, saved searches
- **Platform Management**: Admin dashboard, analytics, transaction history
- **System Reliability**: Health checks, file management
- **User Control**: Email preferences, review system

All features align with the platform's core mission of providing fair, transparent, and efficient freelance marketplace services while supporting UN SDGs 8, 9, and 16.

---

## Project Attachments Feature

### Overview
Employers can now attach reference files (images, documents) when creating projects to help freelancers better understand the project requirements.

### API Endpoints

#### Create Project with Attachments
```
POST /api/projects/with-attachments
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**Form Fields:**
- `title` (string, required): Project title (min 5 characters)
- `description` (string, required): Project description (min 20 characters)  
- `requiredSkills` (JSON string, required): Array of skill objects with skillId
- `budget` (number, required): Project budget (> 0)
- `deadline` (string, required): Project deadline (ISO date)
- `tags` (JSON string, optional): Array of project tags (max 10)
- `files` (files, optional): Reference files/images (max 10 files, 10MB each)

**Example:**
```javascript
const formData = new FormData();
formData.append('title', 'E-commerce Website Development');
formData.append('description', 'Need a modern e-commerce website with payment integration...');
formData.append('requiredSkills', JSON.stringify([{skillId: 'uuid-here'}]));
formData.append('budget', '5000');
formData.append('deadline', '2026-06-01T00:00:00Z');
formData.append('tags', JSON.stringify(['react', 'ecommerce', 'payment']));
formData.append('files', imageFile1);
formData.append('files', documentFile2);
```

### File Restrictions
- **File Types**: PDF, DOC, DOCX, TXT, PNG, JPG, JPEG, GIF
- **File Size**: Max 10MB per file
- **File Count**: Max 10 files per project
- **Storage**: Files stored in Appwrite Storage with RLS policies

### Database Changes
- Added `attachments` JSONB column to `projects` table
- Created `project-attachments` storage bucket
- Added RLS policies for secure file access

### Benefits for Freelancers
- Visual references help understand project scope
- Design mockups and wireframes provide clear direction
- Sample documents show expected quality and style
- Reduces back-and-forth communication during proposal phase

---

## Project Tags Feature

### Overview

Employers can now add tags/hashtags to their projects to better categorize and highlight project requirements, making it easier for freelancers to search and filter relevant opportunities.

### Features

- Add up to 10 tags per project
- Tags are automatically cleaned (trimmed, deduplicated)
- Efficient tag-based searching with GIN indexes
- Optional field - projects can be created with or without tags

### API Usage

#### Create Project with Tags

```bash
curl -X POST https://api.freelancexchain.com/api/projects \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build React Dashboard",
    "description": "Need an experienced developer to build a modern dashboard...",
    "requiredSkills": [
      {"skillId": "skill-uuid-1"},
      {"skillId": "skill-uuid-2"}
    ],
    "budget": 5000,
    "deadline": "2026-06-30T00:00:00Z",
    "tags": ["react", "typescript", "dashboard", "frontend"]
  }'
```

### Response Example

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "employerId": "EMPLOYER_UUID",
  "title": "Build React Dashboard",
  "description": "Need an experienced developer...",
  "requiredSkills": [...],
  "budget": 5000,
  "deadline": "2026-06-30T00:00:00Z",
  "status": "open",
  "milestones": [],
  "tags": ["react", "typescript", "dashboard", "frontend"],
  "createdAt": "2026-03-12T10:00:00Z",
  "updatedAt": "2026-03-12T10:00:00Z"
}
```

### Validation Rules

- Tags field is optional
- Maximum 10 tags per project
- Each tag must be a string
- Empty tags are automatically removed
- Duplicate tags are automatically removed
- Tags are trimmed of whitespace

### Database Queries

#### Search projects by single tag
```sql
SELECT * FROM projects WHERE 'react' = ANY(tags);
```

#### Search projects with multiple tags (OR)
```sql
SELECT * FROM projects WHERE tags && ARRAY['react', 'nodejs'];
```

#### Search projects with all tags (AND)
```sql
SELECT * FROM projects WHERE tags @> ARRAY['react', 'nodejs'];
```

### Use Cases

- **Technology Stack**: Tag projects with tech requirements (e.g., "react", "nodejs", "postgresql")
- **Project Type**: Indicate project category (e.g., "frontend", "backend", "fullstack", "mobile")
- **Industry**: Specify industry domain (e.g., "fintech", "healthcare", "ecommerce")
- **Urgency**: Highlight time-sensitive projects (e.g., "urgent", "asap")
- **Experience Level**: Indicate required expertise (e.g., "senior", "junior", "expert")

### Benefits

- **For Freelancers**: Easier to find relevant projects matching their skills
- **For Employers**: Better project visibility and more targeted proposals
- **For Platform**: Improved search and recommendation algorithms

### Migration

The feature includes a database migration that:
1. Removes tags column from proposals table (moved from proposals to projects)
2. Adds tags column to projects table
3. Sets default value as empty array
4. Creates a GIN index for efficient tag searching
5. Adds documentation comment

Run the migration:
```bash
# Using Appwrite CLI
appwrite db push

# Or apply manually
psql -d your_database -f appwrite/migrations/20260312000002_move_tags_to_projects.sql
```

---

## Proposal with Employer History

### Overview

When viewing a proposal, freelancers can see the employer's track record to make more informed decisions. This feature provides transparency and helps freelancers assess the reliability of potential employers.

### Feature Details

#### What Information is Shown

When a freelancer views a proposal, they can see:

1. **Completed Projects Count** - How many projects the employer has completed
2. **Average Rating** - Average rating from previous freelancers (0-5 stars)
3. **Review Count** - Total number of reviews received
4. **Company Name** - Employer's company name
5. **Industry** - Employer's industry/sector

### API Endpoint

```
GET /api/proposals/{id}/with-employer-history
```

**Authentication Required:** Yes (Freelancer role only)

**Parameters:**
- `id` (path parameter) - Proposal ID (UUID)

**Response Example:**

```json
{
  "proposal": {
    "id": "proposal-uuid",
    "projectId": "project-uuid",
    "freelancerId": "freelancer-uuid",
    "proposedRate": 5000,
    "estimatedDuration": 30,
    "status": "pending",
    "attachments": [...],
    "createdAt": "2026-03-12T10:00:00Z",
    "updatedAt": "2026-03-12T10:00:00Z"
  },
  "project": {
    "id": "project-uuid",
    "title": "E-commerce Website Development",
    "description": "Build a modern e-commerce platform",
    "employerId": "employer-uuid",
    ...
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

- Only the freelancer who submitted the proposal can view employer history
- Employers cannot view their own history through this endpoint
- Admins are not allowed to use this endpoint (freelancer-specific feature)

### Use Cases

1. **Assessing Employer Reliability**
   - Freelancer checks if employer has completed projects before
   - High completion rate = reliable employer

2. **Rating-Based Decision Making**
   - Freelancer sees average rating from previous freelancers
   - Low ratings may indicate payment issues or difficult working conditions

3. **Company Verification**
   - Freelancer verifies company name and industry
   - Helps identify legitimate businesses vs. suspicious accounts

4. **Risk Assessment**
   - New employers (0 completed projects) = higher risk
   - Established employers with good ratings = lower risk

### Implementation Details

#### Service Layer

The `getProposalWithEmployerHistory()` function in `proposal-service.ts`:

1. Fetches the proposal by ID
2. Gets the associated project to find the employer
3. Queries all contracts by employer and filters for completed ones
4. Calculates average rating from reviews
5. Fetches employer profile information
6. Returns combined data

#### Database Queries

- `contractRepository.getContractsByEmployer()` - Get all employer contracts
- `ReviewRepository.getAverageRating()` - Calculate average rating
- `employerProfileRepository.getProfileByUserId()` - Get employer profile

### Performance Considerations

- Multiple database queries are executed
- Consider caching employer history for frequently viewed proposals
- Rating calculation is done in the repository layer for efficiency

### Security & Privacy

#### What's Protected

- Only proposal owner (freelancer) can view employer history
- Employer's personal information is not exposed
- Only aggregated statistics are shown (not individual reviews)

#### What's Public

- Completed project count
- Average rating (aggregated)
- Company name and industry (already public in profile)

### Future Enhancements

1. **Detailed Project History**
   - Show list of completed project titles
   - Display project categories/types

2. **Payment Reliability Score**
   - Track on-time payment percentage
   - Show average payment delay

3. **Dispute History**
   - Number of disputes filed
   - Dispute resolution outcomes

4. **Response Time Metrics**
   - Average time to respond to proposals
   - Average time to approve milestones

5. **Caching Layer**
   - Cache employer history for 1 hour
   - Invalidate cache when new reviews are added

### Testing

To test this feature:

```bash
# 1. Create an employer account
# 2. Create and complete some projects
# 3. Get reviews from freelancers
# 4. Submit a proposal as a freelancer
# 5. View proposal with employer history

curl -X GET \
  http://localhost:7860/api/proposals/{proposal-id}/with-employer-history \
  -H "Authorization: Bearer {freelancer-token}"
```

### Related Features

- [Proposal Management](./proposal-management.md)
- [Review System](./review-system.md)
- [Employer Profiles](./employer-profiles.md)
- [Contract Management](./contract-management.md)

---

## Audit Logs Integration Examples

This document shows how to integrate audit logging into your existing routes and services.

### Example 1: Authentication Routes

```typescript
// src/routes/auth-routes.ts
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Your existing login logic
    const user = await authService.login(email, password);
    
    // Log successful login
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.LOGIN,
      resourceType: 'user',
      resourceId: user.id,
      payload: {
        email: user.email,
        loginMethod: 'email',
      },
      status: 'success',
    });
    
    res.json({ user, token: user.token });
  } catch (error: any) {
    // Log failed login attempt
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.LOGIN,
      resourceType: 'user',
      payload: {
        email: req.body.email,
        loginMethod: 'email',
      },
      status: 'failure',
      errorMessage: error.message,
    });
    
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Your existing logout logic
    await authService.logout(userId);
    
    // Log logout
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.LOGOUT,
      resourceType: 'user',
      resourceId: userId,
      status: 'success',
    });
    
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

### Example 2: Contract Routes with Middleware

```typescript
// src/routes/contract-routes.ts
import { auditMiddleware, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Create contract - automatic audit logging
router.post(
  '/',
  authenticateToken,
  auditMiddleware(AUDITABLE_ACTIONS.CONTRACT_CREATED, 'contract'),
  async (req: Request, res: Response) => {
    // Your existing contract creation logic
    const contract = await contractService.create(req.body);
    res.json(contract);
  }
);

// Sign contract - manual audit logging with custom payload
router.post('/:id/sign', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    
    const contract = await contractService.sign(id, userId);
    
    // Log with detailed information
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.CONTRACT_SIGNED,
      resourceType: 'contract',
      resourceId: id,
      payload: {
        contractAmount: contract.amount,
        signerRole: contract.freelancer_id === userId ? 'freelancer' : 'employer',
        signedAt: new Date().toISOString(),
      },
      status: 'success',
    });
    
    res.json(contract);
  } catch (error: any) {
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.CONTRACT_SIGNED,
      resourceType: 'contract',
      resourceId: req.params.id,
      status: 'failure',
      errorMessage: error.message,
    });
    
    res.status(500).json({ error: error.message });
  }
});
```

### Example 3: Payment Routes

```typescript
// src/routes/payment-routes.ts
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Initiate payment
router.post('/initiate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { contractId, amount } = req.body;
    const userId = (req as any).user.id;
    
    const payment = await paymentService.initiate(contractId, amount, userId);
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.PAYMENT_INITIATED,
      resourceType: 'payment',
      resourceId: payment.id,
      payload: {
        contractId,
        amount,
        currency: 'USD',
        paymentMethod: 'blockchain',
      },
      status: 'pending',
    });
    
    res.json(payment);
  } catch (error: any) {
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.PAYMENT_INITIATED,
      resourceType: 'payment',
      payload: req.body,
      status: 'failure',
      errorMessage: error.message,
    });
    
    res.status(500).json({ error: error.message });
  }
});

// Payment webhook (from blockchain)
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { paymentId, status, transactionHash } = req.body;
    
    const payment = await paymentService.updateStatus(paymentId, status);
    
    const action = status === 'completed' 
      ? AUDITABLE_ACTIONS.PAYMENT_COMPLETED 
      : AUDITABLE_ACTIONS.PAYMENT_FAILED;
    
    await logAuditEvent(req, {
      action,
      resourceType: 'payment',
      resourceId: paymentId,
      payload: {
        transactionHash,
        blockchainStatus: status,
        webhookReceived: new Date().toISOString(),
      },
      status: status === 'completed' ? 'success' : 'failure',
    });
    
    res.json({ received: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

### Example 4: KYC Routes

```typescript
// src/routes/didit-kyc-routes.ts
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Submit KYC
router.post('/submit', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const kycData = req.body;
    
    const verification = await kycService.submit(userId, kycData);
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.KYC_SUBMITTED,
      resourceType: 'kyc_verification',
      resourceId: verification.id,
      payload: {
        verificationType: kycData.type,
        documentsSubmitted: kycData.documents?.length || 0,
      },
      status: 'pending',
    });
    
    res.json(verification);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin approve KYC
router.post('/:id/approve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user.id;
    
    const verification = await kycService.approve(id, adminId);
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.KYC_APPROVED,
      resourceType: 'kyc_verification',
      resourceId: id,
      payload: {
        approvedBy: adminId,
        userId: verification.user_id,
      },
      status: 'success',
    });
    
    res.json(verification);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

### Example 5: Dispute Routes

```typescript
// src/routes/dispute-routes.ts
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Create dispute
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { contractId, reason, description } = req.body;
    
    const dispute = await disputeService.create({
      contractId,
      raisedBy: userId,
      reason,
      description,
    });
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.DISPUTE_CREATED,
      resourceType: 'dispute',
      resourceId: dispute.id,
      payload: {
        contractId,
        reason,
        raisedBy: userId,
      },
      status: 'success',
    });
    
    res.json(dispute);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve dispute
router.post('/:id/resolve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution, winner } = req.body;
    const adminId = (req as any).user.id;
    
    const dispute = await disputeService.resolve(id, resolution, winner, adminId);
    
    await logAuditEvent(req, {
      action: AUDITABLE_ACTIONS.DISPUTE_RESOLVED,
      resourceType: 'dispute',
      resourceId: id,
      payload: {
        resolution,
        winner,
        resolvedBy: adminId,
        contractId: dispute.contract_id,
      },
      status: 'success',
    });
    
    res.json(dispute);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

### Example 6: Service Layer Integration

```typescript
// src/services/contract-service.ts
import { AuditLogRepository } from '../repositories/audit-log-repository.js';

export class ContractService {
  private auditLogRepo: AuditLogRepository;
  
  constructor() {
    this.auditLogRepo = new AuditLogRepository();
  }
  
  async updateContractStatus(contractId: string, status: string, userId: string): Promise<Contract> {
    try {
      const contract = await this.contractRepo.update(contractId, { status });
      
      // Log the status change
      await this.auditLogRepo.logAction({
        user_id: userId,
        action: 'contract_status_changed',
        resource_type: 'contract',
        resource_id: contractId,
        payload: {
          oldStatus: contract.status,
          newStatus: status,
        },
        status: 'success',
      });
      
      return contract;
    } catch (error) {
      // Log the failure
      await this.auditLogRepo.logAction({
        user_id: userId,
        action: 'contract_status_changed',
        resource_type: 'contract',
        resource_id: contractId,
        payload: {
          attemptedStatus: status,
        },
        status: 'failure',
        error_message: (error as Error).message,
      });
      
      throw error;
    }
  }
}
```

### Example 7: Background Job Logging

```typescript
// src/jobs/payment-processor.ts
import { AuditLogRepository } from '../repositories/audit-log-repository.js';

export class PaymentProcessor {
  private auditLogRepo: AuditLogRepository;
  
  constructor() {
    this.auditLogRepo = new AuditLogRepository();
  }
  
  async processScheduledPayments(): Promise<void> {
    const pendingPayments = await this.paymentRepo.getPending();
    
    for (const payment of pendingPayments) {
      try {
        await this.processPayment(payment);
        
        await this.auditLogRepo.logAction({
          user_id: payment.user_id,
          actor_id: 'system:payment-processor',
          action: 'payment_processed_automatically',
          resource_type: 'payment',
          resource_id: payment.id,
          payload: {
            amount: payment.amount,
            scheduledAt: payment.scheduled_at,
            processedAt: new Date().toISOString(),
          },
          status: 'success',
        });
      } catch (error) {
        await this.auditLogRepo.logAction({
          user_id: payment.user_id,
          actor_id: 'system:payment-processor',
          action: 'payment_processed_automatically',
          resource_type: 'payment',
          resource_id: payment.id,
          payload: {
            amount: payment.amount,
            scheduledAt: payment.scheduled_at,
          },
          status: 'failure',
          error_message: (error as Error).message,
        });
      }
    }
  }
}
```

### Best Practices

1. **Always log both success and failure**: Capture both outcomes for complete audit trail
2. **Include relevant context**: Add meaningful data to the payload field
3. **Use consistent action names**: Use the AUDITABLE_ACTIONS constants
4. **Don't log sensitive data**: Never include passwords, tokens, or full credit card numbers
5. **Log at the right level**: Use middleware for simple CRUD, manual logging for complex operations
6. **Handle errors gracefully**: Don't let audit logging failures break your application
7. **Use descriptive resource types**: Make it easy to filter and search logs later
8. **Include actor information**: Track who performed the action (user, admin, system)

---

## Audit Logs Documentation

### Overview

The audit logs system tracks all important actions in the FreelanceXchain platform for compliance, security, and debugging purposes. Every significant user action, system event, and data modification is recorded with full context.

**Users can view their own audit logs** through the `/api/audit-logs/me` endpoint for security monitoring and activity tracking. See [User Guide](guide.md) for the complete user guide.

### Features

- **Comprehensive Logging**: Tracks authentication, contracts, payments, disputes, KYC, and more
- **Immutable Records**: Audit logs cannot be modified or deleted once created
- **Rich Context**: Captures user ID, IP address, user agent, timestamps, and custom payload data
- **Flexible Querying**: Search by user, action, resource, date range, or status
- **Reporting**: Generate audit reports for users or system-wide analytics
- **Row-Level Security**: Users can only view their own logs; admins can view all

### Database Schema

```sql
CREATE TABLE audit_log_entries (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    actor_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    payload JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Auditable Actions

#### Authentication
- `user_login` - User login attempt
- `user_logout` - User logout
- `user_signup` - New user registration
- `user_password_change` - Password change

#### User Management
- `user_created` - User account created
- `user_updated` - User profile updated
- `user_deleted` - User account deleted

#### Contracts
- `contract_created` - New contract created
- `contract_signed` - Contract signed by party
- `contract_updated` - Contract terms updated
- `contract_cancelled` - Contract cancelled

#### Payments
- `payment_initiated` - Payment started
- `payment_completed` - Payment successful
- `payment_failed` - Payment failed
- `payment_refunded` - Payment refunded

#### Disputes
- `dispute_created` - New dispute opened
- `dispute_resolved` - Dispute resolved
- `dispute_escalated` - Dispute escalated

#### KYC
- `kyc_submitted` - KYC verification submitted
- `kyc_approved` - KYC verification approved
- `kyc_rejected` - KYC verification rejected

### Usage

#### Manual Logging

```typescript
import { logAuditEvent, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// In your route handler
await logAuditEvent(req, {
  action: AUDITABLE_ACTIONS.CONTRACT_SIGNED,
  resourceType: 'contract',
  resourceId: contractId,
  payload: {
    contractAmount: 1000,
    signerRole: 'freelancer',
  },
  status: 'success',
});
```

#### Automatic Logging with Middleware

```typescript
import { auditMiddleware, AUDITABLE_ACTIONS } from '../middleware/audit-logger.js';

// Apply to specific routes
router.post(
  '/contracts/:id/sign',
  authenticateToken,
  auditMiddleware(AUDITABLE_ACTIONS.CONTRACT_SIGNED, 'contract'),
  signContractHandler
);
```

#### Database Triggers (Optional)

Uncomment triggers in the migration file to automatically log all INSERT/UPDATE/DELETE operations on specific tables:

```sql
-- Enable automatic auditing for contracts table
DROP TRIGGER IF EXISTS audit_contracts ON contracts;
CREATE TRIGGER audit_contracts
    AFTER INSERT OR UPDATE OR DELETE ON contracts
    FOR EACH ROW EXECUTE FUNCTION log_table_changes();
```

### API Endpoints

#### Get Current User's Audit Logs (USER ACCESSIBLE)
```
GET /api/audit-logs/me?limit=100
Authorization: Bearer <token>
```

**This endpoint is accessible to ALL authenticated users** - users can view their own activity logs for security monitoring and compliance purposes.

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "user_id": "user-uuid",
      "action": "user_login",
      "resource_type": "auth",
      "status": "success",
      "created_at": "2024-02-19T10:30:00Z",
      "ip_address": "192.168.1.1",
      "payload": { ... }
    }
  ]
}
```

#### Get User Audit Logs (Admin Only)
```
GET /api/audit-logs/user/:userId?limit=100
Authorization: Bearer <admin-token>
```

#### Get Resource Audit Logs (Admin Only)
```
GET /api/audit-logs/resource/:resourceType/:resourceId
Authorization: Bearer <admin-token>
```

#### Get Audit Logs by Action (Admin Only)
```
GET /api/audit-logs/action/:action?limit=100
Authorization: Bearer <admin-token>
```

#### Get Failed Actions (Admin Only)
```
GET /api/audit-logs/failed?limit=100
Authorization: Bearer <admin-token>
```

#### Get Audit Logs by Date Range (Admin Only)
```
GET /api/audit-logs/range?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <admin-token>
```

#### Generate User Audit Report (Admin Only)
```
GET /api/audit-logs/report/user/:userId?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <admin-token>
```

Response:
```json
{
  "totalActions": 150,
  "successfulActions": 145,
  "failedActions": 5,
  "actionBreakdown": {
    "user_login": 50,
    "contract_created": 20,
    "payment_completed": 75
  },
  "logs": [...]
}
```

#### Generate System Audit Report (Admin Only)
```
GET /api/audit-logs/report/system?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <admin-token>
```

Response:
```json
{
  "totalActions": 5000,
  "successfulActions": 4850,
  "failedActions": 150,
  "actionBreakdown": {...},
  "resourceBreakdown": {...},
  "topUsers": [
    { "userId": "uuid-1", "count": 250 },
    { "userId": "uuid-2", "count": 200 }
  ]
}
```

### Security

#### Row-Level Security (RLS)

The audit logs table has RLS enabled with the following policies:

1. **Users can view their own logs**: Users can only see audit logs where `user_id` matches their authenticated user ID
2. **Admins can view all logs**: Users with `role = 'admin'` can view all audit logs
3. **Service role can insert**: Only the service role can create new audit logs
4. **Immutable logs**: No one can update or delete audit logs

### Best Practices

1. **Never log sensitive data**: Don't include passwords, tokens, or PII in the payload
2. **Use service role for logging**: Audit logging should use the service role to bypass RLS
3. **Monitor failed actions**: Regularly review failed actions for security incidents
4. **Set retention policies**: Consider archiving old logs to manage database size
5. **Encrypt at rest**: Ensure your Appwrite project has encryption enabled

### Compliance

This audit logging system helps meet compliance requirements for:

- **GDPR**: Track data access and modifications
- **SOC 2**: Demonstrate security controls and monitoring
- **PCI DSS**: Log payment-related activities
- **HIPAA**: Track access to sensitive information (if applicable)

### Performance Considerations

1. **Indexes**: The migration includes indexes on commonly queried columns
2. **Async logging**: Audit logging is non-blocking and won't slow down requests
3. **Batch queries**: Use date range queries with limits to avoid large result sets
4. **Archival**: Consider moving old logs to cold storage after 1-2 years

### Troubleshooting

#### Logs not appearing
- Check that the service role is being used for logging
- Verify RLS policies are correctly configured
- Check application logs for audit logging errors

#### Performance issues
- Add indexes for frequently queried columns
- Reduce the date range in queries
- Consider pagination for large result sets

#### Missing context data
- Ensure middleware is properly extracting user info from requests
- Verify IP address and user agent are being captured correctly

### Future Enhancements

- [ ] Export audit logs to external systems (S3, CloudWatch, etc.)
- [ ] Real-time audit log streaming via WebSocket
- [ ] Advanced analytics and anomaly detection
- [ ] Automated compliance report generation
- [ ] Integration with SIEM tools

---

## Proposal File Upload Implementation Summary

### Overview
Successfully implemented file upload feature for proposals, replacing text-based cover letters with file attachments (1-5 files per proposal).

### Implementation Approach
Used **URL reference pattern** where clients upload files to Appwrite Storage first, then submit file metadata to the API. This approach:
- Aligns with existing codebase patterns (dispute evidence, KYC documents)
- Reduces server load (no file processing on API)
- Leverages Appwrite Storage's built-in features
- Simplifies API implementation

### Files Created

#### 1. Core Implementation
- **`src/utils/file-validator.ts`** - File validation utility
  - Validates file count (1-5)
  - Validates file types (PDF, DOCX, DOC, TXT, PNG, JPG, JPEG, GIF)
  - Validates file sizes (10MB per file, 25MB total)
  - Validates URLs (must be from Appwrite Storage)
  - Exports `FileAttachment` type and validation functions

#### 2. Database
- **`appwrite/migrations/20260218000000_add_proposal_attachments.sql`** - Migration file
  - Adds `attachments` JSONB column to proposals table
  - Makes `cover_letter` nullable for backward compatibility
  - Adds column comments for documentation

#### 3. Documentation
- **[Overview](overview.md)** - Comprehensive guide
  - Architecture overview
  - File requirements and limits
  - Database schema details
  - Appwrite Storage setup instructions
  - API usage examples
  - Client implementation guide with code samples
  - Security considerations
  - Troubleshooting guide
  - Future enhancement ideas

### Files Modified

#### 1. Type Definitions
- **`src/repositories/proposal-repository.ts`**
  - Added `FileAttachment` import
  - Updated `ProposalEntity` type: `cover_letter: string | null`, added `attachments: FileAttachment[]`

- **`src/utils/entity-mapper.ts`**
  - Added `FileAttachment` import
  - Updated `Proposal` type: `coverLetter: string | null`, added `attachments: FileAttachment[]`
  - Updated `mapProposalFromEntity()` to handle attachments field

#### 2. Service Layer
- **`src/services/proposal-service.ts`**
  - Added `FileAttachment` and `validateAttachments` imports
  - Updated `CreateProposalInput` type: replaced `coverLetter: string` with `attachments: FileAttachment[]`
  - Updated `submitProposal()` function:
    - Added attachment validation at the start
    - Changed proposal entity creation to use `attachments` instead of `coverLetter`
    - Set `cover_letter: null` for new proposals

#### 3. Routes & Validation
- **`src/routes/proposal-routes.ts`**
  - Updated POST /api/proposals route handler:
    - Changed request body destructuring to use `attachments` instead of `coverLetter`
    - Updated validation to check for `attachments` array
    - Updated error response to include `details` field
  - Updated Swagger documentation:
    - Added `FileAttachment` schema definition
    - Updated `Proposal` schema to include `attachments` array and nullable `coverLetter`
    - Updated POST /api/proposals endpoint documentation

- **`src/middleware/validation-middleware.ts`**
  - Updated `submitProposalSchema`:
    - Replaced `coverLetter` field with `attachments` array
    - Added array validation (minItems: 1, maxItems: 5)
    - Added object schema for attachment items with required fields

#### 4. Configuration
- **`src/config/env.ts`**
  - Added `storage` section to `appwrite` config
  - Added `proposalAttachmentsBucket` configuration with default value

- **`src/config/appwrite.ts`**
  - Added `STORAGE_BUCKETS` constant with `PROPOSAL_ATTACHMENTS` bucket name
  - Exported `StorageBucketName` type

- **`appwrite/schema.sql`**
  - Added `attachments JSONB DEFAULT '[]'::jsonb` column to proposals table
  - Added column comments for documentation

#### 5. Tests
- **`src/__tests__/integration.test.ts`**
  - Updated proposal repository mock:
    - Added `attachments` field handling in `createProposal`
    - Added `attachments` field handling in `findProposalById`
    - Added `attachments` field handling in `getExistingProposal`
    - Made `cover_letter` nullable in all mocks
  - Updated test data in proposal submission test:
    - Replaced `coverLetter` with `attachments` array containing sample file metadata

- **`src/middleware/__tests__/validation-middleware.test.ts`**
  - Updated validation test for short cover letters → empty attachments array
  - Updated test for missing required fields to use `attachments` instead of `coverLetter`
  - Updated test data to include sample attachment objects

#### 6. Documentation
- **`CHANGELOG.md`**
  - Added comprehensive entry for proposal file attachments feature
  - Documented all changes, additions, and migration notes

### Key Features

#### File Validation
- **Count**: 1-5 files required per proposal
- **Types**: PDF, DOCX, DOC, TXT, PNG, JPG, JPEG, GIF
- **Size**: 10MB per file, 25MB total
- **URL**: Must be HTTPS from Appwrite Storage domain

### Security
- URL domain validation prevents external URL injection
- MIME type whitelist prevents malicious uploads
- File extension validation provides additional security
- Size limits prevent storage abuse

### Backward Compatibility
- `cover_letter` field remains in database (nullable)
- Existing proposals with text cover letters continue to work
- No data loss during migration

### API Changes

#### Request Format (Before)
```json
{
  "projectId": "uuid",
  "coverLetter": "text here...",
  "proposedRate": 5000,
  "estimatedDuration": 30
}
```

#### Request Format (After)
```json
{
  "projectId": "uuid",
  "attachments": [
    {
      "url": "https://project.appwrite.co/storage/v1/object/public/proposal-attachments/file.pdf",
      "filename": "proposal.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }
  ],
  "proposedRate": 5000,
  "estimatedDuration": 30
}
```

### Next Steps for Deployment

1. **Run Database Migration**
   ```bash
   # Apply migration to add attachments column
   psql -d your_database -f appwrite/migrations/20260218000000_add_proposal_attachments.sql
   ```

2. **Create Appwrite Storage Bucket**
   - Navigate to Appwrite Dashboard → Storage
   - Create bucket named `proposal-attachments`
   - Set to Private (authenticated access only)
   - Configure RLS policies for access control

3. **Update Environment Variables**
   ```env
   APPWRITE_PROPOSAL_ATTACHMENTS_BUCKET=proposal-attachments
   ```

4. **Test the Implementation**
   - Test file upload to Appwrite Storage from client
   - Test proposal submission with attachments
   - Test validation (file count, types, sizes)
   - Test error handling

5. **Update Client Applications**
   - Implement file upload to Appwrite Storage
   - Update proposal submission forms
   - Handle file metadata collection
   - Update UI to display attachments instead of cover letter

### Testing Checklist

- [x] TypeScript compilation (no proposal-related errors)
- [x] Unit tests updated for new attachment structure
- [x] Integration tests updated with sample attachments
- [x] Validation tests updated for attachment validation
- [ ] Manual testing of file upload flow
- [ ] Manual testing of proposal submission with attachments
- [ ] Manual testing of validation errors
- [ ] Manual testing of backward compatibility with existing proposals

### Notes

- The implementation compiles successfully (verified with `pnpm run build`)
- All proposal-related code has been updated consistently
- Tests have been updated to use the new attachment structure
- Comprehensive documentation has been created for developers and users
- The URL reference pattern minimizes backend complexity while maintaining security

---

## Proposal File Uploads

### Overview

Proposals now support file attachments instead of text-based cover letters. Freelancers can upload 1-5 files (documents and images) when submitting a proposal.

### Architecture

The implementation supports **two upload patterns**:

#### 1. Server-Side Upload (Recommended - New)
1. Client sends files via `multipart/form-data` to API
2. API validates files using multer middleware (extension, magic numbers, size)
3. API uploads validated files to Appwrite Storage
4. API stores file metadata in database
5. API returns proposal with file URLs

**Benefits:**
- Defense-in-depth security with multiple validation layers
- Magic number validation prevents MIME type spoofing
- Filename sanitization prevents path traversal attacks
- Rate limiting prevents abuse
- Centralized file validation logic

#### 2. URL Reference Pattern (Legacy - Backward Compatible)
1. Client uploads files directly to Appwrite Storage
2. Client receives file URLs from Appwrite
3. Client submits proposal with file metadata (URLs, filenames, sizes, MIME types)
4. API validates file metadata and stores references in the database

**Benefits:**
- Reduces server load (no file processing on API server)
- Leverages Appwrite Storage's built-in features (CDN, access control)
- Simpler client implementation for existing integrations

### File Requirements

#### Allowed File Types

**Documents:**
- PDF (`.pdf`)
- Microsoft Word (`.doc`, `.docx`)
- Plain Text (`.txt`)

**Images:**
- PNG (`.png`)
- JPEG (`.jpg`, `.jpeg`)
- GIF (`.gif`)

#### File Size Limits

- **Per file:** 10MB maximum
- **Total per proposal:** 25MB maximum
- **File count:** 1-5 files required

#### Security Validations

**Server-Side Upload (Multer):**
1. Extension validation (first line of defense)
2. Magic number validation (file signature detection)
3. Size validation (per file and total)
4. Count validation (1-5 files)
5. Filename sanitization (removes special characters, prevents path traversal)
6. Rate limiting (20 uploads per hour per user)

**URL Reference Pattern:**
1. URL domain validation (must be from Appwrite Storage)
2. MIME type whitelist validation
3. Extension validation
4. Size validation (metadata-based)
5. Count validation (1-5 files)

### Database Schema

#### Proposals Table

```sql
CREATE TABLE proposals (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  freelancer_id UUID REFERENCES users(id),
  cover_letter TEXT,  -- Legacy field (nullable)
  attachments JSONB DEFAULT '[]'::jsonb,  -- New field
  proposed_rate DECIMAL(10, 2),
  estimated_duration INTEGER,
  status VARCHAR(20),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### Attachments Structure

The `attachments` column stores a JSON array of file metadata:

```json
[
  {
    "url": "https://<project-ref>.appwrite.co/storage/v1/object/public/proposal-attachments/...",
    "filename": "proposal.pdf",
    "size": 1048576,
    "mimeType": "application/pdf"
  }
]
```

### Appwrite Storage Setup

#### 1. Create Storage Bucket

In Appwrite Dashboard:
1. Navigate to **Storage** section
2. Click **New bucket**
3. Bucket name: `proposal-attachments`
4. Set to **Private** (authenticated access only)
5. Click **Create bucket**

#### 2. Configure Bucket Policies

Set up Row Level Security (RLS) policies for the bucket:

```sql
-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload proposal attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'proposal-attachments');

-- Allow users to read their own uploaded files
CREATE POLICY "Users can read their own proposal attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'proposal-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow employers to read attachments for proposals on their projects
-- (This requires additional logic - implement based on your access control needs)
```

#### 3. Environment Configuration

Add to `.env`:

```env
APPWRITE_PROPOSAL_ATTACHMENTS_BUCKET=proposal-attachments
```

### API Usage

#### Option 1: Server-Side Upload (Recommended)

**Endpoint:** `POST /api/proposals`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `projectId` (string, required): Project UUID
- `proposedRate` (number, required): Proposed rate
- `estimatedDuration` (number, required): Duration in days
- `files` (file array, required): 1-5 files

**Example using fetch:**

```javascript
async function submitProposalWithFiles(files, proposalData, token) {
  const formData = new FormData();
  
  // Add form fields
  formData.append('projectId', proposalData.projectId);
  formData.append('proposedRate', proposalData.proposedRate);
  formData.append('estimatedDuration', proposalData.estimatedDuration);
  
  // Add files
  files.forEach(file => {
    formData.append('files', file);
  });
  
  const response = await fetch('/api/proposals', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      // Don't set Content-Type - browser will set it with boundary
    },
    body: formData,
  });
  
  return response.json();
}
```

**Response:** `201 Created`

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
  "status": "pending",
  "createdAt": "2026-02-18T...",
  "updatedAt": "2026-02-18T..."
}
```

#### Option 2: URL Reference Pattern (Legacy)

**Endpoint:** `POST /api/proposals`

**Content-Type:** `application/json`

**Request Body:**

```json
{
  "projectId": "uuid-here",
  "attachments": [
    {
      "url": "https://<project-ref>.appwrite.co/storage/v1/object/public/proposal-attachments/user-id/file.pdf",
      "filename": "proposal.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }
  ],
  "proposedRate": 5000,
  "estimatedDuration": 30
}
```

**Response:** Same as Option 1

### Client Implementation Guide

#### Option 1: Server-Side Upload (Recommended)

**HTML Form Example:**

```html
<form id="proposalForm" enctype="multipart/form-data">
  <input type="file" name="files" multiple accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif" required>
  <input type="number" name="proposedRate" required>
  <input type="number" name="estimatedDuration" required>
  <button type="submit">Submit Proposal</button>
</form>

<script>
document.getElementById('proposalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  formData.append('projectId', projectId); // Add project ID
  
  const response = await fetch('/api/proposals', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });
  
  const result = await response.json();
  console.log('Proposal submitted:', result);
});
</script>
```

**React Example:**

```typescript
import { useState } from 'react';

function ProposalForm({ projectId, token }) {
  const [files, setFiles] = useState<File[]>([]);
  const [proposedRate, setProposedRate] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('proposedRate', proposedRate);
    formData.append('estimatedDuration', estimatedDuration);
    
    files.forEach(file => {
      formData.append('files', file);
    });
    
    const response = await fetch('/api/proposals', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    const result = await response.json();
    console.log('Proposal submitted:', result);
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif"
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
        required
      />
      <input
        type="number"
        value={proposedRate}
        onChange={(e) => setProposedRate(e.target.value)}
        placeholder="Proposed Rate"
        required
      />
      <input
        type="number"
        value={estimatedDuration}
        onChange={(e) => setEstimatedDuration(e.target.value)}
        placeholder="Duration (days)"
        required
      />
      <button type="submit">Submit Proposal</button>
    </form>
  );
}
```

#### Option 2: URL Reference Pattern (Legacy)

**1. Upload Files to Appwrite Storage**

```typescript
import { createClient } from '@appwrite/appwrite-js';

const appwrite = createClient(APPWRITE_URL, APPWRITE_ANON_KEY);

async function uploadProposalFile(file: File, userId: string) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}.${fileExt}`;
  
  const { data, error } = await appwrite.storage
    .from('proposal-attachments')
    .upload(fileName, file);
  
  if (error) throw error;
  
  // Get public URL
  const { data: { publicUrl } } = appwrite.storage
    .from('proposal-attachments')
    .getPublicUrl(fileName);
  
  return {
    url: publicUrl,
    filename: file.name,
    size: file.size,
    mimeType: file.type,
  };
}
```

**2. Submit Proposal with File Metadata**

```typescript
async function submitProposal(files: File[], proposalData: any) {
  // Upload all files
  const attachments = await Promise.all(
    files.map(file => uploadProposalFile(file, userId))
  );
  
  // Submit proposal with file metadata
  const response = await fetch('/api/proposals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...proposalData,
      attachments,
    }),
  });
  
  return response.json();
}
```

### Validation

The API validates:

1. **File count:** 1-5 files required
2. **File size:** Each file ≤ 10MB, total ≤ 25MB
3. **File types:** Only allowed MIME types and extensions
4. **URL format:** Must be valid HTTPS URLs
5. **URL domain:** Must be from Appwrite Storage domain
6. **URL path:** Must include `/storage/` path segment

Validation errors return `400 Bad Request` with detailed error messages.

### Security Considerations

#### URL Validation

- Only Appwrite Storage URLs are accepted
- Prevents external URL injection attacks
- Validates HTTPS protocol

#### File Type Validation

- MIME type whitelist prevents malicious file uploads
- Extension validation provides additional security layer
- Size limits prevent storage abuse

#### Access Control

- Storage bucket should be private (authenticated access only)
- Implement RLS policies to control who can read/write files
- Consider implementing file ownership checks

#### Recommendations

1. **Virus Scanning:** Consider integrating virus scanning for uploaded files
2. **File Cleanup:** Implement cleanup for orphaned files (proposals that are deleted/rejected)
3. **Rate Limiting:** Add rate limits to prevent abuse
4. **Quota Management:** Track storage usage per user
5. **Audit Logging:** Log file uploads and access for security auditing

### Migration from Cover Letter

#### Backward Compatibility

The `cover_letter` field remains in the database but is nullable. Existing proposals with text cover letters will continue to work.

#### Data Migration (Optional)

If you want to convert existing text cover letters to files:

```sql
-- This is optional and can be done gradually
-- Example: Mark old proposals for manual review
UPDATE proposals
SET cover_letter = NULL
WHERE attachments = '[]'::jsonb
  AND cover_letter IS NOT NULL
  AND created_at < '2026-02-18';
```

### Testing

#### Unit Tests

Test file validation logic:

```typescript
import { validateAttachments } from '../utils/file-validator';

describe('File Validation', () => {
  it('should accept valid attachments', () => {
    const attachments = [{
      url: 'https://project.appwrite.co/storage/v1/object/public/proposal-attachments/file.pdf',
      filename: 'proposal.pdf',
      size: 1000000,
      mimeType: 'application/pdf',
    }];
    
    const errors = validateAttachments(attachments);
    expect(errors).toHaveLength(0);
  });
  
  it('should reject too many files', () => {
    const attachments = Array(6).fill({
      url: 'https://project.appwrite.co/storage/v1/object/public/proposal-attachments/file.pdf',
      filename: 'file.pdf',
      size: 1000,
      mimeType: 'application/pdf',
    });
    
    const errors = validateAttachments(attachments);
    expect(errors.some(e => e.message.includes('Maximum'))).toBe(true);
  });
});
```

#### Integration Tests

Test the full proposal submission flow with attachments.

### Troubleshooting

#### "File URL must be from Appwrite Storage domain"

- Ensure files are uploaded to Appwrite Storage first
- Check that the URL includes your project reference
- Verify the URL format matches: `https://<project-ref>.appwrite.co/storage/...`

#### "MIME type not allowed"

- Check that the file type is in the allowed list
- Ensure the MIME type matches the file extension
- Some files may have incorrect MIME types - validate on client side

#### "Total file size exceeds limit"

- Check individual file sizes (max 10MB each)
- Calculate total size before submission (max 25MB)
- Consider compressing large files or splitting into multiple proposals

#### Storage bucket not found

- Verify the bucket exists in Appwrite Dashboard
- Check the bucket name matches the configuration
- Ensure the bucket is accessible to authenticated users

### Future Enhancements

Potential improvements:

1. **Direct Upload API:** Add API endpoint for file uploads (alternative to client-side upload)
2. **File Preview:** Generate thumbnails for images and previews for documents
3. **Version Control:** Track file versions if proposals are updated
4. **Bulk Download:** Allow employers to download all proposal attachments as ZIP
5. **File Conversion:** Convert documents to PDF for consistent viewing
6. **OCR/Text Extraction:** Extract text from documents for search functionality

---

## Proposal File Upload - Quick Start Guide

### For Backend Developers

#### What Changed
- Proposals now use **file attachments** instead of text cover letters
- Clients must upload files to Appwrite Storage first, then submit file metadata
- API validates file metadata (URLs, types, sizes, count)

#### API Request Format
```typescript
POST /api/proposals
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

#### File Requirements
- **Count**: 1-5 files required
- **Types**: PDF, DOCX, DOC, TXT, PNG, JPG, JPEG, GIF
- **Size**: 10MB per file, 25MB total
- **URL**: Must be from Appwrite Storage

#### Deployment Steps
1. Run migration: `appwrite/migrations/20260218000000_add_proposal_attachments.sql`
2. Create Appwrite Storage bucket: `proposal-attachments` (private)
3. Set environment variable: `APPWRITE_PROPOSAL_ATTACHMENTS_BUCKET=proposal-attachments`
4. Configure bucket RLS policies (see overview.md)

---

### For Frontend Developers

#### Upload Flow
1. **User selects files** (1-5 files, allowed types only)
2. **Upload to Appwrite Storage**
   ```typescript
   const { data, error } = await appwrite.storage
     .from('proposal-attachments')
     .upload(`${userId}/${Date.now()}.${ext}`, file);
   ```
3. **Get file URL**
   ```typescript
   const { data: { publicUrl } } = appwrite.storage
     .from('proposal-attachments')
     .getPublicUrl(fileName);
   ```
4. **Submit proposal with file metadata**
   ```typescript
   const attachments = files.map(file => ({
     url: publicUrl,
     filename: file.name,
     size: file.size,
     mimeType: file.type,
   }));
   
   await fetch('/api/proposals', {
     method: 'POST',
     body: JSON.stringify({ projectId, attachments, proposedRate, estimatedDuration }),
   });
   ```

#### Client-Side Validation
```typescript
// Validate before upload
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
];

function validateFiles(files: File[]): string[] {
  const errors: string[] = [];
  
  if (files.length < 1 || files.length > 5) {
    errors.push('Please select 1-5 files');
  }
  
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    errors.push('Total file size exceeds 25MB');
  }
  
  files.forEach(file => {
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name} exceeds 10MB`);
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      errors.push(`${file.name} has invalid type`);
    }
  });
  
  return errors;
}
```

#### Error Handling
```typescript
try {
  const response = await fetch('/api/proposals', { ... });
  const data = await response.json();
  
  if (!response.ok) {
    // Handle validation errors
    if (data.error.code === 'VALIDATION_ERROR') {
      console.error('Validation errors:', data.error.details);
      // Display errors to user
    }
  }
} catch (error) {
  console.error('Upload failed:', error);
}
```

#### UI Components Needed
- File upload dropzone (drag & drop support)
- File list with preview (thumbnails for images, icons for documents)
- Progress indicators for uploads
- File size/type validation feedback
- Remove file button
- Total size indicator

---

### For QA/Testing

#### Test Cases

**Valid Submissions**
- [ ] Submit with 1 PDF file
- [ ] Submit with 5 mixed files (PDF + images)
- [ ] Submit with maximum allowed sizes (10MB per file)
- [ ] Submit with all allowed file types

**Validation Errors**
- [ ] Submit with 0 files → "At least 1 file is required"
- [ ] Submit with 6 files → "Maximum 5 files allowed"
- [ ] Submit with file > 10MB → "File size exceeds 10MB limit"
- [ ] Submit with total > 25MB → "Total file size exceeds 25MB limit"
- [ ] Submit with invalid file type → "File type not allowed"
- [ ] Submit with external URL → "File URL must be from Appwrite Storage"
- [ ] Submit with non-HTTPS URL → "File URL must use HTTPS protocol"

**Edge Cases**
- [ ] Submit with special characters in filename
- [ ] Submit with very long filename
- [ ] Submit with duplicate filenames
- [ ] Submit immediately after upload (race condition)
- [ ] Submit with deleted file URL (404)

**Backward Compatibility**
- [ ] View existing proposals with text cover letters
- [ ] Ensure old proposals still display correctly

#### API Testing with cURL
```bash
# Valid request
curl -X POST http://localhost:7860/api/proposals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "projectId": "uuid-here",
    "attachments": [{
      "url": "https://project.appwrite.co/storage/v1/object/public/proposal-attachments/test.pdf",
      "filename": "proposal.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }],
    "proposedRate": 5000,
    "estimatedDuration": 30
  }'

# Invalid request (no attachments)
curl -X POST http://localhost:7860/api/proposals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "projectId": "uuid-here",
    "attachments": [],
    "proposedRate": 5000,
    "estimatedDuration": 30
  }'
```

---

### Troubleshooting

#### "File URL must be from Appwrite Storage domain"
- Ensure files are uploaded to Appwrite Storage first
- Check that the URL includes your project reference
- Verify URL format: `https://<project-ref>.appwrite.co/storage/...`

#### "Storage bucket not found"
- Create the bucket in Appwrite Dashboard
- Verify bucket name matches configuration
- Check bucket is accessible to authenticated users

#### "Permission denied" when uploading
- Check Appwrite Storage RLS policies
- Ensure user is authenticated
- Verify bucket permissions allow uploads

#### Files upload but proposal submission fails
- Check file metadata is correct (URL, filename, size, mimeType)
- Verify all required fields are present
- Check file URLs are accessible
- Ensure total size doesn't exceed limits

---

### Documentation Links

- **Full Documentation**: [Overview](overview.md)
- **Implementation Details**: [Implementation Guide](implementation.md)
- **API Reference**: Swagger UI at `/api-docs`
- **Database Migration**: `appwrite/migrations/20260218000000_add_proposal_attachments.sql`
- **Validation Utility**: `src/utils/file-validator.ts`

[← Back to Deployment](README.md)
