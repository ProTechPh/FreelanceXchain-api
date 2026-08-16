<!-- markdownlint-disable-next-line MD041 -->
<div align="center">

# 🔗 FreelanceXchain API

**Blockchain-Based Freelance Marketplace with AI Skill Matching**

[![CodeRabbit Reviews](https://img.shields.io/coderabbit/prs/github/ProTechPh/FreelanceXchain-api?utm_source=oss&utm_medium=github&utm_campaign=ProTechPh%2FFreelanceXchain-api&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)](https://coderabbit.ai)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](../LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)

A decentralized freelance marketplace API where employers post projects, freelancers get matched by AI and hired on-chain, and payments are held in smart-contract escrow and released milestone-by-milestone — no 20% platform fees, no fake reviews, no payment disputes that favor the house.

</div>

---

## 📖 What is this?

FreelanceXchain is a **backend API** (Node.js + Express + TypeScript) for a freelance marketplace built on three pillars:

1. **Appwrite** — users, profiles, projects, and data persistence
2. **Ethereum smart contracts** (Solidity/Hardhat) — escrow, agreements, disputes, and reputation, deployed on **Polygon Amoy** in production
3. **LLM-powered AI matching** — skill extraction and project↔freelancer recommendations (OpenAI-compatible, Claude by default)

**Who it's for:** freelancers who want guaranteed, on-time payment; employers who want vetted, well-matched talent; and anyone tired of platforms that take a cut of every payment.

## 🔄 How it works

```
Employer posts a project  →  AI matches freelancers  →  Freelancer submits a proposal
        ↓
Contract is created & employer funds the escrow (ETH)
        ↓
Work is split into milestones → freelancer submits → employer approves
        ↓
Payment is released from escrow on each approval
        ↓
Contract completes → both parties rate each other (on-chain reputation)
        ↓
Disputes (if any) are resolved by an arbiter, or partially refunded
```

- **Escrow** — funds are locked in the `FreelanceEscrow` contract until work is approved; nobody can run away with the money.
- **Reputation** — ratings live on-chain in `FreelanceReputation`, so history is portable and can't be scrubbed.
- **Disputes** — milestone-level disputes with evidence, arbiter resolution, and milestone-granular partial refunds.

## ✨ Key features

| Problem | Solution |
| --- | --- |
| High platform fees (up to 20%) | Decentralized escrow with minimal fees |
| Delayed & unfair payments | Smart-contract escrow, milestone-based release |
| Fake reviews & opaque ratings | Immutable on-chain reputation |
| Mismatched hires | AI skill extraction & project matching |
| Unvetted users | KYC via Didit (220+ countries) |
| Deadlocked payments | Arbiter disputes + milestone-granular partial refunds |

## 🏗️ Architecture

```
Routes → Services → Repositories → Appwrite (database, auth, storage)
            ↓
      Blockchain adapter (real EVM ↔ simulated ledger)
            ↓
      AI services (OpenAI-compatible LLM API)
```

The blockchain layer uses an adapter pattern: set `BLOCKCHAIN_MODE=simulated` (the default) to emulate escrow in Appwrite with zero setup — great for local dev and the test suite — or `real` to talk to actual contracts on Ganache / Polygon Amoy.

## 🚀 Tech Stack

| Layer | Technology |
| --- | --- |
| **Backend** | Node.js 20+, Express, TypeScript (ESM) |
| **Database / Auth** | Appwrite (schema versioned in `scripts/setup-appwrite-db.ts`) |
| **Blockchain** | Solidity 0.8.26, Hardhat, Ethers.js — Polygon Amoy (prod), Ganache (dev) |
| **AI/ML** | OpenAI-compatible LLM API (default: Anthropic Claude) |
| **Auth** | JWT (access + refresh), MFA, CSRF, role-based access, Didit KYC |
| **Infra** | Redis (rate limiting), Docker (multi-stage), Swagger/OpenAPI |

## 📦 Getting Started

### Prerequisites

- **Node.js** 20+ and **pnpm** 8+
- An **Appwrite** project ([appwrite.io](https://appwrite.io)) — the only hard requirement
- A wallet / Ganache node — only if you want **real** blockchain mode
- An **LLM API key** — only for AI matching features (skill matching falls back to keyword matching without it)

### Quick Setup

```bash
# 1. Clone & install
git clone https://github.com/ProTechPh/FreelanceXchain-api.git
cd FreelanceXchain-api
pnpm install --frozen-lockfile

# 2. Configure environment (see .env.example for the full list)
cp .env.example .env
# At minimum: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, JWT_SECRET

# 3. Compile smart contracts (required — the runtime loads ABIs from artifacts/)
pnpm run compile

# 4. Apply the Appwrite schema (idempotent, safe to re-run)
pnpm run setup:appwrite-db

# 5. Run the dev server
pnpm run dev
```

The API listens on **`http://localhost:3000`** by default (set `PORT` to change it). Enable the interactive docs with `ENABLE_API_DOCS=true`, then open **`http://localhost:3000/api-docs`**.

> ⚠️ **Blockchain mode gotcha:** `pnpm run dev` forces `BLOCKCHAIN_MODE=real` and expects a **Ganache node at `http://127.0.0.1:7545`** (start it with `pnpm run deploy:local`, or run your own). Without a node, either start Ganache or run in simulated mode instead:
>
> ```bash
> BLOCKCHAIN_MODE=simulated pnpm exec tsx src/index.ts
> ```

### Docker

```bash
docker build -t freelancexchain-api:latest .
docker run -p 7860:7860 --env-file .env freelancexchain-api:latest
```

> 📖 Detailed setup: [Developer Setup Guide](../docs/deployment/setup.md) · [Deployment Configuration](../docs/deployment/configuration.md)

## 🔑 Environment Variables

Curated list — the **authoritative, complete list is `.env.example`**. Required variables crash the server at startup if missing.

| Variable | Description |
| --- | --- |
| `APPWRITE_ENDPOINT` · `APPWRITE_PROJECT_ID` · `APPWRITE_API_KEY` | Appwrite connection (**required**) |
| `JWT_SECRET` | JWT signing secret, min 32 chars (**required**) |
| `JWT_REFRESH_SECRET` | Refresh-token secret (**required in production**) |
| `CSRF_SECRET` · `MFA_ENCRYPTION_KEY` | CSRF signing & MFA encryption (**required in production**) |
| `LLM_API_URL` · `LLM_MODEL` · `LLM_API_KEY` | AI matching (default: `https://api.anthropic.com`, `claude-haiku-4.5`) |
| `BLOCKCHAIN_MODE` | `simulated` (default) or `real` |
| `BLOCKCHAIN_RPC_URL` · `BLOCKCHAIN_PRIVATE_KEY` | RPC endpoint & wallet key for real mode |
| `PLATFORM_ARBITER_ADDRESS` · `PLATFORM_ARBITER_PRIVATE_KEY` | On-chain dispute arbiter (real mode) |
| `DIDIT_API_KEY` · `DIDIT_API_URL` · `DIDIT_WEBHOOK_SECRET` · `DIDIT_WORKFLOW_ID` | Didit KYC |
| `REDIS_HOST` · `REDIS_PORT` · `REDIS_PASSWORD` · `REDIS_TLS` | Rate limiting / cache |
| `PORT` · `NODE_ENV` · `BASE_URL` · `ENABLE_API_DOCS` · `LOG_LEVEL` | Server behavior |
| `APPWRITE_*_BUCKET` | Storage bucket names (proposals, project attachments, dispute evidence, portfolio, deliverables) |

## 📡 API Modules

All routes are prefixed with `/api`. Full interactive docs at `/api-docs` (set `ENABLE_API_DOCS=true`).

| Module | Path | Description |
| --- | --- | --- |
| Health | `/api/health` | Liveness & readiness probes |
| Auth | `/api/auth` | Register, login, OAuth, MFA, tokens, password recovery |
| Skills | `/api/skills` | Skill taxonomy + custom skills + suggestions |
| Freelancers / Employers | `/api/freelancers` · `/api/employers` | Profiles, experience, skills |
| Projects | `/api/projects` | CRUD, milestones, attachments, listing |
| Search / Matching | `/api/search` · `/api/matching` | Filtered search + AI recommendations |
| Proposals | `/api/proposals` | Submit, accept, reject, withdraw (JSON or multipart) |
| Contracts | `/api/contracts` | Lifecycle, funding, escrow, cancellation |
| Payments / Milestones | `/api/payments` · `/api/milestones` | Milestone submission, approval, deliverables |
| Escrow Refunds | `/api/escrow` | Partial-refund requests & approvals |
| Disputes | `/api/disputes` | Create, evidence, resolve |
| KYC | `/api/kyc` | Didit verification + admin review + webhook |
| Reputation / Reviews | `/api/reputation` · `/api/reviews` | Ratings, scores, leaderboard |
| Notifications / Messages | `/api/notifications` · `/api/messages` | In-app + email + SSE stream |
| Email | `/api/inbox` · `/api/email-preferences` | Email delivery, inbound webhook, preferences |
| Saved searches / Favorites / Portfolio | `/api/saved-searches` · `/api/favorites` · `/api/portfolio` | Discovery & profile extras |
| Admin / Audit / Files | `/api/admin` · `/api/audit-logs` · `/api/files` | Administration, audit trail, uploads |
| Webhooks | `/api/webhooks` · `/api/inbox/webhook` · `/api/kyc/webhook` | Blockchain / email / Didit events |
| Dashboard / Metrics | `/api/dashboard` · `/api/metrics` | Summary + SLI metrics |

## ⛓️ Smart Contracts

Five non-upgradeable Solidity contracts in [`contracts/`](../contracts/README.md):

| Contract | Purpose |
| --- | --- |
| **FreelanceEscrow** | Milestone escrow: deposit, submit, approve, dispute, refund, withdraw |
| **ContractAgreement** | On-chain agreement terms, multi-party signing, lifecycle |
| **MilestoneRegistry** | Verifiable milestone history and stats |
| **DisputeResolution** | Evidence submission and arbiter resolution |
| **FreelanceReputation** | On-chain 1–5 star ratings with anti-duplication |

```bash
pnpm run deploy:local            # Local Hardhat node
pnpm run deploy:contracts:dev    # Ganache
pnpm run deploy:contracts:prod   # Polygon Amoy testnet
```

## 🧪 Testing & Quality

```bash
pnpm test              # Full test suite (Jest, 5,400+ tests)
pnpm run test:coverage # With coverage thresholds
pnpm exec tsc --noEmit # Type check
pnpm run lint          # ESLint
pnpm run openapi:check # Verify the OpenAPI spec hasn't drifted from the code
pnpm run build         # Production build
```

## 🗂️ Project Structure

```
├── contracts/                 # Solidity smart contracts (5 contracts)
├── scripts/                   # Deploy, setup-appwrite-db, OpenAPI generation
├── src/
│   ├── config/                # Env, Appwrite, Redis, contracts, Swagger
│   ├── middleware/            # Auth, validation, rate limiting, CSRF, uploads
│   ├── models/ · types/ · validators/
│   ├── repositories/          # Data access layer (Appwrite)
│   ├── routes/                # Express route handlers (30+ modules)
│   ├── services/              # Business logic (incl. blockchain adapter)
│   └── utils/                 # Shared helpers (responses, schemas, storage)
├── docs/                      # Full documentation suite
├── artifacts/                 # Compiled contract artifacts (gitignored, via `pnpm run compile`)
└── dist/                      # Compiled TypeScript (gitignored)
```

## 📚 Documentation

| Topic | Link |
| --- | --- |
| Full Documentation Index | [docs/README.md](../docs/README.md) |
| API Reference | [docs/api/](../docs/api/) |
| Architecture | [docs/architecture/](../docs/architecture/) |
| Blockchain Integration | [docs/blockchain/](../docs/blockchain/) |
| Database & Security | [docs/database/](../docs/database/) |
| Deployment & Setup | [docs/deployment/](../docs/deployment/) |
| Smart Contracts | [contracts/README.md](../contracts/README.md) |

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](../CONTRIBUTING.md) before submitting a PR.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the [ISC License](../LICENSE).

## 🆘 Support

- **Bug Reports & Feature Requests:** [GitHub Issues](https://github.com/ProTechPh/FreelanceXchain-api/issues)
- **Documentation:** [docs/](../docs/)
- **Troubleshooting:** [docs/deployment/troubleshooting.md](../docs/deployment/troubleshooting.md)
