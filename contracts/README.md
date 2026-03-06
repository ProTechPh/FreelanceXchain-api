# Smart Contracts

Solidity smart contracts for the FreelanceXchain platform blockchain integration.

## 📋 Contracts Overview

### Deployment Patterns

The contracts use two different deployment strategies:

**Singleton Contracts (One deployment per network):**
- `ContractAgreement.sol` - Single registry for all contract agreements
- `DisputeResolution.sol` - Single registry for all disputes
- `FreelanceReputation.sol` - Single registry for all reputation scores
- `MilestoneRegistry.sol` - Single registry for all milestones

These contracts are deployed once and shared across all users. They maintain registries and mappings for their respective domains.

**Per-Instance Contracts (New deployment per contract):**
- `FreelanceEscrow.sol` - Deployed individually for each freelance contract

Each freelance contract gets its own escrow instance for isolated fund management and security.

### 🔐 FreelanceEscrow.sol
**Purpose:** Manages escrow functionality for secure payment handling between clients and freelancers.

**Key Features:**
- Holds funds in escrow until work is completed
- Supports milestone-based payments
- Automatic fund release upon approval
- Refund mechanism for disputes

**Main Functions:**
- `depositFunds()` - Client deposits payment into escrow
- `releaseFunds()` - Release funds to freelancer upon completion
- `refund()` - Return funds to client if needed
- `getBalance()` - Check escrow balance

---

### 📝 ContractAgreement.sol
**Purpose:** Manages contract agreements and terms between parties.

**Key Features:**
- Store contract terms on-chain
- Track contract status (pending, active, completed, cancelled)
- Immutable agreement records
- Multi-party signature support

**Main Functions:**
- `createAgreement()` - Create new contract agreement
- `signAgreement()` - Party signs the agreement
- `getAgreement()` - Retrieve agreement details
- `updateStatus()` - Update contract status

---

### ⚖️ DisputeResolution.sol
**Purpose:** Handles dispute resolution between clients and freelancers.

**Key Features:**
- Dispute filing and tracking
- Evidence submission
- Arbitrator assignment
- Resolution enforcement

**Main Functions:**
- `fileDispute()` - File a new dispute
- `submitEvidence()` - Submit evidence for dispute
- `resolveDispute()` - Arbitrator resolves dispute
- `getDisputeDetails()` - Retrieve dispute information

---

### ⭐ FreelanceReputation.sol
**Purpose:** Manages reputation scores and ratings for users.

**Key Features:**
- On-chain reputation tracking
- Rating submission and verification
- Weighted scoring algorithm
- Historical rating records

**Main Functions:**
- `submitRating()` - Submit rating for a user
- `getReputationScore()` - Get user's reputation score
- `getRatingHistory()` - View rating history
- `updateReputation()` - Update reputation based on new ratings

---

### 📊 MilestoneRegistry.sol
**Purpose:** Tracks project milestones and their completion status.

**Key Features:**
- Milestone creation and tracking
- Completion verification
- Payment trigger integration
- Progress monitoring

**Main Functions:**
- `createMilestone()` - Create new milestone
- `completeMilestone()` - Mark milestone as complete
- `approveMilestone()` - Client approves milestone
- `getMilestoneStatus()` - Check milestone status

---

## 🚀 Deployment

### Prerequisites
- Node.js v18+ and pnpm
- Hardhat development environment
- Local blockchain (Ganache) or testnet access
- Private key with sufficient funds for gas

### Deploy All Contracts
```bash
# Deploy to local Ganache
node scripts/deployment/deploy-all.cjs

# Deploy specific contract
node scripts/deployment/deploy-escrow.cjs
```

### Configuration
Set environment variables in `.env`:
```env
BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
BLOCKCHAIN_PRIVATE_KEY=your_private_key_here
```

## 🧪 Testing

Run contract tests:
```bash
# Run all contract tests
npm test

# Run specific contract tests
npm test -- FreelanceEscrow

# With coverage
npm run test:coverage
```

## 📦 Compilation

Compile contracts using Hardhat:
```bash
# Compile all contracts
npx hardhat compile

# Clean and recompile
npx hardhat clean
npx hardhat compile
```

Compiled artifacts are stored in:
- `artifacts/contracts/` - ABI and bytecode
- `cache/` - Compilation cache

## 🔗 Contract Interactions

### From Backend API
The backend interacts with contracts through the blockchain service:
```typescript
import { blockchainService } from './services/blockchain';

// Example: Create escrow
await blockchainService.createEscrow(contractId, amount);

// Example: Release payment
await blockchainService.releaseFunds(escrowId);
```

### Direct Interaction
Using ethers.js:
```javascript
const contract = new ethers.Contract(address, abi, signer);
await contract.depositFunds({ value: ethers.parseEther("1.0") });
```

## 🔒 Security Considerations

- **Access Control:** All contracts implement role-based access control
- **Reentrancy Protection:** Critical functions use reentrancy guards
- **Input Validation:** All inputs are validated before processing
- **Event Logging:** All state changes emit events for transparency
- **Upgrade Strategy:** Contracts use proxy pattern for upgradeability

## 📚 Related Documentation

- [Blockchain Integration Guide](../docs/blockchain/integration.md)
- [Blockchain Testing Guide](../docs/blockchain/testing.md)
- [Deployment Scripts](../scripts/deployment/)
- [Smart Contract Security](../docs/security/smart-contracts.md)

## 🛠️ Development

### Adding New Contracts

1. Create new `.sol` file in this directory
2. Implement contract with proper documentation
3. Add deployment script in `scripts/deployment/`
4. Write comprehensive tests in `src/__tests__/`
5. Update this README with contract details

### Best Practices

- Follow Solidity style guide
- Use latest stable Solidity version
- Include NatSpec comments
- Emit events for all state changes
- Implement access control
- Add reentrancy guards where needed
- Write comprehensive tests (>90% coverage)

## 📄 License

These contracts are part of the FreelanceXchain platform. See LICENSE file for details.
