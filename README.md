<!-- markdownlint-disable-next-line MD041 -->
<div align="center">

# 🔗 FreelanceXchain API

**Blockchain-Based Freelance Marketplace with AI Skill Matching**

[![CodeRabbit Reviews](https://img.shields.io/coderabbit/prs/github/ProTechPh/FreelanceXchain-api?utm_source=oss&utm_medium=github&utm_campaign=ProTechPh%2FFreelanceXchain-api&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)

A decentralized freelance marketplace that combines AI-powered skill matching with blockchain-based secure payments — eliminating high platform fees and building transparent reputations on-chain.

</div>

---

## ✨ Why FreelanceXchain?

| Problem | Our Solution |
| --- | --- |
| High platform fees (up to 20%) | Decentralized architecture with minimal fees |
| Delayed & unfair payments | Smart contract escrow with milestone-based releases |
| Fake reviews & opaque ratings | Immutable on-chain reputation system |
| Mismatched hires | AI-powered skill extraction & project matching |

## 🚀 Tech Stack

| Layer | Technology |
| --- | --- |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | Appwrite |
| **Blockchain** | Ethereum / Polygon (Solidity, Hardhat, Ethers.js) |
| **AI/ML** | LLM-powered skill matching |
| **Auth** | JWT + KYC via Didit (220+ countries) |
| **Docs** | Swagger / OpenAPI |

## 📦 Getting Started

### Prerequisites

- **Node.js** 20+
- **pnpm** 8+
- **Appwrite** account ([appwrite.io](https://appwrite.io))
- **Ethereum wallet** (for blockchain features)
- **LLM API key** (for AI features)

### Quick Setup

```bash
# 1. Clone the repo
git clone https://github.com/ProTechPh/FreelanceXchain-api.git
cd FreelanceXchain-api

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Configure environment
cp .env.example .env
# Edit .env with your credentials (see Environment Variables below)

# 4. Compile smart contracts
pnpm run compile

# 5. Build & run
pnpm run build
pnpm run dev
```

The API will be available at `http://localhost:7860`. Swagger docs at `http://localhost:7860/api-docs`.

### Docker

```bash
docker build -t freelancexchain-api:latest .
docker run -p 7860:7860 --env-file .env freelancexchain-api:latest
```

> 📖 For detailed setup instructions, see the [Developer Setup Guide](docs/deployment/setup.md).

## 🔑 Environment Variables

| Variable | Description |
| --- | --- |
| `PORT` | Server port (default: `7860`) |
| `NODE_ENV` | `development` / `production` / `test` |
| `APPWRITE_ENDPOINT` | Appwrite API endpoint |
| `APPWRITE_PROJECT_ID` | Appwrite project ID |
| `APPWRITE_API_KEY` | Appwrite API key |
| `JWT_SECRET` | JWT signing secret (min 32 chars) |
| `JWT_EXPIRES_IN` | Access token expiry (e.g., `1h`) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry (e.g., `7d`) |
| `LLM_API_KEY` | LLM API key for AI features |
| `LLM_API_URL` | LLM API base URL |
| `BLOCKCHAIN_RPC_URL` | Ethereum/Polygon RPC endpoint |
| `BLOCKCHAIN_PRIVATE_KEY` | Deployer wallet private key |
| `DIDIT_API_KEY` | Didit KYC API key |
| `DIDIT_API_URL` | Didit API base URL |
| `DIDIT_WEBHOOK_SECRET` | Didit webhook signature secret |
| `DIDIT_WORKFLOW_ID` | Didit workflow ID |

## 📡 API Endpoints

All endpoints are prefixed with `/api`. Full interactive docs at `/api-docs`.

| Module | Path | Description |
| --- | --- | --- |
| Health | `/api/health` | Health check |
| Auth | `/api/auth` | Registration, login, token refresh |
| Skills | `/api/skills` | Skill taxonomy management |
| Freelancers | `/api/freelancers` | Freelancer profiles |
| Employers | `/api/employers` | Employer profiles |
| Projects | `/api/projects` | Project CRUD & milestones |
| Search | `/api/search` | Search projects & freelancers |
| Matching | `/api/matching` | AI-powered recommendations |
| Proposals | `/api/proposals` | Proposal management |
| Contracts | `/api/contracts` | Contract management |
| Payments | `/api/payments` | Milestone payments & escrow |
| Reputation | `/api/reputation` | Ratings & reviews |
| Disputes | `/api/disputes` | Dispute resolution |
| Notifications | `/api/notifications` | User notifications |

## ⛓️ Smart Contracts

### FreelanceEscrow.sol

Milestone-based escrow system:

- Employer deposits funds into contract
- Freelancer submits milestones for approval
- Automatic payment release upon approval
- Dispute mechanism with arbiter resolution
- Reentrancy protection

### FreelanceReputation.sol

On-chain reputation system:

- Submit ratings (1–5 stars) with comments
- Duplicate rating prevention per contract
- Aggregate score calculation
- Query ratings by user or contract

### Deploy

```bash
# Local (Hardhat node)
pnpm run deploy:local

# Testnet (Polygon Amoy)
pnpm run deploy:reputation
pnpm run deploy:escrow
```

## 🧪 Testing

```bash
pnpm test            # Run all tests
pnpm run test:watch  # Watch mode
pnpm run test:ci     # CI mode with coverage
```

## 🗂️ Project Structure

```
├── contracts/                 # Solidity smart contracts
│   ├── FreelanceEscrow.sol    # Escrow for milestone payments
│   └── FreelanceReputation.sol# On-chain reputation system
├── scripts/                   # Deployment & utility scripts
├── src/
│   ├── config/                # Configuration (env, appwrite, contracts, redis)
│   ├── middleware/             # Express middleware
│   ├── models/                # Data models & types
│   ├── repositories/          # Data access layer
│   ├── routes/                # API route handlers
│   ├── services/              # Business logic
│   └── utils/                 # Utility functions
├── docs/                      # Full documentation
├── artifacts/                 # Compiled contracts
└── dist/                      # Compiled TypeScript
```

## 📚 Documentation

| Topic | Link |
| --- | --- |
| Full Documentation Index | [docs/README.md](docs/README.md) |
| API Reference | [docs/api/](docs/api/) |
| Architecture | [docs/architecture/](docs/architecture/) |
| Blockchain Integration | [docs/blockchain/](docs/blockchain/) |
| Database Schema | [docs/database/](docs/database/) |
| Deployment Guide | [docs/deployment/](docs/deployment/) |
| Smart Contracts | [contracts/README.md](contracts/README.md) |

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the [ISC License](LICENSE).

## 🆘 Support

- **Bug Reports & Feature Requests:** [GitHub Issues](https://github.com/ProTechPh/FreelanceXchain-api/issues)
- **Documentation:** [docs/](docs/)
- **Troubleshooting:** [docs/deployment/troubleshooting.md](docs/deployment/troubleshooting.md)
