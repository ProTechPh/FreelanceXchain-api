# Technical Specifications

## System Overview

The Blockchain-Based Freelance Marketplace is a decentralized platform combining traditional web technologies with blockchain and AI capabilities.

---

## Technology Stack

### Backend

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 18.x+ |
| Framework | Express.js | 4.21.x |
| Language | TypeScript | 5.6.x |
| API Documentation | Swagger/OpenAPI | 3.0 |

### Database

| Component | Technology | Purpose |
|-----------|------------|---------|
| Primary Database | Supabase (PostgreSQL) | Relational storage, real-time subscriptions |
| ORM/Client | @supabase/supabase-js | Database operations |

### Blockchain

| Component | Technology | Version |
|-----------|------------|---------|
| Smart Contracts | Solidity | 0.8.19 |
| Development Framework | Hardhat | 2.22.x |
| Web3 Library | Ethers.js | 6.16.x |
| Networks | Ethereum (Mainnet, Sepolia, Local) | - |

### AI/ML

| Component | Technology | Purpose |
|-----------|------------|---------|
| LLM Provider | LLM API | Skill matching, content analysis |
| Fallback | Keyword Matching | When LLM unavailable |

### Authentication

| Component | Technology | Details |
|-----------|------------|---------|
| Token Type | JWT | Access + Refresh tokens |
| Password Hashing | bcrypt | Salt rounds: 10 |
| Token Expiry | Configurable | Default: 1h access, 7d refresh |

---

## API Specifications

### Base Configuration

```
Base URL: /api
Content-Type: application/json
Authentication: Bearer Token (JWT)
OAuth: GET /api/auth/oauth/:provider | GET /api/auth/callback
```

### Rate Limits (Recommended)

| Endpoint Type | Limit |
|---------------|-------|
| Authentication | 10 req/min |
| Read Operations | 100 req/min |
| Write Operations | 30 req/min |
| AI Matching | 10 req/min |

### Response Format

**Success Response:**
```json
{
  "data": { ... },
  "meta": {
    "totalCount": 100,
    "pageSize": 20,
    "hasMore": true,
    "continuationToken": "..."
  }
}
```

**Error Response:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Description",
    "details": [...]
  },
  "timestamp": "ISO8601",
  "requestId": "UUID"
}
```

---

## Data Models

### User

```typescript
type User = {
  id: string;              // UUID
  email: string;           // Unique
  passwordHash: string;    // bcrypt hash
  role: 'freelancer' | 'employer' | 'admin';
  walletAddress?: string;  // Ethereum address
  createdAt: string;       // ISO8601
  updatedAt: string;       // ISO8601
};
```

### FreelancerProfile

```typescript
type FreelancerProfile = {
  id: string;
  userId: string;
  bio: string;
  hourlyRate: number;
  availability: 'available' | 'busy' | 'unavailable';
  skills: SkillReference[];
  experience: WorkExperience[];
  createdAt: string;
  updatedAt: string;
};

type SkillReference = {
  skillId: string;
  skillName: string;
  categoryId: string;
  yearsOfExperience: number;
};

type WorkExperience = {
  id: string;
  title: string;
  company: string;
  description: string;
  startDate: string;
  endDate?: string;
};
```

### Project

```typescript
type Project = {
  id: string;
  employerId: string;
  title: string;
  description: string;
  requiredSkills: SkillReference[];
  budget: number;
  deadline: string;
  status: ProjectStatus;
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
};

type ProjectStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';

type Milestone = {
  id: string;
  title: string;
  description: string;
  amount: number;
  dueDate: string;
  status: MilestoneStatus;
};

type MilestoneStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'disputed';
```

### Proposal

```typescript
type Proposal = {
  id: string;
  projectId: string;
  freelancerId: string;
  coverLetter: string;
  proposedRate: number;
  estimatedDuration: number;  // days
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
};

type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
```

### Contract

```typescript
type Contract = {
  id: string;
  projectId: string;
  proposalId: string;
  freelancerId: string;
  employerId: string;
  escrowAddress?: string;     // Smart contract address
  totalAmount: number;
  status: ContractStatus;
  createdAt: string;
  updatedAt: string;
};

type ContractStatus = 'active' | 'completed' | 'disputed' | 'cancelled';
```

### Dispute

```typescript
type Dispute = {
  id: string;
  contractId: string;
  milestoneIndex: number;
  initiatorId: string;
  reason: string;
  description: string;
  evidence: Evidence[];
  status: DisputeStatus;
  resolution?: DisputeResolution;
  createdAt: string;
  updatedAt: string;
};

