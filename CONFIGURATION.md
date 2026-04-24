# Configuration Guide

Complete guide to all configuration files in the FreelanceXchain API project.

## 📋 Configuration Files Overview

| File | Purpose | Documentation |
|------|---------|---------------|
| `package.json` | NPM dependencies and scripts | [Package Configuration](#packagejson) |
| `tsconfig.json` | TypeScript compiler configuration | [TypeScript Config](#tsconfigjson) |
| `tsconfig.test.json` | TypeScript test configuration | [Test TypeScript Config](#tsconfigtestjson) |
| `jest.config.js` | Jest testing framework | [Jest Configuration](#jestconfigjs) |
| `jest.setup.js` | Jest setup and globals | [Jest Setup](#jestsetupjs) |
| `eslint.config.js` | ESLint code linting | [ESLint Configuration](#eslintconfigjs) |
| `hardhat.config.cjs` | Hardhat blockchain development | [Hardhat Configuration](#hardhatconfigcjs) |
| `deployment.json` | Deployment configuration | [Deployment Config](#deploymentjson) |
| `openapi.json` | OpenAPI/Swagger specification | [API Specification](#openapijson) |
| `Dockerfile` | Docker container configuration | [Docker Configuration](#dockerfile) |
| `.env` | Environment variables | [Environment Variables](#environment-variables) |

---

## 📦 package.json

**Purpose:** Defines project metadata, dependencies, and npm scripts.

### Key Sections

#### Scripts
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "start:prod": "tsx src/index.ts",
    "dev": "cross-env NODE_ENV=development tsx watch src/index.ts",
    "prod": "cross-env NODE_ENV=production tsx src/index.ts",
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:watch": "node --experimental-vm-modules node_modules/jest/bin/jest.js --watch",
    "test:coverage": "node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage",
    "test:ci": "node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage --passWithNoTests",
    "compile": "hardhat compile --config hardhat.config.cjs",
    "deploy:contracts": "tsx scripts/deploy-contracts.ts",
    "openapi:generate": "tsx scripts/generate-openapi.ts",
    "lint": "eslint src/**/*.ts",
    "security:audit": "pnpm audit --audit-level=moderate"
  }
}
```

#### Dependencies
- **Production:** Express, Supabase, Ethers.js, bcrypt, JWT, etc.
- **Development:** TypeScript, Jest, Hardhat, ESLint, tsx, etc.

### Common Commands
```bash
# Development
pnpm install --frozen-lockfile  # Install dependencies
pnpm run dev                    # Start dev server with watch mode
pnpm run build                  # Build for production
pnpm start                      # Start production server

# Testing
pnpm test                       # Run tests
pnpm run test:watch             # Watch mode
pnpm run test:coverage          # With coverage
pnpm run test:ci                # CI mode with coverage

# Blockchain
pnpm run compile                # Compile smart contracts
pnpm run deploy:contracts       # Deploy contracts
pnpm run deploy:contracts:dev   # Deploy to local network
pnpm run deploy:contracts:prod  # Deploy to production network

# Code Quality
pnpm run lint                   # Run linter
pnpm exec tsc --noEmit          # Type check without output
pnpm run security:audit         # Security audit
```

---

## 🔧 tsconfig.json

**Purpose:** TypeScript compiler configuration for production code.

### Key Settings

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "src/__tests__/**"]
}
```

### What It Does
- Compiles TypeScript to JavaScript
- Enforces strict type checking
- Outputs to `dist/` folder
- Excludes test files from production build

---

## 🧪 tsconfig.test.json

**Purpose:** TypeScript configuration for test files.

### Key Differences from Production Config
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node", "jest", "@types/jest"],
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*.test.ts", "src/**/__tests__/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### What It Does
- Extends base TypeScript config
- Includes Jest type definitions
- Covers test files
- No compilation output (Jest handles it)

---

## 🧪 jest.config.js

**Purpose:** Jest testing framework configuration.

### Configuration
```javascript
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.test.json',
        diagnostics: {
          ignoreCodes: [151002]
        }
      }
    ]
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 30000
};
```

### Key Features
- **TypeScript Support:** Uses ts-jest with ESM preset
- **ESM Support:** Full ES modules support with proper extensions
- **Path Mapping:** `@/` alias for `src/`
- **Setup File:** Runs jest.setup.js before tests
- **Timeout:** 30 second default timeout for async tests

---

## 🔧 jest.setup.js

**Purpose:** Global test setup and configuration.

### Common Setup
```javascript
// Set test timeout
jest.setTimeout(30000);

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

// Global test utilities
global.testUtils = {
  // Add global test helpers
};

// Setup/teardown hooks
beforeAll(async () => {
  // Initialize test database
});

afterAll(async () => {
  // Cleanup
});
```

### What It Does
- Sets global test timeout
- Configures test environment variables
- Provides global test utilities
- Runs before all tests

---

## 🎨 eslint.config.js

**Purpose:** ESLint code linting and style enforcement.

### Configuration
```javascript
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'api/**/*.ts'],
    ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-namespace': 'off',
      'no-console': 'off'
    }
  }
];
```

### Key Rules
- `any` types warned (not blocked)
- Unused variables warned (with `_` prefix exception)
- Console.log allowed
- Namespaces allowed (for Express augmentation)
- Separate relaxed rules for test files

### Running ESLint
```bash
# Check for issues
pnpm run lint

# Auto-fix issues
pnpm run lint -- --fix
```

---

## ⛓️ hardhat.config.cjs

**Purpose:** Hardhat blockchain development environment configuration.

### Configuration
```javascript
require('dotenv').config();

const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY || '';
const isValidPrivateKey = /^[a-fA-F0-9]{64}$/.test(privateKey);
const accounts = isValidPrivateKey ? [privateKey] : [];

module.exports = {
  solidity: {
    version: '0.8.26',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000
      },
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    ganache: {
      url: 'http://127.0.0.1:7545',
      chainId: 1337
    },
    sepolia: {
      url: process.env.BLOCKCHAIN_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
      accounts: accounts,
      chainId: 11155111
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || `https://polygon-mainnet.infura.io/v3/${process.env.POLYGON_API_KEY || ''}`,
      accounts: accounts,
      chainId: 137
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
      accounts: accounts,
      chainId: 80002,
      gasPrice: 30000000000
    }
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  }
};
```

### Networks
- **hardhat:** Built-in Hardhat network (chainId: 31337)
- **ganache:** Local development blockchain (chainId: 1337)
- **sepolia:** Ethereum testnet (chainId: 11155111)
- **polygon:** Polygon mainnet (chainId: 137)
- **amoy:** Polygon testnet (chainId: 80002)

### Solidity Settings
- Version: 0.8.26
- Optimizer enabled with 1000 runs
- IR-based code generation enabled (viaIR)

### Commands
```bash
# Compile contracts
pnpm run compile

# Run Hardhat tests
pnpm dlx hardhat test

# Deploy contracts
pnpm run deploy:contracts
pnpm run deploy:contracts:dev    # Local network
pnpm run deploy:contracts:prod   # Production network
```

---

## 🚀 deployment.json

**Purpose:** Stores deployed contract addresses and deployment metadata.

### Structure
```json
{
  "ganache": {
    "FreelanceEscrow": "0x123...",
    "FreelanceReputation": "0x456...",
    "ContractAgreement": "0x789...",
    "deployedAt": "2024-03-06T10:00:00Z"
  },
  "sepolia": {
    "FreelanceEscrow": "0xabc...",
    "FreelanceReputation": "0xdef...",
    "deployedAt": "2024-03-06T12:00:00Z"
  }
}
```

### Usage
- Automatically updated by deployment scripts
- Used by backend to connect to contracts
- Version controlled for deployment history

---

## 📄 openapi.json

**Purpose:** OpenAPI 3.0 specification for API documentation.

### Generation
```bash
# Generate from code
pnpm run openapi:generate
```

### Usage
- Powers Swagger UI at `/api-docs`
- API client generation
- API testing tools
- Documentation

### Viewing
```
http://localhost:7860/api-docs
```

---

## 🐳 Dockerfile

**Purpose:** Docker container configuration for deployment.

### Multi-stage Build
```dockerfile
# Build stage
FROM node:20-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY contracts ./contracts
COPY hardhat.config.cjs ./

RUN pnpm run compile && pnpm run build

# Production stage
FROM node:20-alpine AS production

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

CMD ["node", "dist/index.js"]
```

### Building
```bash
# Build image
docker build -t freelancexchain-api:latest .

# Run container
docker run -p 7860:7860 --env-file .env freelancexchain-api:latest
```

---

## 🔐 Environment Variables

**Purpose:** Configuration through environment variables.

### Required Variables

#### Application
```env
NODE_ENV=development
PORT=7860
```

#### Database
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### Authentication
```env
JWT_SECRET=your-secret-min-32-chars
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
```

#### Blockchain
```env
BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
BLOCKCHAIN_PRIVATE_KEY=your-private-key
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-key
ETHERSCAN_API_KEY=your-etherscan-key
```

#### AI Services
```env
LLM_API_KEY=your-llm-api-key
LLM_API_URL=https://api.llm-provider.com
```

#### KYC Integration
```env
DIDIT_API_KEY=your-didit-key
DIDIT_API_URL=https://verification.didit.me
DIDIT_WEBHOOK_SECRET=your-webhook-secret
DIDIT_WORKFLOW_ID=your-workflow-id
```

### Setup
```bash
# Copy example
cp .env.example .env

# Edit with your values
nano .env
```

---

## 🛠️ Configuration Best Practices

### 1. Environment-Specific Config
- Use `.env` for local development
- Use environment variables in production
- Never commit `.env` to version control

### 2. Type Safety
- Define environment variable types in `src/config/env.ts`
- Validate on startup
- Provide clear error messages

### 3. Secrets Management
- Use secret management tools in production
- Rotate secrets regularly
- Use different secrets per environment

### 4. Documentation
- Document all configuration options
- Provide example values
- Explain required vs optional

---

## 📚 Related Documentation

- [Developer Setup Guide](docs/getting-started/setup.md)
- [Deployment Configuration](docs/guides/deployment.md)
- [Security Setup Guide](docs/security/overview.md)
- [Blockchain Integration](docs/blockchain/integration.md)

---

## 🆘 Troubleshooting

### "Module not found"
- Run `pnpm install`
- Check `tsconfig.json` paths

### "Environment variable not set"
- Check `.env` file exists
- Verify variable names match

### "TypeScript compilation errors"
- Run `pnpm exec tsc --noEmit`
- Check `tsconfig.json` settings

### "Tests failing"
- Check `jest.config.js` setup
- Verify test database configuration

---

For additional help, see [Troubleshooting Guide](docs/guides/TROUBLESHOOTING.md).
