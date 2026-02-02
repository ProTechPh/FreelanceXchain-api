# Blockchain Integration Guide

This guide explains how to use the real blockchain integration for storing data on-chain in the FreelanceXchain platform.

## Overview

The blockchain integration connects the FreelanceXchain API to Ethereum-compatible blockchains (Sepolia, Polygon, Ganache, etc.) to store critical data immutably on-chain:

- **Reputation System**: Ratings and reviews stored on-chain
- **Escrow Contracts**: Milestone-based payment escrow
- **Contract Agreements**: Immutable contract terms and signatures
- **Dispute Resolution**: On-chain dispute handling
- **Milestone Registry**: Project milestone tracking

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  (Services: reputation-service, contract-service, etc.)      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Blockchain Integration Layer                    │
│  - reputation-blockchain.ts                                  │
│  - escrow-blockchain.ts                                      │
│  - agreement-blockchain.ts                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Web3 Client Layer                         │
│  (web3-client.ts - ethers.js wrapper)                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Ethereum-Compatible Blockchain                  │
│  (Sepolia, Polygon, Ganache, etc.)                          │
└─────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Install Dependencies

Dependencies are already included in `package.json`:
- `ethers` - Ethereum library for blockchain interaction
- `hardhat` - Smart contract development environment

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Blockchain RPC URL (choose one)
BLOCKCHAIN_RPC_URL=https://sepolia.infura.io/v3/your-infura-project-id
# or for local development:
# BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545

# Private key for deploying contracts and signing transactions
BLOCKCHAIN_PRIVATE_KEY=your-private-key-here

# Contract addresses (filled after deployment)
GANACHE_REPUTATION_ADDRESS=0x...
GANACHE_AGREEMENT_ADDRESS=0x...
# ... etc
```

### 3. Compile Smart Contracts

```bash
cd FreelanceXchain-api
pnpm compile
```

This compiles the Solidity contracts and generates ABIs in the `artifacts/` directory.

### 4. Deploy Smart Contracts

Deploy to your chosen network:

```bash
# Make sure your .env is configured with BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY
# Then deploy:
pnpm deploy:contracts
```

For local Ganache testing, set in your `.env`:
```bash
BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
BLOCKCHAIN_PRIVATE_KEY=<your-ganache-private-key>
```

The deployment script will:
1. Deploy all smart contracts
2. Display contract addresses
3. Save addresses to the configuration
4. Show environment variables to add to `.env`

**Important**: Copy the displayed contract addresses to your `.env` file!

## Usage

### Reputation System

```typescript
import {
  submitRatingToBlockchain,
  getRatingsFromBlockchain,
  getAverageRating,
} from './services/reputation-blockchain.js';

// Submit a rating
const result = await submitRatingToBlockchain({
  contractId: 'contract-123',
  rateeAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  rating: 5,
  comment: 'Excellent work!',
  isEmployerRating: true,
});

console.log('Rating submitted:', result.transactionHash);

// Get user ratings
const ratings = await getRatingsFromBlockchain('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');

