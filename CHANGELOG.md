# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Pagination with continuation tokens

#### Documentation
- Swagger/OpenAPI documentation at /api-docs
- Interactive API explorer
- Request/response schemas

### Technical Details

#### Backend Stack
- Node.js with Express.js
- TypeScript for type safety
- Azure Cosmos DB for data storage
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

## [1.1.0] - 2025-12-07

### Added

#### Docker Deployment
- Multi-stage Dockerfile for optimized production builds
- Docker image published to Docker Hub (`jericko134/freelancexchain-api`)
- `.dockerignore` for efficient image builds

#### Azure Container Apps Deployment
- Deployed to Azure Container Apps in Japan West region
- Production URL: `https://freelancexchain-api.orangebeach-df8d1409.japanwest.azurecontainerapps.io`
- Environment variables configured for production
- Auto-scaling with consumption-based pricing

### Changed
- Updated Swagger configuration to support production server URL
- Modified tsconfig to preserve JSDoc comments for Swagger in production
- Swagger now dynamically switches between development and production servers

### Technical Notes

#### Deployment Challenges Encountered
1. **Azure App Service Issues**: Initial deployment to Azure App Service faced multiple challenges:
   - TypeScript compilation issues during remote build
   - `tsc` not found errors due to dev dependencies being omitted
   - WSL/bash not available on Windows for build hooks
   
2. **Solution**: Switched to Docker-based deployment:
   - Multi-stage build compiles TypeScript in builder stage
   - Production stage only includes compiled JS and production dependencies
   - Deployed to Azure Container Apps instead of App Service

3. **Region Limitations**: 
   - Malaysia West doesn't support Azure Container Apps
   - Deployed to Japan West as nearest supported region

#### Docker Build Process
```dockerfile
# Builder stage - compiles TypeScript
FROM node:20-alpine AS builder
# ... installs all deps, runs tsc

# Production stage - minimal image
FROM node:20-alpine AS production
# ... only production deps + compiled dist
```

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
| 1.1.0 | 2025-12-07 | Docker deployment, Azure Container Apps |
| 1.0.0 | 2025-12-07 | Initial release with full feature set |
