# Smart Contract Deployment & Recovery Guide

This guide details how to deploy, configure, and restore the FreelanceXchain smart contracts across **Ganache (Local Demo / Panel Defense)**, **Amoy (Polygon Testnet)**, and **Polygon Mainnet (Production)**.

---

## 🎯 Panel Defense Quick Reference

During a thesis panel defense or technical demo, panel members often ask:

> *"How are your smart contracts deployed locally for this demo, and how is it transitioned to the live blockchain (Production/Polygon)?"*

### Cheat Sheet Commands

| Environment | Target Network | Command | Description |
| :--- | :--- | :--- | :--- |
| **Local Demo (Panel)** | **Ganache** (Port 7545) | `pnpm run deploy:contracts:ganache` | Deploys all 4 singleton contracts to local Ganache, saves to `scripts/deployment.json`, and updates `GANACHE_*` in `.env`. |
| **Polygon Testnet** | **Amoy** (Chain ID 80002) | `pnpm run deploy:contracts:amoy` | Deploys all 4 singleton contracts to Polygon Amoy Testnet and updates `AMOY_*` in `.env`. |
| **Production** | **Polygon Mainnet** (Chain ID 137) | `pnpm run deploy:contracts:prod` | Deploys all 4 singleton contracts to Polygon Mainnet and updates `POLYGON_*` in `.env`. |

---

## 🏗️ Architecture & Deployment Model

FreelanceXchain uses a hybrid smart contract architecture:

### 1. Singleton Contracts (Deployed Once Per Network)

These contracts maintain global registries and mappings across all users on that network:

1. **`ContractAgreement.sol`**: Immutable on-chain agreements between employers and freelancers, tracking signatures and terms.
2. **`FreelanceReputation.sol`**: On-chain reputation scores, feedback validation, and weighted scoring linked to verified completed agreements.
3. **`DisputeResolution.sol`**: On-chain dispute filing, evidence hashing, and arbitrator rulings.
4. **`MilestoneRegistry.sol`**: On-chain milestone progress tracking and payment completion sign-offs.

### 2. Per-Instance Contract (Deployed On-Demand)

- **`FreelanceEscrow.sol`**: Deployed individually per project whenever an employer funds a contract escrow. It isolates escrowed funds into dedicated contract addresses for fund security.

---

## 💻 Local Demo Deployment (Ganache)

### Prerequisites

1. **Ganache** running locally on `http://127.0.0.1:7545` (Ganache UI or `npx ganache --port 7545 --chainId 1337`).
2. Copy the private key of the first Ganache account into `.env`:

   ```env
   BLOCKCHAIN_PRIVATE_KEY=your_ganache_private_key_here
   ```

### Execution

Run from the `FreelanceXchain-api` root directory:

```bash
pnpm run deploy:contracts:ganache
```

*(Or shorthand: `pnpm run deploy:local`)*

### What Happens Automatically

1. Verifies contract compilation (automatically runs `hardhat compile` if artifacts are missing).
2. Connects to `http://127.0.0.1:7545` and checks account balance.
3. Sequentially deploys:
   - `ContractAgreement`
   - `FreelanceReputation` (linked to `ContractAgreement`)
   - `DisputeResolution`
   - `MilestoneRegistry`
4. Writes deployment summary to `scripts/deployment.json`.
5. Automatically writes the contract addresses into `.env`:

   ```env
   GANACHE_AGREEMENT_ADDRESS=0x...
   GANACHE_REPUTATION_ADDRESS=0x...
   GANACHE_DISPUTE_ADDRESS=0x...
   GANACHE_MILESTONE_ADDRESS=0x...
   BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
   BLOCKCHAIN_MODE=real
   ```

---

## 🌐 Production & Testnet Deployment (Polygon)

### 1. Polygon Amoy Testnet (Staging / Pre-Prod)

- **Chain ID:** `80002`
- **RPC URL:** `https://rpc-amoy.polygon.technology`
- **Faucet:** Obtain testnet MATIC/POL from [Polygon Faucet](https://faucet.polygon.technology/).

Deploy command:

```bash
pnpm run deploy:contracts:amoy
```

This auto-populates `.env` with:

```env
AMOY_AGREEMENT_ADDRESS=0x...
AMOY_REPUTATION_ADDRESS=0x...
AMOY_DISPUTE_ADDRESS=0x...
AMOY_MILESTONE_ADDRESS=0x...
BLOCKCHAIN_RPC_URL=https://rpc-amoy.polygon.technology
BLOCKCHAIN_MODE=real
```

---

### 2. Polygon Mainnet (Live Production)

- **Chain ID:** `137`
- **Default RPC:** `https://polygon-rpc.com` (or Infura/Alchemy RPC via `POLYGON_RPC_URL`)
- **Gas Token:** Real POL/MATIC required on deployer wallet.

Deploy command:

```bash
pnpm run deploy:contracts:prod
```

This auto-populates `.env` with:

```env
POLYGON_AGREEMENT_ADDRESS=0x...
POLYGON_REPUTATION_ADDRESS=0x...
POLYGON_DISPUTE_ADDRESS=0x...
POLYGON_MILESTONE_ADDRESS=0x...
BLOCKCHAIN_RPC_URL=https://polygon-rpc.com
BLOCKCHAIN_MODE=real
```

---

## ⚙️ How the API Dynamically Switches Networks

The backend API automatically resolves the active network through [`src/config/contracts.ts`](../../src/config/contracts.ts):

```typescript
export function getCurrentNetwork(): NetworkName {
  const rpcUrl = config.blockchain.rpcUrl?.toLowerCase() || '';

  if (rpcUrl.includes('sepolia')) return 'sepolia';
  if (rpcUrl.includes('amoy')) return 'amoy';
  if (rpcUrl.includes('polygon') || rpcUrl.includes('matic')) return 'polygon';
  if (rpcUrl.includes('127.0.0.1:7545') || rpcUrl.includes('localhost:7545')) return 'ganache';
  if (rpcUrl.includes('127.0.0.1:8545') || rpcUrl.includes('localhost:8545')) return 'hardhat';

  return 'ganache';
}
```

Whenever `BLOCKCHAIN_RPC_URL` is set, the API loads the corresponding contract addresses (`GANACHE_*`, `AMOY_*`, or `POLYGON_*`) with zero manual code changes.

---

## 🛡️ Disaster Recovery for Live Demo

If both the database and the local blockchain are reset during the panel defense:

1. **Step 1: Re-deploy Contracts to Ganache**

   ```bash
   pnpm run deploy:contracts:ganache
   ```

2. **Step 2: Restore Database Schema & Seed Data**

   ```bash
   pnpm run db:restore:seed
   ```

3. **Step 3: Start Server**

   ```bash
   pnpm run dev
   ```

The platform will be fully online, restored, and functional within 15 seconds.
