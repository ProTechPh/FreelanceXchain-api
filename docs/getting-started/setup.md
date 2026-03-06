# Developer Setup Guide

<cite>
**Referenced Files in This Document**   
- [README.md](file://README.md)
- [.env.example](file://.env.example)
- [package.json](file://package.json)
- [hardhat.config.cjs](file://hardhat.config.cjs)
- [supabase/schema.sql](file://supabase/schema.sql)
- [supabase/seed-skills.sql](file://supabase/seed-skills.sql)
- [src/config/env.ts](file://src/config/env.ts)
- [src/app.ts](file://src/app.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Repository Setup](#repository-setup)
4. [Environment Configuration](#environment-configuration)
5. [Supabase Database Setup](#supabase-database-setup)
6. [Blockchain Development Environment](#blockchain-development-environment)
7. [Running the Application](#running-the-application)
8. [API Documentation Access](#api-documentation-access)
9. [Testing and Code Quality](#testing-and-code-quality)
10. [Troubleshooting](#troubleshooting)

## Introduction
This guide provides comprehensive instructions for setting up a development environment for FreelanceXchain, a blockchain-based freelance marketplace with AI skill matching. The setup process covers all necessary prerequisites, configuration steps, and environment initialization required to contribute to the project. This document will walk you through installing dependencies, configuring environment variables, setting up the Supabase database, initializing the blockchain development environment with Hardhat, and running the application in development mode.

## Prerequisites
Before beginning the setup process, ensure you have the following tools and accounts installed or created:

- **Node.js 20+** - JavaScript runtime environment
- **pnpm 8+** - Fast, disk space efficient package manager
- **Docker** - Containerization platform for optional containerized deployment
- **Supabase account** - Create a free account at https://supabase.com for database hosting
- **Ethereum wallet** - For blockchain interactions and deployment
- **LLM API key** - Required for AI features and skill matching functionality
- **Hardhat** - Ethereum development environment for smart contract compilation and deployment

Verify your Node.js and pnpm installations by running:
```bash
node --version
pnpm --version
```

Install Docker by following the official installation guide for your operating system at https://docs.docker.com/get-docker/. The Supabase CLI can be installed globally using pnpm:
```bash
pnpm install -g supabase
```

**Section sources**
- [README.md](file://README.md#L79-L85)

## Repository Setup
To begin contributing to FreelanceXchain, clone the repository and install all required dependencies:

1. Clone the repository from the source control system:
```bash
git clone <repository-url>
cd FreelanceXchain
```

2. Install all project dependencies using pnpm:
```bash
pnpm install --frozen-lockfile
```

This command will read the package.json file and install all dependencies listed in both the dependencies and devDependencies sections. The package.json file reveals that the project uses Node.js with TypeScript, Express for the backend framework, Supabase for the PostgreSQL database, and Hardhat for Ethereum development.

The project structure follows a modular architecture with distinct directories for contracts, scripts, source code, and documentation. The src directory contains the main application code organized into config, middleware, models, repositories, routes, services, and utils subdirectories.

**Section sources**
- [README.md](file://README.md#L89-L94)
- [package.json](file://package.json#L1-L67)

## Environment Configuration
Proper environment configuration is essential for the application to connect to external services and function correctly.

1. Create a copy of the example environment file:
```bash
cp .env.example .env
```

2. Edit the .env file with your specific credentials and configuration values. The environment variables are organized into several categories:

**Server Configuration**
- `PORT`: Server port (default: 7860)
- `NODE_ENV`: Environment mode (development/production/test)

**Supabase Configuration**
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (optional)

**JWT Configuration**
- `JWT_SECRET`: Secret key for JWT signing (minimum 32 characters)
- `JWT_REFRESH_SECRET`: Secret key for refresh tokens
- `JWT_EXPIRES_IN`: Access token expiration time (e.g., 1h)
- `JWT_REFRESH_EXPIRES_IN`: Refresh token expiration time (e.g., 7d)

**CORS Configuration**
- `CORS_ORIGIN`: Comma-separated list of allowed origins

**LLM Configuration**
- `LLM_API_KEY`: API key for LLM services (AI skill matching)
- `LLM_API_URL`: Base URL for LLM API

**Blockchain Configuration**
- `BLOCKCHAIN_RPC_URL`: Ethereum RPC endpoint URL
- `POLYGON_API_KEY`: Infura project ID for blockchain access

The src/config/env.ts file contains validation logic that ensures required environment variables are present and properly formatted, throwing errors if any required variables are missing.

**Section sources**
- [.env.example](file://.env.example#L1-L30)
- [src/config/env.ts](file://src/config/env.ts#L1-L70)

## Supabase Database Setup
Setting up the Supabase database involves creating a project, applying the schema, and seeding initial data.

1. Create a new project at https://supabase.com/dashboard

2. Apply the database schema by running the SQL commands from supabase/schema.sql in the Supabase SQL Editor. This schema file creates all necessary tables for the application, including:
   - Users and profile management
   - Projects and proposals
   - Contracts and payments
   - Skills and skill categories
   - Notifications and messages
   - KYC verifications and disputes

3. Copy your project URL and anon key from the Supabase dashboard to your .env file:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

4. Seed the database with initial skill data by running the commands from supabase/seed-skills.sql in the SQL Editor. This script inserts predefined skill categories (Web Development, Mobile Development, Data Science, DevOps, Design, Blockchain) and associated skills into the database.

5. Enable Row Level Security (RLS) on all tables as defined in the schema.sql file, which includes policies for public read access and service role full access.

The schema includes comprehensive indexes for optimal query performance and uses UUIDs for primary keys with the uuid-ossp extension.

**Section sources**
- [README.md](file://README.md#L102-L105)
- [supabase/schema.sql](file://supabase/schema.sql#L1-L261)
- [supabase/seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)

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
This command runs `pnpm dlx hardhat compile` and generates artifacts in the artifacts directory.

5. Deploy contracts to various networks using the predefined pnpm scripts:
   - Local development: `pnpm run deploy:contracts:dev`
   - Production network: `pnpm run deploy:contracts:prod`
   - General deployment: `pnpm run deploy:contracts`
   - Legacy Sepolia: `pnpm run deploy:reputation` and `pnpm run deploy:escrow`

The contracts directory contains Solidity smart contracts including FreelanceEscrow.sol for milestone-based payments and FreelanceReputation.sol for immutable on-chain ratings.

**Section sources**
- [README.md](file://README.md#L107-L110)
- [package.json](file://package.json#L14-L18)
- [hardhat.config.cjs](file://hardhat.config.cjs#L1-L50)

## Running the Application
Once all dependencies are installed and configuration is complete, you can run the application in development mode.

1. Build the TypeScript code:
```bash
pnpm run build
```

2. Start the server in development mode with hot reloading:
```bash
pnpm run dev
```
This command uses tsx to watch for file changes and automatically restart the server.

3. Alternatively, start the production server:
```bash
pnpm start
```

4. Or run in production mode with tsx:
```bash
pnpm run prod
```

5. Verify the server is running by accessing the health check endpoint:
```bash
curl http://localhost:7860/
```

The application will be available at http://localhost:7860. The src/app.ts file configures the Express server with middleware for security, CORS, request logging, and error handling, and mounts the API routes under the /api path.

**Section sources**
- [README.md](file://README.md#L117-L121)
- [package.json](file://package.json#L8-L10)
- [src/app.ts](file://src/app.ts#L1-L87)

## API Documentation Access
Interactive API documentation is available through Swagger UI, providing a comprehensive interface for exploring and testing API endpoints.

1. Access the Swagger UI documentation at:
```
http://localhost:7860/api-docs
```

2. The documentation includes detailed information about:
   - Authentication requirements (Bearer tokens)
   - All API endpoints with request/response examples
   - Parameter descriptions and validation rules
   - Error response formats

3. The API endpoints are organized into modules including:
   - Authentication (register, login, token refresh)
   - User profiles (freelancer and employer)
   - Projects and proposals
   - Contracts and payments
   - Reputation and disputes
   - Skill management and AI matching

The Swagger specification is generated from JSDoc comments in the source code and configured in src/config/swagger.ts, which dynamically sets the server URL based on environment variables.

**Section sources**
- [README.md](file://README.md#L153-L158)
- [docs/API-DOCUMENTATION.md](file://docs/API-DOCUMENTATION.md#L1-L642)
- [src/config/swagger.ts](file://src/config/swagger.ts#L1-L233)

## Testing and Code Quality
The project includes comprehensive testing and code quality tools to ensure code reliability and maintainability.

1. Run all tests:
```bash
pnpm test
```

2. Run tests in watch mode for continuous testing during development:
```bash
pnpm run test:watch
```

3. Run ESLint for code quality checks:
```bash
pnpm run lint
```

The testing framework uses Jest with TypeScript support, configured in jest.config.js. The test setup includes:
- ESM module support
- Test timeout of 30 seconds
- Code coverage reporting
- Integration with ts-jest for TypeScript compilation

The linting configuration in eslint.config.js includes rules for TypeScript best practices, with different rule sets for source files and test files. The configuration ignores certain directories like node_modules, dist, and coverage.

**Section sources**
- [README.md](file://README.md#L211-L217)
- [package.json](file://package.json#L11-L13)
- [jest.config.js](file://jest.config.js#L1-L32)
- [eslint.config.js](file://eslint.config.js#L1-L88)

## Troubleshooting
This section addresses common setup issues and their solutions.

**Database Connection Errors**
- Verify Supabase URL and keys are correctly copied to .env
- Ensure the schema.sql has been executed in the Supabase SQL Editor
- Check that Row Level Security (RLS) policies are properly configured
- Verify network connectivity to Supabase

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

**Section sources**
- [README.md](file://README.md#L232-L242)
- [docs/TESTING.md](file://docs/TESTING.md)
- [docs/TECHNICAL-SPECS.md](file://docs/TECHNICAL-SPECS.md)