type Evidence = {
  id: string;
  submittedBy: string;
  description: string;
  attachmentUrl?: string;
  submittedAt: string;
};

type DisputeStatus = 'open' | 'under_review' | 'resolved';

type DisputeResolution = {
  resolvedBy: string;
  decision: 'in_favor_of_freelancer' | 'in_favor_of_employer';
  notes: string;
  resolvedAt: string;
};
```

### Notification

```typescript
type Notification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
};

type NotificationType =
  | 'proposal_received'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'milestone_submitted'
  | 'milestone_approved'
  | 'payment_released'
  | 'dispute_created'
  | 'dispute_resolved'
  | 'rating_received';
```

---

## Smart Contract Specifications

### FreelanceEscrow

**Purpose:** Hold and release milestone payments securely.

**State Variables:**
- `employer`: address - Project owner
- `freelancer`: address - Hired freelancer
- `arbiter`: address - Dispute resolver
- `milestones`: Milestone[] - Payment milestones
- `totalAmount`: uint256 - Total contract value
- `releasedAmount`: uint256 - Amount paid out
- `isActive`: bool - Contract status

**Key Functions:**
| Function | Access | Description |
|----------|--------|-------------|
| `submitMilestone(index)` | Freelancer | Mark milestone as complete |
| `approveMilestone(index)` | Employer | Approve and release payment |
| `disputeMilestone(index)` | Either party | Raise dispute |
| `resolveDispute(index, decision)` | Arbiter | Resolve dispute |
| `refundMilestone(index)` | Employer | Refund pending milestone |
| `cancelContract()` | Employer | Cancel and refund remaining |

**Events:**
- `FundsDeposited(address, uint256)`
- `MilestoneSubmitted(uint256)`
- `MilestoneApproved(uint256, uint256)`
- `MilestoneDisputed(uint256)`
- `MilestoneRefunded(uint256, uint256)`
- `DisputeResolved(uint256, bool)`
- `ContractCompleted()`
- `ContractCancelled()`

### FreelanceReputation

**Purpose:** Store immutable ratings on-chain.

**State Variables:**
- `ratings`: Rating[] - All ratings
- `userRatings`: mapping(address => uint256[]) - Ratings received
- `givenRatings`: mapping(address => uint256[]) - Ratings given
- `totalScore`: mapping(address => uint256) - Aggregate scores
- `ratingCount`: mapping(address => uint256) - Rating counts

**Key Functions:**
| Function | Access | Description |
|----------|--------|-------------|
| `submitRating(ratee, score, comment, contractId, isEmployer)` | Any | Submit rating |
| `getAverageRating(user)` | View | Get user's average (x100) |
| `getRatingCount(user)` | View | Get total ratings |
| `getRating(index)` | View | Get rating details |
| `hasRated(rater, ratee, contractId)` | View | Check if rated |

---

## Security Specifications

### HTTP Security Headers (Helmet.js)

| Header | Value | Purpose |
|--------|-------|--------|
| Content-Security-Policy | Restrictive policy | Prevent XSS attacks |
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| Strict-Transport-Security | max-age=31536000 | Force HTTPS |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer info |
| X-Powered-By | (removed) | Hide server technology |

### CORS Configuration

| Setting | Development | Production |
|---------|-------------|------------|
| Allowed Origins | localhost:3000,3001 | Via `CORS_ORIGIN` env var |
| Methods | GET, POST, PUT, PATCH, DELETE, OPTIONS | Same |
| Headers | Content-Type, Authorization, X-Request-ID | Same |
| Credentials | true | true |

### Authentication Flow

```
1. User registers/logs in
2. Server validates credentials
3. Server generates JWT tokens:
   - Access Token: { userId, role, exp: 1h } - signed with JWT_SECRET
   - Refresh Token: { userId, exp: 7d } - signed with JWT_REFRESH_SECRET
4. Client stores tokens securely
5. Client sends Access Token in Authorization header
6. Server validates token on each request
7. Client uses Refresh Token to get new Access Token

### OAuth Flow (Backend-Only, 2-Step)
```
1. Client requests GET /api/auth/oauth/:provider (google, github, etc.)
2. Server validates provider and redirects to Supabase OAuth URL
3. User logs in with provider
4. Supabase redirects to /api/auth/callback with code
5. Server exchanges code for Supabase session
6. Server checks if user exists in local database:
   - IF EXISTS: 
     - Returns HTTP 200 with tokens { user, accessToken, refreshToken }
   - IF NEW USER:
     - Returns HTTP 202 Accepted { status: 'registration_required', accessToken }
     - Client prompts user to select Role (Employer/Freelancer)
     - Client calls POST /api/auth/oauth/register with { accessToken, role }
     - Server creates user and returns tokens
```

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)
- At least one special character (@$!%*?&)
- Hashed with bcrypt (10 salt rounds)
- Never stored in plain text

### Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication (/login, /register, /refresh) | 10 requests | 15 minutes |
| Standard API | 100 requests | 1 minute |
| Sensitive Operations | 5 requests | 1 hour |

### Smart Contract Security
- Reentrancy guards on all payment functions
- Access modifiers (onlyEmployer, onlyFreelancer, onlyArbiter)
- Input validation on all parameters
- State checks before operations

---

## Performance Specifications

### Database
- Supabase PostgreSQL with connection pooling
- Indexes on frequently queried fields
- JSONB columns for flexible data structures

### API
- Response time target: < 200ms (p95)
- Pagination: 20 items default, 100 max
- Request body limit: 10MB

### Blockchain
- Transaction confirmation: ~15 seconds (Ethereum)
- Gas optimization in contracts
- Batch operations where possible

---

## Dependencies

### Production Dependencies

```json
{
  "@supabase/supabase-js": "^2.89.0",
  "bcrypt": "^5.1.1",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.21.0",
  "jsonwebtoken": "^9.0.2",
  "swagger-jsdoc": "^6.2.8",
  "swagger-ui-express": "^5.0.1",
  "uuid": "^10.0.0"
}
```

### Development Dependencies

```json
{
  "@nomicfoundation/hardhat-ethers": "^3.0.8",
  "@nomicfoundation/hardhat-toolbox": "^5.0.0",
  "ethers": "^6.16.0",
  "hardhat": "^2.22.0",
  "jest": "^29.7.0",
  "ts-jest": "^29.2.5",
  "tsx": "^4.19.1",
  "typescript": "^5.6.2"
}
```

---

## Testing Specifications

### Test Framework

| Component | Technology | Purpose |
|-----------|------------|---------|
| Test Runner | Jest | Unit and integration testing |
| TypeScript Support | ts-jest | TypeScript compilation |
| Property Testing | fast-check | Property-based testing |

### Test Coverage

| Suite | Tests | Description |
|-------|-------|-------------|
| auth-service | 6 | Registration, login, JWT tokens |
| proposal-service | 4 | Proposals, acceptance, rejection |
| project-service | 4 | Projects, milestones, budgets |
| payment-service | 11 | Payments, approvals, disputes |
| dispute-service | 4 | Disputes, evidence, resolution |
| integration | 4 | End-to-end critical flows |
| **Total** | **175** | **100% pass rate** |

### Mock Architecture

Tests use in-memory stores with Jest mocks. Key pattern:
- Services expect entity types (snake_case: `project_id`)
- Mocks convert incoming domain models to entity format
- All repository mocks return entity types for consistency

### Running Tests

```bash
npm test              # Run all tests
npm test -- --watch  # Watch mode
npm test -- --coverage  # Coverage report
```

---

## Environment Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| PORT | No | 3000 | Server port |
| NODE_ENV | No | development | Environment |
| SUPABASE_URL | Yes | - | Supabase project URL |
| SUPABASE_ANON_KEY | Yes | - | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | No | - | Supabase service role key |
| JWT_SECRET | Yes | - | JWT signing secret (access tokens) |
| JWT_REFRESH_SECRET | Yes (prod) | JWT_SECRET | Separate secret for refresh tokens |
| JWT_EXPIRES_IN | No | 1h | Access token expiry |
| JWT_REFRESH_EXPIRES_IN | No | 7d | Refresh token expiry |
| CORS_ORIGIN | No | localhost:3000,3001 | Comma-separated allowed origins |
| LLM_API_KEY | No | - | Gemini API key |
| LLM_API_URL | No | - | Gemini API URL |
| BLOCKCHAIN_RPC_URL | No | - | Ethereum RPC |
| BLOCKCHAIN_PRIVATE_KEY | No | - | Deployer key |

---

## Docker Specifications

### Multi-Stage Dockerfile

```dockerfile
# Build stage - compiles TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage - minimal image
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Image Details

| Property | Value |
|----------|-------|
| Base Image | node:20-alpine |
| Image Size | ~150MB (production) |
| Port | 3000 |
| Registry | Docker Hub |
| Image Name | freelancexchain-api |

### Deployment Platform

| Property | Value |
|----------|-------|
| Platform | Docker / Any cloud provider |
| Scaling | Configurable |
| Resources | 0.5 CPU, 1GB RAM (minimum) |
