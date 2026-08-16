# AGENTS.md — FreelanceXchain API

## Project

Node.js/Express/TypeScript backend (ESM, `"type": "module"`) for a decentralized freelance marketplace. Appwrite (auth/database/storage), Solidity smart contracts (Hardhat), AI skill matching via LLM, Didit KYC.

## Essential commands

| Purpose | Command |
| --------- | --------- |
| Install | `pnpm install --frozen-lockfile` |
| Dev server | `pnpm run dev` |
| Build (tsc) | `pnpm run build` |
| Start production | `pnpm start` |
| Lint | `pnpm run lint` |
| Type check | `pnpm exec tsc --noEmit` |
| Test | `node --experimental-vm-modules node_modules/jest/bin/jest.js` (alias: `pnpm test`) |
| Test watch | `pnpm run test:watch` |
| Test CI | `pnpm run test:ci` (adds `--passWithNoTests`) |
| Coverage | `pnpm run test:coverage` |
| Compile contracts | `pnpm run compile` |
| Deploy (Ganache) | `pnpm run deploy:contracts:dev` |
| Deploy (Polygon Amoy) | `pnpm run deploy:contracts:prod` |
| OpenAPI spec (regenerate from base) | `pnpm run openapi:generate` |
| OpenAPI spec (drift check, runs in CI) | `pnpm run openapi:check` |
| Markdown links (broken internal link check, runs in CI) | `pnpm run docs:check` |
| Markdown lint (formatting, runs in CI) | `pnpm run docs:lint` |
| Deploy local Hardhat | `pnpm run deploy:local` |

Test invocations must always use `node --experimental-vm-modules` (it's in the npm script, but not in `jest` directly).

## CI pipeline (`.github/workflows/ci.yml`)

Four **parallel** jobs, each independently installing and compiling:

- **typecheck**: `compile` → `tsc --noEmit` → `lint`
- **test**: `compile` → `test:ci` + coverage upload
- **build**: `compile` → `build`
- **docs**: install → `docs:check` (fails on any broken internal markdown link in `docs/` and README files; CHANGELOG.md is excluded as intentionally historical) → `docs:lint` (markdownlint formatting, configured in `.markdownlint-cli2.jsonc`)

Local verification order (mirrors what CI checks): `compile` → `tsc --noEmit` → `lint` → `test` → `build` → `docs:check` → `docs:lint`

## Architecture

Layered: `routes/` → `services/` → `repositories/` → Appwrite.
Entry point: `src/index.ts` calls `createApp()` from `src/app.ts`.
Routes barrel: `src/routes/index.ts` mounts 30+ route modules under `/api`.

Blockchain uses an adapter pattern (`IBlockchainAdapter` in `src/services/blockchain/adapter.ts`). Switch modes via `BLOCKCHAIN_MODE=real|simulated` (default `simulated`). Dev targets Ganache at `http://127.0.0.1:7545`. Production targets Polygon Amoy testnet.

Note: `pnpm run dev` and `prod` override to `BLOCKCHAIN_MODE=real` — a normally-run server uses REAL blockchain. The `simulated` default is only a fallback for when `BLOCKCHAIN_MODE` is unset; its main consumers are the jest suite and local runs without a node. Even in real mode, the service mirrors escrow state into the Appwrite "simulated" ledger for status tracking (read-model only, not a second money path). If you need simulated mode locally, set `BLOCKCHAIN_MODE=simulated` explicitly.

## Testing quirks

- ESM testing requires `jest.unstable_mockModule` for all module mocks (not `jest.mock`).
- Tests mock `src/config/env.ts` wholesale by re-importing after `jest.unstable_mockModule`.
- `jest.setup.ts` provides globals: `mockPool`, `mockAppwriteResult()`, `createMockBuilder()`, `mockAppwriteAccount`, `mockAppwriteUsers`, `mockAppwriteStorage`.
- Coverage thresholds are high (lines 99%, branches 88%, functions 99%, statements 98%). Many `coverage-*.test.ts` files exist solely to patch coverage gaps.
- `--experimental-vm-modules` is required (hardcoded in the test script).
- Timeout: 30s.
- Two setup files exist (`jest.setup.ts` and `jest.setup.js`); only `jest.setup.ts` is configured in `jest.config.js`.
- Tests load `.env.test` via `dotenv` in setup.
- Route tests use `supertest` and follow the pattern: mock `env.ts` + mock all service dependencies → import express → mount routes with mocked services → `request(app)`.

## Important env vars

- `BLOCKCHAIN_MODE` — `real` or `simulated` (default: `simulated`)
- `ENABLE_API_DOCS` — must be `true` for Swagger UI at `/api-docs` (disabled by default)
- `JWT_REFRESH_SECRET` — required in production (falls back to `JWT_SECRET` in non-prod)
- `ALLOW_INSECURE_DIDIT_WEBHOOKS` — local-only bypass, keep `false` in shared/prod
- `USE_APPWRITE_AUTH` — used in test env

## Toolchain quirks

- **pnpm** only (not npm/yarn). `pnpm-workspace.yaml` is single-package. `shamefullyHoist: true`, `strictPeerDependencies: false`.
- **Hardhat config** is `.cjs` (CommonJS); rest of the project is ESM.
- **tsx** for running TypeScript scripts in dev (not `ts-node`).
- **cross-env** for cross-platform env vars in npm scripts.
- **tsconfig.json** excludes tests; **tsconfig.test.json** includes them. Both use `NodeNext` module resolution.
- **ESLint** uses flat config (`eslint.config.js`). Separate configs for source vs test files.
- **Docker**: multi-stage build. Production stage installs only `--prod` deps, then copies `dist/`.
