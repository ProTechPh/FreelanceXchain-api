# Blockchain Adapter Pattern

This directory contains the blockchain adapter pattern implementation that provides a unified interface for both real and simulated blockchain operations.

## Architecture

The adapter pattern allows the application to switch between real blockchain (Web3) and simulated blockchain (Appwrite) implementations without changing business logic code.

```
blockchain/
├── adapter.ts           # Interface definition
├── real-adapter.ts      # Real blockchain implementation (Web3)
├── simulated-adapter.ts # Simulated blockchain implementation (Appwrite)
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

# Use simulated blockchain (uses Appwrite, no blockchain required)
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

- Uses `escrow-contract.ts` which stores data in Appwrite
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

## Simulated vs. Real Behavioral Parity

Audited 2026-08-11 against `contracts/FreelanceEscrow.sol`. The simulated
adapter is a **behavioral emulation**, not a bit-for-bit mirror. Known
divergences:

### 1. `submitMilestone` — simulated is a no-op

The simulated adapter returns a fake receipt without changing ledger state
(milestones are treated as auto-submitted). The real adapter calls the
contract's `submitMilestone`, which is `onlyFreelancer`. The API service layer
**never calls `adapter.submitMilestone`** — it only writes the milestone
registry via `submitMilestoneToRegistry`. Consequently, on a real chain,
milestones only become on-chain `Submitted` if the freelancer's own wallet
calls the escrow directly (client-side). If that never happens, real-mode
`approveMilestone` reverts with `MilestoneNotSubmitted`. Simulated mode hides
this because its ledger has no `Submitted` state.

### 2. `refundEscrow` — skip vs. revert on non-pending milestones

- Real: `cancelContract` **reverts** (`CannotCancelSubmittedOrDisputed`) if any
  milestone is on-chain `Submitted` or `Disputed`; refunds the accounting
  remainder `totalAmount - releasedAmount - refundedAmount` in one transfer and
  deactivates the contract.
- Simulated: refunds only ledger-`pending` milestones, **silently skipping**
  others, and returns the last receipt hash.

The DB layer already blocks refunds while a milestone is `disputed` (BLF-3.4),
so the practical divergence is limited to milestones a client submitted
on-chain directly. Both paths are safe: real fails closed (rollback), simulated
completes the DB-requested refund.

### 3. `getEscrowInfo.isActive` — balance-derived vs. on-chain flag

- Real: `isActive` is the contract's own flag, set `false` when
  `releasedAmount + refundedAmount >= totalAmount` (even if `balance` is
  nonzero, e.g. force-sent ETH or pending pull-payment withdrawals).
- Simulated: `isActive = balance > 0`.

These agree on the happy path (all funds released/refunded ⇒ balance 0) and
can diverge on edge cases (donated ETH, pending dispute withdrawals).

### 4. Milestone index mapping — consistent

Both adapters address milestones by **array index**, and the escrow is deployed
with `project.milestones` order (`initializeContractEscrow`), so DB index ==
on-chain index as long as the project milestone array is never reordered. The
refund flows (`refundMilestone`, `approveMilestone`, `getMilestone`) rely on
this invariant.

### 5. Dispute lifecycle — ledger vs. DB

The simulated ledger has no `Disputed` state (`disputeMilestone` is a no-op;
`getMilestone` maps unknown ledger states to `Pending`). Disputes are tracked
in the DB. Real mode records `Disputed` on-chain so the arbiter can call
`resolveDispute`. `resolveDispute` itself is branch-parity: `10000` bps →
release, `0` bps → refund, otherwise split — matching the contract's
`freelancerBps` semantics.

## Benefits

1. **Flexibility** - Switch between real and simulated blockchain without code changes
2. **Testability** - Easy to test with simulated blockchain
3. **Development Speed** - No blockchain setup required for development
4. **Production Ready** - Seamless transition to real blockchain for production
5. **Type Safety** - Single interface ensures consistent API across implementations
