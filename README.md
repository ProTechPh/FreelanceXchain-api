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

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/ProTechPh/FreelanceXchain-api?utm_source=oss&utm_medium=github&utm_campaign=ProTechPh%2FFreelanceXchain-api&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

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

### KYC Verification (Didit Integration)
- **ID Verification** - Document verification for 220+ countries
- **Passive Liveness Detection** - Anti-spoofing and fraud prevention
- **Face Match 1:1** - Selfie to document photo matching
- **IP Analysis** - Location verification and risk assessment

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

## 📚 Documentation Hub

### Quick Access Guides
- **[Quick Start Guide](QUICKSTART.md)** - Get up and running in 10 minutes ⚡
- **[Project Structure](PROJECT_STRUCTURE.md)** - Complete project organization overview
- **[Configuration Guide](CONFIGURATION.md)** - All configuration files explained
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute to the project

### Complete Documentation
- **[Full Documentation Index](docs/README.md)** - Browse all documentation by category

---

## Installation

### Prerequisites
- Node.js 20+
- pnpm 8+ (fast, disk space efficient package manager)
- Supabase account (https://supabase.com)
- Ethereum wallet (for blockchain features)
- LLM API key (for AI features)
- Docker (optional, for containerized deployment)

### Quick Setup

**See [Quick Start Guide](QUICKSTART.md) for detailed 10-minute setup.**

### Local Development Setup

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd FreelanceXchain-api
pnpm install --frozen-lockfile
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
pnpm run compile
```

5. **Build TypeScript**
```bash
pnpm run build
```

6. **Start the server**
```bash
pnpm start
# Or for development with hot reload:
pnpm run dev
# Or for production mode:
pnpm run prod
```

### Docker Deployment

1. **Build Docker image**
```bash
docker build -t freelancexchain-api:latest .
```

2. **Run locally with Docker**
```bash
docker run -p 7860:7860 --env-file .env freelancexchain-api:latest
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 7860) |
| `NODE_ENV` | Environment (development/production/test) |
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
| `DIDIT_API_KEY` | Didit KYC API key |
| `DIDIT_API_URL` | Didit API base URL (default: https://verification.didit.me) |
| `DIDIT_WEBHOOK_SECRET` | Didit webhook signature secret |
| `DIDIT_WORKFLOW_ID` | Didit workflow ID for KYC verification |

## API Documentation

Interactive API documentation available at:
```
http://localhost:7860/api-docs
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
pnpm run deploy:ganache
```

**Testnet (Sepolia):**
```bash
pnpm run deploy:reputation
pnpm run deploy:escrow
```

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm run test:watch
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start dev server with hot reload |
| `pnpm run build` | Compile TypeScript |
| `pnpm start` | Start production server |
| `pnpm test` | Run tests |
| `pnpm run compile` | Compile Solidity contracts |
| `pnpm run deploy:ganache` | Deploy to local Ganache |
| `pnpm run deploy:reputation` | Deploy reputation contract to Sepolia |
| `pnpm run deploy:escrow` | Deploy escrow contract to Sepolia |

## Documentation

### 📚 Complete Documentation Index
**[View Full Documentation →](docs/README.md)**

### Quick Links by Category

#### 🚀 Getting Started
- [Project Overview](docs/getting-started/overview.md) - Platform overview and goals
- [Developer Setup Guide](docs/getting-started/setup.md) - Complete setup instructions
- [Technology Stack](docs/getting-started/tech-stack.md) - Technologies used

#### 🏗️ Architecture & API
- [API Endpoints Reference](docs/architecture/api-overview.md) - Complete API documentation
- [Business Logic Layer](docs/architecture/services-overview.md) - Service layer architecture
- [Database Schema Design](docs/architecture/database-overview.md) - Database structure
- [Data Models & ORM](docs/architecture/models-overview.md) - Entity models

#### 🔐 Security
- [Security Implementation](docs/security/overview.md) - Security architecture
- [MFA Implementation](docs/security/MFA_IMPLEMENTATION.md) - Multi-factor authentication
- [OWASP Validation Report](docs/security/OWASP_TOP_10_VALIDATION_REPORT.md) - Security compliance

#### ⛓️ Blockchain
- [Blockchain Integration](docs/blockchain/integration.md) - Smart contract setup
- [Blockchain Testing](docs/blockchain/testing.md) - Testing guide
- [Smart Contracts Documentation](contracts/README.md) - Contract details

#### ✨ Features
- [Audit Logs](docs/features/audit-logs/) - Audit logging system
- [Proposal File Uploads](docs/features/proposal-uploads/) - File upload feature

#### 📖 Guides & Operations
- [Deployment Configuration](docs/guides/deployment.md) - Deployment guide
- [Testing Strategy](docs/guides/testing.md) - Testing approach
- [Troubleshooting](docs/guides/TROUBLESHOOTING.md) - Common issues and solutions
- [Maintenance](docs/guides/MAINTENANCE.md) - System maintenance

#### 🔧 Additional Resources
- [Scripts Documentation](scripts/README.md) - Utility scripts guide
- [Database Documentation](supabase/README.md) - Database schema and migrations
- [Email Templates](email-templates/README.md) - Email template setup
- [Project Structure](PROJECT_STRUCTURE.md) - Complete project organization
- [Changelog](CHANGELOG.md) - Version history

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:
- Code of conduct
- Development workflow
- Coding standards
- Commit guidelines
- Pull request process

## 📖 Additional Resources

- **[Configuration Guide](CONFIGURATION.md)** - Detailed configuration documentation
- **[Quick Start](QUICKSTART.md)** - Fast setup guide
- **[Project Structure](PROJECT_STRUCTURE.md)** - Complete project overview
- **[Changelog](CHANGELOG.md)** - Version history and changes

## 🆘 Support & Help

- **Issues:** Report bugs or request features via GitHub Issues
- **Documentation:** Check [docs/](docs/) for comprehensive guides
- **Troubleshooting:** See [Troubleshooting Guide](docs/guides/TROUBLESHOOTING.md)

## 📊 Project Status

- ✅ Core API functionality
- ✅ Blockchain integration
- ✅ AI-powered matching
- ✅ KYC verification
- ✅ Comprehensive testing
- ✅ Complete documentation

## License

ISC
