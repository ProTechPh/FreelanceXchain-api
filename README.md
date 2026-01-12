---
title: FreelanceXchain API
emoji: 🔗
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 3000
pinned: false
---

# Blockchain-Based Freelance Marketplace with AI Skill Matching

A decentralized freelance marketplace that leverages AI for intelligent skill matching and blockchain for secure, transparent transactions.

## Overview

This platform addresses key challenges in the gig economy:
- **Fair Payments**: Blockchain smart contracts guarantee secure, automated milestone-based payments
- **Transparent Reputation**: Immutable on-chain work histories prevent fraud and build trust
- **Intelligent Matching**: AI-powered skill matching connects freelancers with suitable projects
- **Reduced Exploitation**: Decentralized architecture eliminates high platform fees

### SDG Alignment
- **SDG 8** – Decent Work and Economic Growth
- **SDG 9** – Industry, Innovation, and Infrastructure
- **SDG 16** – Peace, Justice, and Strong Institutions

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, Express, TypeScript |
| Database | Supabase (PostgreSQL) |
| Blockchain | Ethereum (Solidity), Hardhat, Ethers.js |
| AI/ML | LLM API |
| Documentation | Swagger/OpenAPI |

## Features

### Core Modules
- **Authentication** - JWT-based auth with role-based access (freelancer/employer/admin)
- **Profile Management** - Freelancer and employer profiles with skills, experience, portfolio
- **Project Management** - Create projects with milestones, budgets, deadlines
- **Proposal System** - Submit, accept, reject proposals with notifications
- **Contract Management** - Automated contract creation upon proposal acceptance

### Blockchain Features
- **Escrow Smart Contract** - Milestone-based fund holding with dispute resolution
- **Reputation Contract** - Immutable on-chain ratings and reviews
- **Payment Processing** - Automated ETH transfers upon milestone approval

### AI Features
- **Skill Matching** - AI-powered project-freelancer recommendations
- **Skill Extraction** - Automatic skill detection from text descriptions
- **Gap Analysis** - Identify skill gaps between freelancer and project requirements

## Project Structure

```
├── contracts/                 # Solidity smart contracts
│   ├── FreelanceEscrow.sol   # Escrow for milestone payments
│   └── FreelanceReputation.sol # On-chain reputation system
├── scripts/                   # Deployment scripts
├── src/
│   ├── config/               # Configuration (env, database, swagger)
│   ├── middleware/           # Express middleware
│   ├── models/               # Data models/types
│   ├── repositories/         # Data access layer
│   ├── routes/               # API route handlers
│   ├── services/             # Business logic
│   └── utils/                # Utility functions
├── supabase/                 # Supabase schema and migrations
├── artifacts/                # Compiled contracts
└── dist/                     # Compiled TypeScript
```

## Installation

### Prerequisites
- Node.js 18+ (20 recommended)
- npm or yarn
- Supabase account (https://supabase.com)
- Ethereum wallet (for blockchain features)
- LLM API key (for AI features)
- Docker (optional, for containerized deployment)

### Local Development Setup

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd blockchain-freelance-marketplace
npm install
```

2. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Set up Supabase database**
- Create a new project at https://supabase.com
- Run the SQL schema from `supabase/schema.sql` in the SQL Editor
- Copy your project URL and anon key to `.env`

4. **Compile smart contracts**
```bash
npm run compile
```

5. **Build TypeScript**
```bash
npm run build
```

6. **Start the server**
```bash
npm start
# Or for development with hot reload:
npm run dev
```

### Docker Deployment

1. **Build Docker image**
```bash
docker build -t freelancexchain-api:latest .
```

2. **Run locally with Docker**
```bash
docker run -p 3000:3000 --env-file .env freelancexchain-api:latest
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Environment (development/production) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (optional) |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) |
| `JWT_EXPIRES_IN` | Access token expiry (e.g., 1h) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry (e.g., 7d) |
| `LLM_API_KEY` | LLM API key for AI features |
| `LLM_API_URL` | LLM API base URL |
| `BLOCKCHAIN_RPC_URL` | Ethereum RPC endpoint |
| `BLOCKCHAIN_PRIVATE_KEY` | Deployer wallet private key |

## API Documentation

Interactive API documentation available at:
```
http://localhost:3000/api-docs
```

### API Endpoints Overview

| Module | Base Path | Description |
|--------|-----------|-------------|
| Health | `/api/health` | Health check |
| Auth | `/api/auth` | Registration, login, token refresh |
| Skills | `/api/skills` | Skill taxonomy management |
| Freelancers | `/api/freelancers` | Freelancer profiles |
| Employers | `/api/employers` | Employer profiles |
| Projects | `/api/projects` | Project CRUD, milestones |
| Search | `/api/search` | Search projects/freelancers |
| Matching | `/api/matching` | AI-powered recommendations |
| Proposals | `/api/proposals` | Proposal management |
| Contracts | `/api/contracts` | Contract management |
| Payments | `/api/payments` | Milestone payments, escrow |
| Reputation | `/api/reputation` | Ratings and reviews |
| Disputes | `/api/disputes` | Dispute resolution |
| Notifications | `/api/notifications` | User notifications |

## Smart Contracts

### FreelanceEscrow.sol
Handles milestone-based payments with:
- Fund deposit by employer
- Milestone submission by freelancer
- Approval and automatic payment release
- Dispute mechanism with arbiter resolution
- Reentrancy protection

### FreelanceReputation.sol
Immutable reputation system:
- Submit ratings (1-5 stars) with comments
- Prevent duplicate ratings per contract
- Aggregate score calculation
- Query ratings by user or contract

### Deployment

**Local (Ganache):**
```bash
npm run deploy:ganache
```

**Testnet (Sepolia):**
```bash
npm run deploy:reputation
npm run deploy:escrow
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Start production server |
| `npm test` | Run tests |
| `npm run compile` | Compile Solidity contracts |
| `npm run deploy:ganache` | Deploy to local Ganache |
| `npm run deploy:reputation` | Deploy reputation contract to Sepolia |
| `npm run deploy:escrow` | Deploy escrow contract to Sepolia |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System architecture diagrams |
| [API Documentation](docs/API-DOCUMENTATION.md) | Complete API endpoint reference |
| [User Manual](docs/USER-MANUAL.md) | Guide for freelancers and employers |
| [Admin Manual](docs/ADMIN-MANUAL.md) | System administration guide |
| [Technical Specs](docs/TECHNICAL-SPECS.md) | Technical specifications |
| [Testing](docs/TESTING.md) | Test cases and results |
| [Changelog](CHANGELOG.md) | Version history |

## License

ISC
