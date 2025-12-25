# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
| 2.2.1 | 2025-12-25 | Security fixes and rate limiting |
| 2.2.0 | 2025-12-25 | Added reviews, messages, and payments tables |
| 2.1.0 | 2025-12-25 | Blockchain integration and AI features |
| 2.0.0 | 2025-12-25 | Migrated to Supabase |
| 1.0.0 | 2025-12-07 | Initial release with full feature set |
