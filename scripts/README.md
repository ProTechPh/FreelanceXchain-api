# Scripts

Utility scripts for deployment, administration, development, and testing.

## 📁 Script Categories

### 🗄️ Unified Database Setup & Restoration Script (For Panel Demo)

Single all-in-one script for creating the database, collections, attributes, indexes, and storage buckets, with optional demo seed data:

- **[setup-appwrite-db.ts](setup-appwrite-db.ts)** - All-in-one Appwrite database & storage initializer.

**Usage:**

```bash
# 1. Restore Database & Storage WITHOUT Seed (Clean Schema):
pnpm run db:restore
# or: npx tsx scripts/setup-appwrite-db.ts

# 2. Restore Database & Storage WITH Demo Seed Data:
pnpm run db:restore:seed
# or: npx tsx scripts/setup-appwrite-db.ts --seed
```

> **What gets seeded with `--seed`:**
> - 6 Active Projects with Milestones (DEX Frontend, DeFi Audit, NFT Marketplace, DAO Dashboard, Bridge UI, Yield Aggregator)
> - 6 KYC Verifications (All `APPROVED` for seamless demo bidding & escrow funding)
> - 6 Demo Users (3 Employers, 3 Freelancers)
> - 4 Freelancer Portfolio Projects
> - 10 Skills & 4 Skill Categories
> - *See [`docs/deployment/database-restoration-guide.md`](../docs/deployment/database-restoration-guide.md) for complete details.*

### 🚀 Smart Contract Deployment Scripts

- **[deploy-all.cjs](deployment/deploy-all.cjs)** - Deploys all 4 singleton smart contracts (`ContractAgreement`, `FreelanceReputation`, `DisputeResolution`, `MilestoneRegistry`) sequentially to Ganache, Polygon Amoy Testnet, or Polygon Mainnet (Production).

**Usage:**

```bash
# 1. Deploy to Ganache (Local Demo / Panel Defense):
pnpm run deploy:contracts:ganache
# or: pnpm run deploy:local

# 2. Deploy to Polygon Amoy Testnet:
pnpm run deploy:contracts:amoy

# 3. Deploy to Polygon Mainnet (Production):
pnpm run deploy:contracts:prod
```

> **Full Documentation:** See [`docs/deployment/smart-contract-deployment-guide.md`](../docs/deployment/smart-contract-deployment-guide.md).

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

- Use `tsx` to run TypeScript files directly via `pnpm run db:restore`
