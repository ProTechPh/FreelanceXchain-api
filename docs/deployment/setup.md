# Developer Setup Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Repository Setup](#repository-setup)
4. [Environment Configuration](#environment-configuration)
5. [Appwrite Database Setup](#appwrite-database-setup)
6. [Blockchain Development Environment](#blockchain-development-environment)
7. [Running the Application](#running-the-application)
8. [API Documentation Access](#api-documentation-access)
9. [Testing and Code Quality](#testing-and-code-quality)
10. [Troubleshooting](#troubleshooting)

## Introduction

This guide provides comprehensive instructions for setting up a development environment for FreelanceXchain, a blockchain-based freelance marketplace with AI skill matching. The setup process covers all necessary prerequisites, configuration steps, and environment initialization required to contribute to the project. This document will walk you through installing dependencies, configuring environment variables, setting up the Appwrite database, initializing the blockchain development environment with Hardhat, and running the application in development mode.

## Prerequisites

Before beginning the setup process, ensure you have the following tools and accounts installed or created:

- **Node.js 20+** - JavaScript runtime environment
- **pnpm 8+** - Fast, disk space efficient package manager
- **Docker** - Containerization platform for optional containerized deployment
- **Appwrite account** - Create a free account at <https://appwrite.com> for database hosting
- **Ethereum wallet** - For blockchain interactions and deployment
- **LLM API key** - Required for AI features and skill matching functionality
- **Hardhat** - Ethereum development environment for smart contract compilation and deployment

Verify your Node.js and pnpm installations by running:

```bash
node --version
pnpm --version
```

Install Docker by following the official installation guide for your operating system at <https://docs.docker.com/get-docker/>. The Appwrite CLI can be installed globally using pnpm:

```bash
pnpm install -g appwrite
```

## Repository Setup

To begin contributing to FreelanceXchain, clone the repository and install all required dependencies:

1. Clone the repository from the source control system:

```bash
git clone <repository-url>
cd FreelanceXchain
```

1. Install all project dependencies using pnpm:

```bash
pnpm install --frozen-lockfile
```

This command will read the package.json file and install all dependencies listed in both the dependencies and devDependencies sections. The package.json file reveals that the project uses Node.js with TypeScript, Express for the backend framework, Appwrite (Backend-as-a-Service) for data storage and auth, and Hardhat for Ethereum development.

The project structure follows a modular architecture with distinct directories for contracts, scripts, source code, and documentation. The src directory contains the main application code organized into config, middleware, models, repositories, routes, services, and utils subdirectories.

## Environment Configuration

Proper environment configuration is essential for the application to connect to external services and function correctly.

1. Create a copy of the example environment file:

```bash
cp .env.example .env
```

1. Edit the .env file with your specific credentials and configuration values. The environment variables are organized into several categories:

**Server Configuration**

- `PORT`: HTTP listen port (default: 3000)
- `NODE_ENV`: Environment mode (development/test/production)
- `BASE_URL`: Overrides the auto-detected base URL (auto-detected from `SPACE_ID` or `localhost:<PORT>` otherwise)
- `ENABLE_API_DOCS`: Set `true` to serve the Swagger UI at `/api-docs` (disabled by default)
- `LOG_LEVEL`: Log verbosity (debug/info/warn/error)

**Appwrite Configuration**

- `APPWRITE_ENDPOINT`: Appwrite API endpoint (e.g., `https://cloud.appwrite.io/v1`) — required
- `APPWRITE_PROJECT_ID`: Appwrite project ID — required
- `APPWRITE_API_KEY`: Appwrite service-role API key — required
- `APPWRITE_DATABASE_ID`: Database ID (default: `freelancexchain`)
- Storage buckets: `APPWRITE_PROPOSAL_ATTACHMENTS_BUCKET`, `APPWRITE_PROJECT_ATTACHMENTS_BUCKET`, `APPWRITE_DISPUTE_EVIDENCE_BUCKET`, `APPWRITE_PORTFOLIO_IMAGES_BUCKET`, `APPWRITE_MILESTONE_DELIVERABLES_BUCKET` (defaults shown in `.env.example`)

**JWT Configuration**

- `JWT_SECRET`: Secret key for JWT signing (minimum 32 characters) — required
- `JWT_REFRESH_SECRET`: Separate secret for refresh tokens (required in production; falls back to `JWT_SECRET` in non-prod)
- `JWT_EXPIRES_IN`: Access token expiration time (default: 1h)
- `JWT_REFRESH_EXPIRES_IN`: Refresh token expiration time (default: 7d)
- `CSRF_SECRET`: CSRF signing secret (required in production, separate from `JWT_SECRET`)
- `MFA_ENCRYPTION_KEY`: Encryption key for MFA sessions (required in production)

**CORS Configuration**

- `CORS_ORIGIN`: Comma-separated list of allowed origins

**LLM Configuration**

- `LLM_API_URL`: Base URL for the LLM API (Anthropic-compatible; default `https://api.anthropic.com`) — required
- `LLM_MODEL`: Model name (default: `claude-haiku-4.5`)
- `LLM_API_KEY`: API key for LLM services (optional)

**Blockchain Configuration**

- `BLOCKCHAIN_MODE`: `simulated` (default) or `real`
- `BLOCKCHAIN_RPC_URL`: RPC endpoint (Ganache `http://127.0.0.1:7545` for dev, Polygon Amoy for prod)
- `BLOCKCHAIN_PRIVATE_KEY`: Private key for transaction signing (required when `BLOCKCHAIN_MODE=real`)
- `BLOCKCHAIN_WEBHOOK_SECRET`: HMAC secret for blockchain webhook verification
- `PLATFORM_ARBITER_ADDRESS` / `PLATFORM_ARBITER_PRIVATE_KEY`: On-chain dispute arbiter (required in real mode)
- Contract addresses per network: `HARDHAT_*`, `AMOY_*`, `POLYGON_*`, `MAINNET_*` (see `.env.example`)

**Didit KYC**

- `DIDIT_API_KEY`, `DIDIT_API_URL`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`; `ALLOW_INSECURE_DIDIT_WEBHOOKS=false` in shared/prod

**Email & Redis**

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `EMAIL_FROM`, `EMAIL_WEBHOOK_SECRET`
- `REDIS_HOST` (default `localhost`), `REDIS_PORT` (default 6379), `REDIS_PASSWORD`, `REDIS_TLS`

The src/config/env.ts file contains validation logic that ensures required environment variables are present and properly formatted, throwing errors if any required variables are missing. The authoritative list lives in `.env.example`.

## Appwrite Database Setup

Setting up the Appwrite database involves creating a project, applying the schema, and seeding initial data.

1. Create a new project at <https://appwrite.com/dashboard>

2. Copy your Appwrite endpoint, project ID, and API key from the Appwrite dashboard to your .env file:

    ```bash
    APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
    APPWRITE_PROJECT_ID=your-project-id
    APPWRITE_API_KEY=your-api-key
    ```

3. Apply the database schema by running `npx tsx scripts/setup-appwrite-db.ts`. This idempotent script creates the database, collections, attributes, and indexes for the application, including:
   - Users and profile management
   - Projects and proposals
   - Contracts and payments
   - Skills and skill categories
   - Notifications and messages
   - KYC verifications and disputes

4. Skill categories and skills are managed through the API (admin `createCategory`/`createSkill` endpoints in `src/services/skill-service.ts`); the setup script creates the schema only — it does not seed taxonomy.

5. Collections are created with default Appwrite permissions (public read, authenticated create/update/delete); ownership rules are enforced in application middleware.

## Blockchain Development Environment

The blockchain development environment is configured using Hardhat, a development environment for Ethereum software.

1. Ensure Hardhat is installed as a devDependency in the project (specified in package.json):

    ```bash
    pnpm install --frozen-lockfile
    ```

2. Review the Hardhat configuration in hardhat.config.cjs, which defines:
   - Solidity compiler version (0.8.26) with optimizer enabled (1000 runs) and IR-based code generation
   - Network configurations for hardhat, ganache, sepolia, polygon, and amoy (Polygon testnet)
   - Source, test, cache, and artifacts paths

3. Configure blockchain network settings in your .env file:
   - For Sepolia testnet: Set BLOCKCHAIN_RPC_URL to your Infura endpoint
   - For local testing with Ganache: Uncomment the Ganache configuration lines

4. Compile the smart contracts:

    ```bash
    pnpm run compile
    ```

    This command runs `hardhat compile --config hardhat.config.cjs` and generates artifacts in the artifacts directory.

5. Deploy contracts to various networks using the predefined pnpm scripts:
   - Local development (Ganache): `pnpm run deploy:contracts:dev`
   - Production network (Polygon Amoy): `pnpm run deploy:contracts:prod`
   - General deployment: `pnpm run deploy:contracts`
   - Single-contract deploys (Amoy): `pnpm run deploy:reputation` and `pnpm run deploy:escrow`

The contracts directory contains Solidity smart contracts including FreelanceEscrow.sol for milestone-based payments and FreelanceReputation.sol for immutable on-chain ratings.

## Running the Application

Once all dependencies are installed and configuration is complete, you can run the application in development mode.

1. Build the TypeScript code:

```bash
pnpm run build
```

1. Start the server in development mode with hot reloading:

```bash
pnpm run dev
```

This command uses tsx to watch for file changes and automatically restart the server.

1. Alternatively, start the production server:

```bash
pnpm start
```

1. Or run in production mode with tsx:

```bash
pnpm run prod
```

1. Verify the server is running by accessing the health check endpoint:

```bash
curl http://localhost:3000/
```

The application will be available at <http://localhost:3000> (or whatever `PORT` is set to — 7860 is the Hugging Face Spaces convention). The src/app.ts file configures the Express server with middleware for security, CORS, request logging, and error handling, and mounts the API routes under the /api path.

## API Documentation Access

Interactive API documentation is available through Swagger UI, providing a comprehensive interface for exploring and testing API endpoints.

1. Enable the docs (disabled by default):

    ```bash
    ENABLE_API_DOCS=true
    ```

2. Access the Swagger UI documentation at:

    ```
    http://localhost:3000/api-docs
    ```

3. The documentation includes detailed information about:
   - Authentication requirements (Bearer tokens)
   - All API endpoints with request/response examples
   - Parameter descriptions and validation rules
   - Error response formats

4. The API endpoints are organized into modules including:
   - Authentication (register, login, token refresh)
   - User profiles (freelancer and employer)
   - Projects and proposals
   - Contracts and payments
   - Reputation and disputes
   - Skill management and AI matching

The Swagger specification is served from the generated `openapi.json` file at the repo root. It is regenerated from `openapi.base.json` plus the route validation schemas via `pnpm run openapi:generate` (CI enforces drift with `pnpm run openapi:check`); `src/config/swagger.ts` loads it and dynamically sets the server URL based on environment variables.

## Testing and Code Quality

The project includes comprehensive testing and code quality tools to ensure code reliability and maintainability.

1. Run all tests:

```bash
pnpm test
```

1. Run tests in watch mode for continuous testing during development:

```bash
pnpm run test:watch
```

1. Run ESLint for code quality checks:

```bash
pnpm run lint
```

The testing framework uses Jest with TypeScript support, configured in jest.config.js. The test setup includes:

- ESM module support
- Test timeout of 30 seconds
- Code coverage reporting
- Integration with ts-jest for TypeScript compilation

The linting configuration in eslint.config.js includes rules for TypeScript best practices, with different rule sets for source files and test files. The configuration ignores certain directories like node_modules, dist, and coverage.

## Troubleshooting

This section addresses common setup issues and their solutions.

**Database Connection Errors**

- Verify Appwrite URL and keys are correctly copied to .env
- Ensure `npx tsx scripts/setup-appwrite-db.ts` has been run to create the schema
- Check that collection permissions and auth middleware rules are configured correctly
- Verify network connectivity to Appwrite

**Missing Dependencies**

- Run `pnpm install --frozen-lockfile` to ensure all dependencies are installed
- Delete node_modules and pnpm-lock.yaml and reinstall if issues persist
- Verify Node.js version meets the minimum requirement (20+)
- Ensure pnpm version is 8 or higher

**Blockchain Network Configuration**

- Ensure BLOCKCHAIN_RPC_URL is correctly set for the target network
- Verify the private key format is valid (64 hex characters)
- Check Infura project ID if using Infura as the RPC provider
- Ensure sufficient funds in the deployment wallet for testnet deployments

**TypeScript and Compilation Issues**

- Run `pnpm run build` to identify compilation errors
- Verify tsconfig.json settings are correct
- Ensure all required environment variables are set

**Docker Deployment Issues**

- Verify Docker is properly installed and running
- Ensure .env file is available for container environment
- Check port availability (default: 3000)

Refer to the comprehensive documentation in the docs directory for additional troubleshooting guidance and technical specifications.

[← Back to Deployment](README.md)
