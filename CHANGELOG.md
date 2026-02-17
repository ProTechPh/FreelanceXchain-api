# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

### Added

#### Server-Side File Upload Validation (IAS Checklist Completion)
- **Multer Middleware**: Implemented server-side file upload handling with `file-upload-middleware.ts`
  - Memory storage for processing before Supabase upload
  - Extension-based file type filtering (first line of defense)
  - Magic number validation using `file-type` library (prevents MIME spoofing)
  - File size validation (10MB per file, 25MB total)
  - File count validation (1-5 files for proposals, 1-10 for disputes)
  - Filename sanitization (removes special characters, prevents path traversal)
  - Comprehensive error handling with detailed error messages
- **Storage Uploader Utility**: Created `storage-uploader.ts` for Supabase Storage integration
  - Uploads validated files from memory to Supabase Storage
  - Generates unique filenames with UUID prefix
  - Returns file metadata (URL, filename, size, MIME type)
  - Cleanup functions for failed transactions
  - File path extraction from URLs
- **Rate Limiting**: Added `fileUploadRateLimiter` (20 uploads per hour per user)
- **Dual Upload Patterns**: Both endpoints now support two upload methods:
  - **Server-Side Upload** (Recommended): `multipart/form-data` with full validation
  - **URL Reference** (Legacy): `application/json` with pre-uploaded file URLs
- **Security Validations**: 5-layer defense-in-depth approach
  1. Extension validation (multer file filter)
  2. Magic number validation (file signature detection)
  3. Size and count limits
  4. Filename sanitization
  5. Rate limiting
- **Test Coverage**: Created comprehensive test suite with 35 passing tests
  - Filename sanitization (path traversal, special characters, unicode)
  - File size constants validation
  - Path traversal prevention
  - Null byte injection prevention
  - Edge case handling
- **IAS Checklist**: Marked "File upload validation (type + size)" as complete ✅

#### Proposal File Attachments
- **File Upload Support**: Proposals now support file attachments (1-5 files) instead of text-based cover letters.
- **Allowed File Types**: 
  - Documents: PDF, DOCX, DOC, TXT
  - Images: PNG, JPG, JPEG, GIF
- **File Size Limits**: 10MB per file, 25MB total per proposal
- **URL Reference Pattern**: Clients upload files to Supabase Storage first, then submit file metadata (URL, filename, size, MIME type) to the API
- **New Validation**: Added comprehensive file validation utility (`file-validator.ts`) that validates:
  - File count (1-5 required)
  - File types (MIME type and extension whitelist)
  - File sizes (per file and total)
  - URL format and domain (must be from Supabase Storage)
- **Database Schema**: Added `attachments` JSONB column to proposals table, made `cover_letter` nullable for backward compatibility
- **Storage Configuration**: Added `STORAGE_BUCKETS` constant and storage bucket configuration to environment
- **Documentation**: Updated `docs/PROPOSAL_FILE_UPLOADS.md` with:
  - Both upload patterns (server-side and URL reference)
  - HTML and React implementation examples
  - Security considerations for both approaches
  - API usage for multipart/form-data requests

### Changed
- **Proposal Submission**: `POST /api/proposals` now accepts both:
  - `multipart/form-data` with files (server-side upload)
  - `application/json` with attachments array (URL reference)
- **Dispute Evidence**: `POST /api/disputes/:disputeId/evidence` now accepts both:
  - `multipart/form-data` with single file (server-side upload)
  - `application/json` with type and content (URL reference)
- **Proposal Schema**: Updated `Proposal` type to include `attachments: FileAttachment[]` and made `coverLetter` nullable
- **API Documentation**: Updated Swagger/OpenAPI specs to reflect both upload patterns
- **Validation Schema**: Updated `submitProposalSchema` to validate attachments array instead of cover letter text
- **File Validator**: Exported constants (ALLOWED_MIME_TYPES, MAX_FILE_SIZE, etc.) for reuse across middleware

### Security
- **Magic Number Validation**: Prevents MIME type spoofing by validating file signatures
- **Filename Sanitization**: Prevents path traversal attacks (../, ..\, absolute paths)
- **Rate Limiting**: Prevents abuse with 20 uploads per hour per user
- **Null Byte Injection**: Removes null bytes from filenames
- **Defense-in-Depth**: Multiple validation layers ensure comprehensive security

