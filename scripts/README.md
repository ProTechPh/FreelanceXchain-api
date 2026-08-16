# Scripts

Utility scripts for deployment, administration, development, and testing.

## 📁 Script Categories

### 🚀 Deployment Scripts

Scripts for deploying smart contracts to blockchain networks.

**Location:** `deployment/`

- **[deploy-all.cjs](deployment/deploy-all.cjs)** - Deploy all smart contracts sequentially to Ganache
- **[deploy-contracts.ts](deployment/deploy-contracts.ts)** - TypeScript deployment script for contracts
- **[deploy-escrow.cjs](deployment/deploy-escrow.cjs)** - Deploy escrow contract specifically
- **[deploy.cjs](deployment/deploy.cjs)** - General deployment script

**Usage:**

```bash
# Deploy all contracts
node scripts/deployment/deploy-all.cjs

# Deploy specific contract
node scripts/deployment/deploy-escrow.cjs
```

### 🛠️ Development Scripts

Development tools and utilities.

**Location:** `dev/`

- **[generate-openapi.ts](generate-openapi.ts)** - Regenerate `openapi.json` from the canonical base spec
- **[check-openapi.ts](check-openapi.ts)** - CI drift check: fail when committed `openapi.json` differs from the regenerated spec
- **[check-markdown-links.ts](check-markdown-links.ts)** - CI link check: fail on any broken internal relative link in markdown files

**Usage:**

```bash
# Regenerate the served OpenAPI spec (reads openapi.base.json + middleware schemas)
pnpm run openapi:generate
# or
tsx scripts/generate-openapi.ts

# Verify the committed spec is in sync (runs in CI)
pnpm run openapi:check

# Verify no markdown file links to a missing file/directory (runs in CI)
pnpm run docs:check
```

### 🧪 Testing Scripts

Testing utilities and workflow scripts.

**Location:** `testing/`

- **[test-workflow.cjs](testing/test-workflow.cjs)** - End-to-end workflow testing script

**Usage:**

```bash
# Run workflow tests
node scripts/testing/test-workflow.cjs
```

## 🔧 Prerequisites

Before running scripts, ensure you have:

1. **Environment Variables** - Copy `.env.example` to `.env` and configure:
   - `APPWRITE_ENDPOINT` - Appwrite API endpoint
   - `APPWRITE_PROJECT_ID` - Appwrite project ID
   - `APPWRITE_API_KEY` - Appwrite API key
   - `BLOCKCHAIN_RPC_URL` - Blockchain RPC endpoint (default: <http://127.0.0.1:7545>)
   - `BLOCKCHAIN_PRIVATE_KEY` - Private key for contract deployment

2. **Dependencies Installed**

   ```bash
   pnpm install
   ```

3. **Blockchain Node Running** (for deployment scripts)

   ```bash
   # Start Ganache or your preferred local blockchain
   ganache-cli -p 7545
   ```

## 📝 Script Conventions

- **`.cjs`** - CommonJS modules (Node.js require syntax)
- **`.js`** - ES modules (import/export syntax)
- **`.ts`** - TypeScript files (requires compilation or ts-node)

## 🚨 Important Notes

### Deployment Scripts

- Always test on local blockchain (Ganache) before deploying to testnet/mainnet
- Keep private keys secure and never commit them to version control
- Verify contract addresses after deployment

### Development Scripts

- OpenAPI generation should be run after API changes
- `openapi.base.json` is the canonical, hand-maintained spec; `openapi.json` is a generated artifact of it plus the validation-middleware schemas
- Commit both `openapi.base.json` and the generated `openapi.json` to version control
- CI runs `pnpm run openapi:check`, which fails on any semantic drift — make hand-edits in the base and regenerate, never edit `openapi.json` directly

## 🔗 Related Documentation

- [Blockchain Integration](../docs/blockchain/integration.md) - Blockchain setup and configuration
- [Deployment Configuration](../docs/deployment/configuration.md) - Deployment guidelines
- [Developer Setup Guide](../docs/deployment/setup.md) - Development environment setup

## 📦 Adding New Scripts

When adding new scripts:

1. Place in the appropriate category folder
2. Add clear comments and usage instructions in the script
3. Update this README with script description and usage
4. Follow existing naming conventions
5. Include error handling and validation

## 🆘 Troubleshooting

**Script fails with "Cannot find module"**

- Run `pnpm install` to ensure all dependencies are installed

**Deployment fails with "insufficient funds"**

- Ensure your wallet has enough ETH/tokens for gas fees
- Check blockchain connection and RPC URL

**TypeScript script won't run**

- Use `tsx` or `ts-node` to run TypeScript files directly
- Or compile first: `tsc scripts/generate-openapi.ts`