// Get average rating
const avgRating = await getAverageRating('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
console.log('Average rating:', avgRating); // e.g., 4.75
```

### Escrow System

```typescript
import {
  deployEscrowContract,
  submitMilestone,
  approveMilestone,
  getEscrowInfo,
} from './services/escrow-blockchain.js';
import { parseEther } from 'ethers';

// Deploy escrow contract
const escrow = await deployEscrowContract({
  contractId: 'contract-123',
  freelancerAddress: '0x...',
  arbiterAddress: '0x...',
  milestoneAmounts: [parseEther('1.0'), parseEther('2.0')],
  milestoneDescriptions: ['Design phase', 'Development phase'],
  totalAmount: parseEther('3.0'),
});

console.log('Escrow deployed at:', escrow.escrowAddress);

// Freelancer submits milestone
await submitMilestone(escrow.escrowAddress, 0);

// Employer approves and releases payment
await approveMilestone(escrow.escrowAddress, 0);

// Get escrow info
const info = await getEscrowInfo(escrow.escrowAddress);
console.log('Released amount:', info.releasedAmount);
```

### Agreement System

```typescript
import {
  createAgreementOnBlockchain,
  signAgreement,
  getAgreementFromBlockchain,
} from './services/agreement-blockchain.js';
import { parseEther } from 'ethers';

// Create agreement (employer)
const agreement = await createAgreementOnBlockchain({
  contractId: 'contract-123',
  employerWallet: '0x...',
  freelancerWallet: '0x...',
  totalAmount: parseEther('5.0'),
  milestoneCount: 3,
  terms: {
    projectTitle: 'Website Development',
    description: 'Build a responsive website',
    milestones: [
      { title: 'Design', amount: 1000 },
      { title: 'Development', amount: 3000 },
      { title: 'Testing', amount: 1000 },
    ],
    deadline: '2024-12-31',
  },
});

// Freelancer signs agreement
await signAgreement('contract-123');

// Retrieve agreement
const stored = await getAgreementFromBlockchain('contract-123');
console.log('Agreement status:', stored?.status);
```

## Network Configuration

The system automatically detects the network from `BLOCKCHAIN_RPC_URL`:

- `http://127.0.0.1:7545` → Ganache (local)
- `http://127.0.0.1:8545` → Hardhat (local)
- `sepolia.infura.io` → Sepolia testnet
- `polygon-mumbai.infura.io` → Mumbai testnet
- `polygon-mainnet.infura.io` → Polygon mainnet

Contract addresses are managed per network in `src/config/contracts.ts`.

## Testing

### Local Testing with Ganache

1. Install and start Ganache:
```bash
npm install -g ganache
ganache --port 7545
```

2. Configure `.env`:
```bash
BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
BLOCKCHAIN_PRIVATE_KEY=<private-key-from-ganache>
```

3. Deploy contracts:
```bash
pnpm deploy:contracts:ganache
```

4. Run your application:
```bash
pnpm dev
```

### Testnet Testing (Sepolia)

1. Get Sepolia ETH from faucet: https://sepoliafaucet.com/
2. Configure `.env` with Sepolia RPC URL and your private key
3. Deploy contracts: `pnpm deploy:contracts`
4. Test your application

## Smart Contracts

### FreelanceReputation.sol
- Stores ratings and reviews immutably
- Prevents duplicate ratings per contract
- Calculates aggregate scores on-chain
- Events: `RatingSubmitted`

### FreelanceEscrow.sol
- Milestone-based payment escrow
- Supports dispute resolution
- Reentrancy protection
- Events: `MilestoneApproved`, `MilestoneDisputed`, `ContractCompleted`

### ContractAgreement.sol
- Stores contract terms hash
- Tracks signatures from both parties
- Immutable agreement records
- Events: `AgreementCreated`, `AgreementSigned`

## Security Considerations

1. **Private Key Management**: Never commit private keys to version control
2. **Gas Optimization**: Contracts are optimized for gas efficiency
3. **Reentrancy Protection**: Escrow contract includes reentrancy guards
4. **Access Control**: Only authorized parties can perform actions
5. **Data Validation**: All inputs are validated on-chain

## Troubleshooting

### "Web3 is not configured"
- Ensure `BLOCKCHAIN_RPC_URL` and `BLOCKCHAIN_PRIVATE_KEY` are set in `.env`
- Verify the RPC URL is accessible

### "Contract not deployed"
- Run the deployment script: `pnpm deploy:contracts`
- Add contract addresses to `.env`

### "Insufficient funds"
- Ensure your wallet has enough ETH for gas fees
- For testnets, use faucets to get test ETH

### Transaction fails
- Check gas price and limits
- Verify contract state (e.g., milestone already approved)
- Check wallet permissions

## Migration from Simulated to Real Blockchain

The existing services (reputation-service, contract-service, etc.) can be updated to use real blockchain:

```typescript
// Before (simulated)
import { submitRatingToBlockchain } from './reputation-contract.js';

// After (real blockchain)
import { submitRatingToBlockchain } from './reputation-blockchain.js';
```

The function signatures are compatible, making migration straightforward.

## Additional Resources

- [Ethers.js Documentation](https://docs.ethers.org/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Solidity Documentation](https://docs.soliditylang.org/)
- [Infura](https://infura.io/) - Ethereum node provider
- [Alchemy](https://www.alchemy.com/) - Alternative node provider

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review smart contract events in block explorer
3. Check application logs for detailed error messages