### Migration
- **Database Migration**: Created migration file `20260218000000_add_proposal_attachments.sql` to add attachments column
- **Backward Compatibility**: Existing proposals with text cover letters remain accessible; `cover_letter` field is nullable
- **Gradual Migration**: Both upload patterns supported to allow gradual client migration

### Dependencies
- Added `multer@^1.4.5-lts.1` for multipart/form-data handling
- Added `file-type@16.5.4` for magic number validation
- Added `@types/multer@^2.0.0` for TypeScript support

---

## [2.5.1] - 2026-01-02

### Fixed
- **LinkedIn OAuth**: Fixed LinkedIn authentication by mapping `linkedin` provider to `linkedin_oidc` for Supabase compatibility.

---

## [2.5.0] - 2025-12-27

### Added

#### OAuth Role Selection (2-Step Flow)
- **Role Selection Logic**: Implemented "Post-Login Role Selection" to prevent default role assignment.
- **New Endpoints**:
  - `POST /api/auth/oauth/register`: Finalize OAuth account creation with a mandatory role (`employer` or `freelancer`).
- **Registration Signal**: `GET /api/auth/callback` now returns `202 Accepted` with `registration_required` status for new users.

### Security
- **Safety Handler**: Added `try-catch` block to OAuth registration route to prevent server crashes on database errors.
- **Strict Role Enforcement**: OAuth login no longer auto-creates accounts; explicit registration step is now required.

### Fixed
- **Role Assignment**: Fixed issue where Supabase OAuth defaults would create users without a clear role intent.

---

## [2.4.0] - 2025-12-26

### Added

#### OAuth Integration
- **Provider Support**: Integrated Google, GitHub, LinkedIn, and Microsoft authentication via Supabase.
- **New Endpoints**:
  - `GET /api/auth/oauth/:provider`: Initiates OAuth flow by redirecting to Supabase.
  - `GET /api/auth/callback`: Handles OAuth callbacks, syncs user data, and issues application JWTs.
- **Service Layer**:
  - `getOAuthUrl(provider)`: Generates auth URL with `skipBrowserRedirect` to keep control on backend.
  - `exchangeCodeForSession(code)`: Swaps authorization code for Supabase session.
  - `loginWithSupabase(accessToken)`: Syncs Supabase user to local `users` table and issues app tokens.

### Changed

#### Authentication Flow
- Refactored `auth-service.ts` to handle OAuth tokens directly.
- Updated CSP in `security-middleware.ts` to allow specific CDN and supabase connections (maintained for potential future use).

### Fixed

#### Testing
- Fixed TypeScript errors in `auth-routes.ts` related to request parameter typing.
- Refactored `auth-service.oauth.test.ts` to use `jest.unstable_mockModule` for robust Native ESM mocking.
- Achieved 100% pass rate on new OAuth unit tests.

---

## [2.3.1] - 2025-12-26

### Fixed

#### Test Infrastructure (100% Pass Rate)
- Fixed repository mock type mismatches in all test files
- Converted mocks from domain models (camelCase) to entity types (snake_case)
- Fixed function signatures: `updateProposal`, `updateDispute` now use 2 arguments
- Added missing `getUserById` mock to user-repository
- Added `user-repository` and `agreement-contract` mocks to dispute-service tests

#### Integration Tests
- All 4 critical flow tests now pass:
  - Flow 1: Registration → Profile → Project → Proposal → Contract
  - Flow 2: Milestone Completion → Approval → Payment
  - Flow 3: Dispute Creation → Evidence → Resolution

#### Files Modified
- `src/__tests__/integration.test.ts` - Entity type conversions for all repository mocks
- `src/services/__tests__/dispute-service.test.ts` - Added missing mocks
- `src/services/__tests__/skill-service.test.ts` - Entity type fixes
- `src/services/__tests__/search-service.test.ts` - Entity type fixes
- `src/services/__tests__/reputation-service.test.ts` - Entity type fixes
- `src/services/__tests__/proposal-service.test.ts` - Added missing mocks

### Test Results
- **Before**: 127/156 tests passing (81.4%)
- **After**: 175/175 tests passing (100%)
- **Suites**: 18/18 passing

---

## [2.3.0] - 2025-12-26

### Security Enhancements

#### Security Headers (Helmet.js)
- Added Helmet.js middleware for comprehensive HTTP security headers
- Content Security Policy (CSP) configuration
- X-Frame-Options for clickjacking prevention
- X-Content-Type-Options for MIME sniffing prevention
- HSTS (HTTP Strict Transport Security) enabled
- Referrer-Policy configured

