# Blockchain Adapter Pattern

This directory contains the blockchain adapter pattern implementation that provides a unified interface for both real and simulated blockchain operations.

## Architecture

The adapter pattern allows the application to switch between real blockchain (Web3) and simulated blockchain (Supabase) implementations without changing business logic code.

```
blockchain/
├── adapter.ts           # Interface definition
├── real-adapter.ts      # Real blockchain implementation (Web3)
├── simulated-adapter.ts # Simulated blockchain implementation (Supabase)
├── factory.ts           # Adapter factory and singleton
└── index.ts            # Exports
```

## Usage

### Basic Usage

```typescript
import { getBlockchainAdapter } from './services/blockchain';

// Get the configured adapter (real or simulated based on BLOCKCHAIN_MODE)
const blockchain = getBlockchainAdapter();

// Deploy escrow contract
const result = await blockchain.deployEscrowContract({
  contractId: 'contract-123',
  employerAddress: '0x...',
  freelancerAddress: '0x...',
  arbiterAddress: '0x...',
  milestoneAmounts: [BigInt(1000), BigInt(2000)],
  milestoneDescriptions: ['Milestone 1', 'Milestone 2'],
  totalAmount: BigInt(3000),
});

// Get escrow info
const info = await blockchain.getEscrowInfo(result.escrowAddress);

// Approve milestone
await blockchain.approveMilestone(result.escrowAddress, 0);
```

### Configuration

Set the `BLOCKCHAIN_MODE` environment variable:

```bash
# Use real blockchain (requires BLOCKCHAIN_RPC_URL and BLOCKCHAIN_PRIVATE_KEY)
BLOCKCHAIN_MODE=real

# Use simulated blockchain (uses Supabase, no blockchain required)
BLOCKCHAIN_MODE=simulated
```

Defaults to `simulated` if not specified.

## Adapter Interface

The `IBlockchainAdapter` interface defines the following operations:

- `isAvailable()` - Check if blockchain is configured/available
- `deployEscrowContract()` - Deploy new escrow contract
- `getEscrowInfo()` - Get escrow contract information
- `submitMilestone()` - Submit milestone for approval
- `approveMilestone()` - Approve milestone and release payment
- `disputeMilestone()` - Dispute a milestone
- `resolveDispute()` - Resolve dispute (arbiter only)
- `refundEscrow()` - Refund escrow to employer
- `getMilestone()` - Get milestone information
- `getEscrowBalance()` - Get escrow balance

## Implementations

### Real Blockchain Adapter

- Uses `escrow-blockchain.ts` which interacts with deployed smart contracts via Web3
- Requires `BLOCKCHAIN_RPC_URL` and `BLOCKCHAIN_PRIVATE_KEY` environment variables
- Transactions are recorded on the actual blockchain network
- Gas fees apply

### Simulated Blockchain Adapter

- Uses `escrow-contract.ts` which stores data in Supabase
- No blockchain configuration required
- Instant transactions (no mining/confirmation delays)
- No gas fees
- Perfect for development and testing

## Factory Pattern

The factory provides a singleton instance of the appropriate adapter:

```typescript
import { getBlockchainAdapter, getBlockchainMode } from './services/blockchain';

// Get current mode
const mode = getBlockchainMode(); // 'real' | 'simulated'

// Get singleton adapter instance
const adapter = getBlockchainAdapter();

// Reset adapter (useful for testing)
resetBlockchainAdapter();
```

## Migration Guide

### Old Code (Direct Import)

```typescript
import { deployEscrowContract } from './services/escrow-blockchain';

const result = await deployEscrowContract({...});
```

### New Code (Adapter Pattern)

```typescript
import { getBlockchainAdapter } from './services/blockchain';

const blockchain = getBlockchainAdapter();
const result = await blockchain.deployEscrowContract({...});
```

## Benefits

1. **Flexibility** - Switch between real and simulated blockchain without code changes
2. **Testability** - Easy to test with simulated blockchain
3. **Development Speed** - No blockchain setup required for development
4. **Production Ready** - Seamless transition to real blockchain for production
5. **Type Safety** - Single interface ensures consistent API across implementations
