# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev              # Start dev server with Ganache (local blockchain)
pnpm prod             # Start with Polygon Amoy testnet
pnpm build            # Compile TypeScript to dist/
pnpm start            # Run compiled output

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # With coverage report
pnpm test:ci          # CI mode

# Run a single test file
pnpm test -- src/__tests__/unit/auth-service.test.ts

# Linting
pnpm lint

# Smart contracts
pnpm compile          # Compile Solidity contracts
pnpm deploy:local     # Deploy contracts to local Hardhat node
pnpm deploy:contracts # Deploy all contracts

# OpenAPI
pnpm openapi:generate
```

## Architecture

Layered architecture: **Routes → Services → Repositories → Supabase (PostgreSQL)**

- `src/app.ts` — Express app setup, middleware stack, route mounting
- `src/index.ts` — Server entry point, graceful shutdown
- `src/config/env.ts` — Centralized, type-safe environment config (all env vars go through here)
- `src/config/supabase.ts` — Supabase client singleton

**Routes** (`src/routes/`) — 33+ feature modules, all mounted under `/api` in `src/routes/index.ts`

**Services** (`src/services/`) — Business logic. Key services:
- `auth-service.ts` — JWT + MFA authentication
- `payment-service.ts` — Escrow payment flows
- `matching-service.ts` — AI-powered freelancer/project matching
- `blockchain/` — Adapter pattern: `BlockchainFactory` returns either `RealAdapter` (live chain) or `SimulatedAdapter` (testing), controlled by `BLOCKCHAIN_MODE` env var

**Repositories** (`src/repositories/`) — Data access via Supabase JS client. All extend `BaseRepository<T>` which provides standard CRUD.

**Models** (`src/models/`) — TypeScript interfaces only, no ORM models.

**Middleware** (`src/middleware/`) — Applied in order: security headers → request ID → HTTPS → body parsing → CORS → logging → CSRF → routes → error handler.

**Smart Contracts** (`contracts/`) — Solidity contracts compiled with Hardhat. Artifacts land in `artifacts/`. Contract interaction is abstracted through service classes (`escrow-contract.ts`, `reputation-contract.ts`, `agreement-contract.ts`).

**Database** — Schema in `supabase/schema.sql`, migrations in `supabase/migrations/`. Uses Supabase RLS policies.

## Testing

Tests live in `src/__tests__/` split into `unit/`, `integration/`, `security/`, and `routes/`.

The Jest setup (`jest.setup.js`) mocks the Supabase client globally and stubs `fetch` to prevent real network calls. Blockchain tests use `SimulatedAdapter` — never hit a real chain in tests.

TypeScript is compiled via `ts-jest` with ESM support (`NODE_OPTIONS=--experimental-vm-modules`).

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Database connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB operations |
| `JWT_SECRET` | Token signing (min 32 chars) |
| `BLOCKCHAIN_MODE` | `real` or `simulated` (default: `simulated`) |
| `BLOCKCHAIN_RPC_URL` / `BLOCKCHAIN_PRIVATE_KEY` | Live chain access |
| `LLM_API_KEY` / `LLM_API_URL` / `LLM_MODEL` | AI matching features |
| `DIDIT_API_KEY` / `DIDIT_WEBHOOK_SECRET` | KYC integration |
| `CORS_ORIGIN` | Comma-separated allowed origins |

See `.env.example` for the full list including per-network contract addresses.
