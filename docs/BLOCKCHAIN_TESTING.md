# Blockchain Testing Guide

## Overview

This document describes the testing strategy for the blockchain integration layer of the FreelanceXchain platform. The blockchain functionality includes smart contract interactions for reputation, escrow, and agreement management.

## Test Structure

### Test Files

The blockchain tests are organized in the following structure:

```
src/services/__tests__/
├── web3-client.test.ts           # Web3/Ethereum client tests
├── reputation-blockchain.test.ts  # Reputation system tests
├── escrow-blockchain.test.ts     # Escrow contract tests
└── agreement-blockchain.test.ts  # Agreement contract tests
```

## Test Coverage

### 1. Web3 Client Tests (`web3-client.test.ts`)

Tests the core Ethereum blockchain client functionality:

- **Provider Management**
  - Creating and caching provider instances
  - Connecting to RPC endpoints
  - Network information retrieval

- **Wallet Operations**
  - Wallet creation and management
  - Balance queries
  - Transaction signing

- **Transaction Handling**
  - Sending transactions
  - Transaction status tracking
  - Gas estimation
  - Transaction receipts

- **Utility Functions**
  - ETH/Wei conversions
  - Address validation
  - Message signing and verification

### 2. Reputation Blockchain Tests (`reputation-blockchain.test.ts`)

Tests the on-chain reputation system:

- **Rating Submission**
  - Submit ratings to blockchain
  - Validate rating constraints (1-5 scale)
  - Handle duplicate rating prevention
  - Event emission verification

- **Rating Retrieval**
  - Get all ratings for a user
  - Get ratings given by a user
  - Calculate average ratings
  - Get rating counts

- **Rating Verification**
  - Check if user has rated for specific contract
  - Verify rating authenticity
  - Get total system ratings

### 3. Escrow Blockchain Tests (`escrow-blockchain.test.ts`)

Tests the escrow smart contract functionality:

- **Contract Deployment**
  - Deploy new escrow contracts
  - Initialize with milestones
  - Fund escrow with ETH

- **Milestone Management**
  - Submit milestones for approval
  - Approve and release payments
  - Dispute milestones
  - Refund milestones

- **Dispute Resolution**
  - Arbiter dispute resolution
  - Payment distribution based on resolution

- **Contract Lifecycle**
  - Get escrow information
  - Check balances
  - Cancel contracts
  - Track milestone statuses

### 4. Agreement Blockchain Tests (`agreement-blockchain.test.ts`)

Tests the contract agreement system:

- **Hash Generation**
  - Generate contract ID hashes
  - Generate terms hashes
  - Ensure hash consistency

- **Agreement Creation**
  - Create agreements on blockchain
  - Store agreement terms
  - Initialize agreement state

- **Agreement Lifecycle**
  - Sign agreements (freelancer acceptance)
  - Complete agreements
  - Dispute agreements
  - Cancel agreements

- **Agreement Verification**
  - Verify agreement terms
  - Check signature status
  - Validate agreement state

## Testing Strategy

### Mocking Approach

The tests use Jest mocks to isolate blockchain functionality:

```typescript
// Mock web3-client
jest.mock('../web3-client.js', () => ({
  getContract: mockGetContract,
  getContractWithSigner: mockGetContractWithSigner,
  isWeb3Available: mockIsWeb3Available,
}));

// Mock contract configuration
jest.mock('../../config/contracts.js', () => ({
  getContractAddress: jest.fn().mockReturnValue('0xContractAddress'),
}));
```

### Test Data

Tests use realistic blockchain data:

- **Addresses**: Valid Ethereum address format (0x...)
- **Amounts**: BigInt values representing Wei
- **Hashes**: 32-byte hex strings for transaction hashes
- **Timestamps**: Unix timestamps as BigInt

### Assertions

Tests verify:

1. **Function Calls**: Correct contract methods are called with proper parameters
2. **Return Values**: Expected data structures and values are returned
3. **Error Handling**: Appropriate errors are thrown for invalid inputs
4. **State Changes**: Contract state is updated correctly

## Running Tests

### Run All Blockchain Tests

```bash
npm test -- --testPathPattern="blockchain"
```

### Run Specific Test Suite

```bash
# Web3 client tests
npm test -- web3-client.test.ts

# Reputation tests
npm test -- reputation-blockchain.test.ts

# Escrow tests
npm test -- escrow-blockchain.test.ts

# Agreement tests
npm test -- agreement-blockchain.test.ts
```

### Run with Coverage

```bash
npm test -- --coverage --testPathPattern="blockchain"
```

## Test Scenarios

### Happy Path Tests

- Successful contract deployment
- Valid transaction execution
- Correct data retrieval
- Proper event emission

### Error Handling Tests

- Web3 not configured
- Invalid input parameters
- Contract not deployed
- Transaction failures
- Network errors

### Edge Cases

- Zero amounts
- Empty arrays
- Non-existent contracts
- Duplicate operations
- Boundary values (min/max ratings)

## Best Practices

### 1. Isolation

Each test should be independent and not rely on other tests:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  // Reset mocks to clean state
});
```

### 2. Realistic Data

Use realistic blockchain data formats:

```typescript
const mockReceipt = {
  hash: '0xTxHash',
  blockNumber: 100,
  gasUsed: BigInt('21000'),
  status: 1,
};
```

### 3. Comprehensive Coverage

Test all code paths:
- Success cases
- Error cases
- Edge cases
- Validation logic

### 4. Clear Assertions

Use descriptive assertions:

```typescript
expect(result.transactionHash).toBe('0xTxHash');
expect(result.agreement.status).toBe(1); // signed
expect(mockContract.submitRating).toHaveBeenCalledWith(
  '0xRatee',
  5,
  'Excellent work!',
  'contract-123',
  true
);
```

## Continuous Integration

### Pre-commit Checks

Run tests before committing:

```bash
npm test
```

### CI Pipeline

Tests run automatically on:
- Pull requests
- Merges to main branch
- Release builds

## Troubleshooting

### Common Issues

1. **Mock Not Working**
   - Ensure mocks are defined before imports
   - Check mock return values match expected types
   - Verify jest.clearAllMocks() in beforeEach

2. **Async Test Failures**
   - Use async/await properly
   - Ensure promises are resolved
   - Check timeout settings

3. **Type Errors**
   - Verify BigInt usage
   - Check address formats
   - Validate mock data structures

### Debug Mode

Run tests with verbose output:

```bash
npm test -- --verbose --testPathPattern="blockchain"
```

## Future Improvements

1. **Integration Tests**: Add tests that interact with local blockchain (Hardhat/Ganache)
2. **Gas Optimization Tests**: Verify gas usage is within acceptable limits
3. **Security Tests**: Test for common smart contract vulnerabilities
4. **Performance Tests**: Measure transaction throughput and latency
5. **End-to-End Tests**: Test complete user workflows involving blockchain

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Ethers.js Documentation](https://docs.ethers.org/)
- [Hardhat Testing Guide](https://hardhat.org/tutorial/testing-contracts)
- [Smart Contract Testing Best Practices](https://consensys.github.io/smart-contract-best-practices/)

## Conclusion

The blockchain testing suite provides comprehensive coverage of all blockchain integration functionality. Tests are designed to be fast, reliable, and maintainable while ensuring the blockchain layer works correctly in isolation from external dependencies.
