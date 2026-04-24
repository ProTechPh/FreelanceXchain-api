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

### 👥 Admin Scripts
Administrative tools for user management and system administration.

**Location:** `admin/`

- **[list-admin-users.js](admin/list-admin-users.js)** - List all admin users in the system
- **[reset-admin-password.js](admin/reset-admin-password.js)** - Reset admin user password

**Usage:**
```bash
# List admin users
node scripts/admin/list-admin-users.js

# Reset admin password
node scripts/admin/reset-admin-password.js
```

### 🛠️ Development Scripts
Development tools and utilities.

**Location:** `dev/`

- **[generate-openapi.ts](dev/generate-openapi.ts)** - Generate OpenAPI specification from Swagger config

**Usage:**
```bash
# Generate OpenAPI spec
pnpm run openapi:generate
# or
tsx scripts/dev/generate-openapi.ts
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
   - `SUPABASE_URL` - Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations
   - `BLOCKCHAIN_RPC_URL` - Blockchain RPC endpoint (default: http://127.0.0.1:7545)
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

### Admin Scripts
- Admin scripts require `SUPABASE_SERVICE_ROLE_KEY` for elevated permissions
- Use with caution in production environments
- Always backup data before running admin operations

### Development Scripts
- OpenAPI generation should be run after API changes
- Commit generated `openapi.json` to version control

## 🔗 Related Documentation

- [Blockchain Integration](../docs/blockchain/integration.md) - Blockchain setup and configuration
- [Deployment Configuration](../docs/guides/deployment.md) - Deployment guidelines
- [Developer Setup Guide](../docs/getting-started/setup.md) - Development environment setup

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

**Admin script fails with "permission denied"**
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Check user permissions in Supabase dashboard

**TypeScript script won't run**
- Use `tsx` or `ts-node` to run TypeScript files directly
- Or compile first: `tsc scripts/dev/generate-openapi.ts`