#### CORS Improvements
- Replaced wildcard `*` origin with explicit origin validation
- Added `CORS_ORIGIN` environment variable for configuration
- Development mode allows localhost by default
- Production mode strictly enforces allowed origins

#### JWT Token Security
- Added separate `JWT_REFRESH_SECRET` for refresh tokens
- Access and refresh tokens now use different signing secrets
- `validateToken()` function accepts token type parameter

#### Password Strength Validation
- Minimum 8 characters required
- At least one uppercase letter required
- At least one lowercase letter required
- At least one number required
- At least one special character (`@$!%*?&`) required
- Exported `validatePasswordStrength()` function

#### Rate Limiting Enhancements
- Added rate limiting to `/api/auth/refresh` endpoint
- 10 requests per 15 minutes

#### Request Tracing
- Added request ID middleware
- Auto-generates UUID if `X-Request-ID` header not provided
- Improves request tracing and debugging

#### HTTPS Enforcement
- Added HTTPS redirect middleware for production
- Supports `X-Forwarded-Proto` header for reverse proxies

### Added
- `src/middleware/security-middleware.ts` - New security middleware module
- `helmet` npm package dependency

### Changed
- `src/app.ts` - Integrated security middleware stack
- `src/config/env.ts` - Added `JWT_REFRESH_SECRET` configuration
- `src/services/auth-service.ts` - Password validation, separate token secrets
- `src/routes/auth-routes.ts` - Password strength validation, refresh rate limiting
- `.env.example` - Added `JWT_REFRESH_SECRET` and `CORS_ORIGIN` examples

---

## [2.2.1] - 2025-12-25

### Security Fixes
- JWT secret now required in production (no default value allowed)
- Added rate limiting middleware for auth endpoints (10 attempts per 15 minutes)
- Fixed project proposals endpoint - now verifies employer owns the project
- Added defense-in-depth for dispute resolution - service layer also verifies admin role
- Created reusable rate limiter middleware with presets for auth, API, and sensitive operations

### Added
- `src/middleware/rate-limiter.ts` - Rate limiting middleware with configurable windows

---

## [2.2.0] - 2025-12-25

### Added

#### Reviews System
- `reviews` table for storing ratings and feedback
- `src/repositories/review-repository.ts` - Review data access
- `src/services/review-service.ts` - Review business logic
- Submit reviews after contract completion
- Average rating calculation per user
- Duplicate review prevention (one review per contract per user)
- Automatic notification on new review

#### Messaging System
- `messages` table for contract-based communication
- `src/repositories/message-repository.ts` - Message data access
- `src/services/message-service.ts` - Messaging business logic
- Send messages within contract context
- Unread message count tracking
- Mark messages as read
- Conversation summary with latest message

#### Payment Transaction History
- `payments` table for transaction audit trail
- `src/repositories/payment-repository.ts` - Payment data access
- `src/services/transaction-service.ts` - Transaction recording
- Record escrow deposits, milestone releases, refunds, dispute resolutions
- Track payment status (pending, processing, completed, failed, refunded)
- Transaction hash storage for blockchain payments
- User earnings and spending summaries

---

## [2.1.0] - 2025-12-25

### Added

#### Blockchain KYC Verification
- `contracts/KYCVerification.sol` - Smart contract for on-chain KYC status
- `src/services/kyc-contract.ts` - Blockchain KYC service interface
- Hybrid KYC system: sensitive data in Supabase, verification status on blockchain
- On-chain verification proof with data hash (privacy-compliant)
- Automatic blockchain submission on KYC approval/rejection
- Wallet verification status checking
- KYC integrity verification (off-chain vs on-chain)

#### Contract Agreements on Blockchain
- `contracts/ContractAgreement.sol` - Smart contract for agreement signatures
- `src/services/agreement-contract.ts` - Agreement blockchain service
- Immutable proof that both parties agreed to terms
- Terms hash stored on-chain (not actual terms)
- Dual signature tracking (employer + freelancer)
- Agreement status lifecycle (pending → signed → completed)

#### Milestone Registry on Blockchain
- `contracts/MilestoneRegistry.sol` - Smart contract for work history
- `src/services/milestone-registry.ts` - Milestone registry service
- Verifiable work completion records
- Freelancer portfolio/stats on-chain
- Work deliverables hash for proof
- Completed milestones count and earnings tracking

#### Dispute Resolution on Blockchain
- `contracts/DisputeResolution.sol` - Smart contract for dispute outcomes
- `src/services/dispute-registry.ts` - Dispute registry service
- Transparent arbitration records
- Evidence hash storage
- Win/loss statistics per user
- Immutable resolution reasoning

#### Blockchain Integration in Services
- `proposal-service.ts` - Auto-creates blockchain agreement when proposal accepted
- `payment-service.ts` - Records milestone submissions and approvals on blockchain
- `dispute-service.ts` - Records disputes and resolutions on blockchain
- Seamless integration - blockchain operations are secondary (won't block main flow)
- All blockchain operations wrapped in try-catch for resilience

#### AI Assistant Features
- `src/services/ai-assistant.ts` - New AI-powered assistant service
- **Proposal Writer** - Generates personalized cover letters for freelancers
  - Analyzes project requirements and freelancer skills
  - Suggests appropriate rate and duration
  - Highlights key selling points
  - Supports different tones (professional, friendly, confident)
- **Project Description Generator** - Helps employers write better project posts
  - Creates clear, detailed descriptions
  - Suggests milestone breakdown with percentages
  - Provides tips for attracting better proposals
- **Dispute Analysis** - AI-assisted dispute resolution
  - Summarizes dispute objectively
  - Lists points supporting each party
  - Suggests fair resolution with confidence score
  - Provides detailed reasoning

#### KYC Blockchain Features
- Submit KYC verification hash to blockchain
- Approve/reject KYC with on-chain record
- Check wallet verification status
- Verify KYC data integrity
- Time-based verification expiry (1 year)
- Tier-based verification levels (basic, standard, enhanced)

---

## [2.0.0] - 2025-12-25

### Changed

#### Database Migration
- Migrated from Azure Cosmos DB to Supabase (PostgreSQL)
- Updated all repositories to use Supabase client
- Converted document-based schema to relational tables
- Added entity mapper utilities for type conversion

#### Configuration
- Replaced Cosmos DB environment variables with Supabase
- Updated database configuration module
- Simplified connection handling

### Added
- `supabase/schema.sql` - Complete PostgreSQL schema
- `src/config/supabase.ts` - Supabase client configuration
- `src/utils/entity-mapper.ts` - Entity type conversion utilities
- Row Level Security (RLS) policies for all tables

### Removed
- Azure Cosmos DB dependency (`@azure/cosmos`)
- Azure deployment configuration files
- Azure-specific documentation

---

## [1.0.0] - 2025-12-07

### Added

#### Core Platform
- User authentication with JWT (access + refresh tokens)
- Role-based access control (freelancer, employer, admin)
- Freelancer profile management with skills and experience
- Employer profile management with company details

#### Project Management
- Project creation with milestones and budgets
- Project status workflow (draft → open → in_progress → completed)
- Skill-based project requirements
- Deadline and budget tracking

#### Proposal System
- Proposal submission by freelancers
- Proposal acceptance/rejection by employers
- Automatic contract creation on acceptance
- Proposal withdrawal capability

#### Contract & Payment
- Contract management with milestone tracking
- Blockchain escrow for secure payments
- Milestone submission and approval workflow
- Automatic payment release on approval

#### Blockchain Integration
- FreelanceEscrow smart contract for milestone payments
- FreelanceReputation smart contract for immutable ratings
- Web3 client for Ethereum interactions
- Support for Sepolia testnet and local Ganache

#### AI Features
- AI-powered project recommendations for freelancers
- AI-powered freelancer recommendations for employers
- Skill extraction from text descriptions
- Skill gap analysis between freelancer and project
- Keyword-based fallback when AI unavailable

#### Reputation System
- On-chain rating storage (1-5 stars)
- Review comments with ratings
- Aggregate score calculation
- Work history tracking
- Duplicate rating prevention

#### Dispute Resolution
- Dispute creation for milestone conflicts
- Evidence submission system
- Arbiter-based resolution
- Automatic fund distribution on resolution

#### Notifications
- Real-time notification system
- Multiple notification types (proposal, milestone, payment, dispute, rating)
- Read/unread status tracking
- Bulk mark as read

#### Search & Discovery
- Project search with filters (skills, budget, status)
- Freelancer search with filters (skills, rate, availability)
- Pagination support

#### Documentation
- Swagger/OpenAPI documentation at /api-docs
- Interactive API explorer
- Request/response schemas

### Technical Details

#### Backend Stack
- Node.js with Express.js
- TypeScript for type safety
- Supabase (PostgreSQL) for data storage
- JWT for authentication

#### Blockchain Stack
- Solidity 0.8.19 smart contracts
- Hardhat development environment
- Ethers.js for Web3 interactions
- Reentrancy protection on payment functions

#### AI Stack
- LLM API integration for skill matching
- Keyword-based fallback matching
- Configurable matching algorithms

### Security
- Password hashing with bcrypt
- JWT token expiration
- Input validation middleware
- CORS configuration
- Smart contract access modifiers
- Reentrancy guards

---

## [Unreleased]

### In Progress
- Didit KYC integration (replacing custom KYC implementation)

---

## [2.6.0] - 2026-01-14

### Added

#### Didit KYC Integration
- **Complete KYC Replacement**: Replaced custom KYC implementation with Didit API integration
- **ID Verification**: Document verification for 220+ countries and territories
- **Passive Liveness Detection**: Anti-spoofing technology with no user interaction required
- **Face Match 1:1**: Selfie to document photo comparison with similarity scoring
- **IP Analysis**: Geolocation verification, VPN/proxy detection, and risk assessment
- **New Models**: `src/models/didit-kyc.ts` - Complete type definitions for Didit API
- **API Client**: `src/services/didit-client.ts` - Didit API communication layer
- **Service Layer**: `src/services/didit-kyc-service.ts` - Business logic for KYC verification
- **Repository**: `src/repositories/didit-kyc-repository.ts` - Database operations
- **Routes**: `src/routes/didit-kyc-routes.ts` - RESTful API endpoints
- **Webhook Support**: Secure webhook endpoint with HMAC signature verification
- **Database Migration**: `supabase/migrations/003_didit_kyc_verifications.sql` - New schema
- **Documentation**: `docs/DIDIT-KYC-INTEGRATION.md` - Complete integration guide

#### KYC Features
- Session-based verification workflow
- Real-time status updates via webhooks
- Admin review and approval system
- Verification history tracking
- Automatic expiry (1 year from approval)
- Risk scoring and threat level assessment
- Metadata support for custom tracking

### Changed
- **Routes**: Updated `src/routes/index.ts` to use new Didit KYC routes
- **Environment**: Added Didit configuration variables to `.env.example`
- **README**: Updated with Didit KYC features and documentation links

### Deprecated
- **Smart Contract**: `contracts/KYCVerification.sol` moved to `.old.sol` (deprecated)
- **Old KYC Service**: `src/services/kyc-service.ts` (replaced by Didit integration)
- **Old KYC Routes**: `src/routes/kyc-routes.ts` (replaced by Didit routes)
- **Old KYC Models**: `src/models/kyc.ts` (replaced by Didit models)

### Security
- Webhook signature verification using HMAC-SHA256
- Secure API key management via environment variables
- Row Level Security (RLS) policies on KYC table
- Personal data stored encrypted in Supabase
- Document images handled by Didit (not stored locally)

### Migration Notes
- Existing KYC data will be cleared (users must re-verify)
- New database schema required (run migration)
- Didit account and API credentials required
- Webhook URL must be configured in Didit dashboard

---

## [Unreleased]

### Planned Features
- Email notifications
- File upload for portfolio/evidence
- Advanced analytics dashboard
- Multi-currency support
- Mobile API optimizations
- WebSocket real-time updates
- Two-factor authentication
- Rate limiting middleware
- API versioning

### Known Issues
- AI matching requires valid LLM API key
- Large file uploads not yet supported
- No email verification on registration

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 2.4.0 | 2025-12-26 | Backend-Only OAuth Implementation (Google, GitHub, etc.) |
| 2.3.1 | 2025-12-26 | Test infrastructure fixes - 100% pass rate |
| 2.3.0 | 2025-12-26 | Security audit: Helmet.js, CORS, JWT, password validation |
| 2.2.1 | 2025-12-25 | Security fixes and rate limiting |
| 2.2.0 | 2025-12-25 | Added reviews, messages, and payments tables |
| 2.1.0 | 2025-12-25 | Blockchain integration and AI features |
| 2.0.0 | 2025-12-25 | Migrated to Supabase |
| 1.0.0 | 2025-12-07 | Initial release with full feature set |
