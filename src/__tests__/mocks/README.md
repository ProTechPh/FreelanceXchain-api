# Test Mocks

Mock implementations for external services and dependencies used in tests.

## 📄 Mock Files

- **blockchain-mocks.ts** - Blockchain and smart contract mocks
- **appwrite-mocks.ts** - Appwrite database mocks
- **test-setup.ts** - Centralized test setup and configuration

---

## 🎭 Available Mocks

### Blockchain Mocks (`blockchain-mocks.ts`)

#### Mock Provider Responses
```typescript
import { mockProviderResponses } from '../mocks/blockchain-mocks.js';

// Use in tests
const balance = mockProviderResponses.balance; // 1 ETH
const network = mockProviderResponses.network; // localhost
const transaction = mockProviderResponses.transaction;
```

#### Mock Contract Responses
```typescript
import { mockContractResponses } from '../mocks/blockchain-mocks.js';

// Escrow contract mocks
const escrowId = mockContractResponses.escrow.createEscrow;
const balance = mockContractResponses.escrow.getBalance;

// Reputation contract mocks
const score = mockContractResponses.reputation.getScore;
```

#### Mock Blockchain Client
```typescript
import { mockBlockchainClient } from '../mocks/blockchain-mocks.js';

jest.mock('../../services/blockchain-client.js', () => ({
  blockchainClient: mockBlockchainClient
}));
```

---

### Appwrite Mocks (`appwrite-mocks.ts`)

#### Mock Database Operations
```typescript
import { mockAppwrite } from '../mocks/appwrite-mocks.js';

// Mock Appwrite client
jest.mock('../../config/database.js', () => ({
  appwrite: mockAppwrite
}));
```

#### Generate Mock Entities
```typescript
import { generateMockEntity } from '../mocks/appwrite-mocks.js';

const mockUser = generateMockEntity();
const mockProject = generateMockEntity();
```

#### Mock Query Responses
```typescript
// Successful query
mockAppwrite.from('users').select().returns({
  data: [mockUser],
  error: null
});

// Error response
mockAppwrite.from('users').select().returns({
  data: null,
  error: { message: 'Not found' }
});
```

---

### Test Setup (`test-setup.ts`)

#### Mock Ethers.js
```typescript
import { mockEthers } from '../mocks/test-setup.js';

jest.mock('ethers', () => mockEthers);
```

#### Mock Web3 Client
```typescript
import { mockWeb3Client } from '../mocks/test-setup.js';

jest.mock('../../services/web3-client.js', () => ({
  web3Client: mockWeb3Client
}));
```

---

## 🔧 Using Mocks in Tests

### Basic Usage

```typescript
import { jest, describe, it, expect } from '@jest/globals';
import { mockAppwrite } from '../mocks/appwrite-mocks.js';
import { mockBlockchainClient } from '../mocks/blockchain-mocks.js';

// Mock modules
jest.mock('../../config/database.js', () => ({ appwrite: mockAppwrite }));
jest.mock('../../services/blockchain-client.js', () => ({ 
  blockchainClient: mockBlockchainClient 
}));

describe('MyService', () => {
  it('should use mocked dependencies', async () => {
    // Test implementation
  });
});
```

### Custom Mock Responses

```typescript
// Override default mock behavior
mockAppwrite.from('users').select.mockResolvedValueOnce({
  data: [{ id: 'custom-id', email: 'custom@example.com' }],
  error: null
});

// Mock specific contract method
mockBlockchainClient.getContract.mockReturnValueOnce({
  createEscrow: jest.fn().mockResolvedValue('0x123...'),
});
```

### Resetting Mocks

```typescript
beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  
  // Or reset specific mocks
  mockAppwrite.from.mockClear();
  mockBlockchainClient.getContract.mockClear();
});
```

---

## 📝 Creating New Mocks

### Mock Structure

```typescript
// my-service-mocks.ts
import { jest } from '@jest/globals';

export const mockMyService = {
  method1: jest.fn().mockResolvedValue('default response'),
  method2: jest.fn().mockResolvedValue({ data: 'test' }),
  method3: jest.fn().mockRejectedValue(new Error('Mock error')),
};

export const mockMyServiceResponses = {
  success: { status: 'success', data: {} },
  error: { status: 'error', message: 'Mock error' },
};
```

### Best Practices

1. **Provide Realistic Data** - Mock responses should match real API responses
2. **Include Error Cases** - Mock both success and error scenarios
3. **Keep Mocks Simple** - Don't over-complicate mock implementations
4. **Document Mock Behavior** - Explain what each mock does
5. **Reuse Common Mocks** - Share mocks across tests

---

## 🎯 Mock Categories

### External Services
- **Blockchain** - Ethereum, smart contracts
- **Database** - Appwrite, PostgreSQL
- **AI/LLM** - OpenAI, Claude
- **KYC** - Didit verification
- **Email** - Email service providers

### Internal Services
- **Authentication** - JWT, OAuth
- **File Storage** - S3, local storage
- **Caching** - Redis, in-memory
- **Queues** - Message queues

---

## 🔍 Mock Verification

### Verify Mock Calls

```typescript
it('should call mocked service', async () => {
  await myService.doSomething();
  
  // Verify mock was called
  expect(mockAppwrite.from).toHaveBeenCalledWith('users');
  expect(mockAppwrite.from).toHaveBeenCalledTimes(1);
});
```

### Verify Call Arguments

```typescript
it('should call with correct arguments', async () => {
  await myService.createUser({ email: 'test@example.com' });
  
  expect(mockAppwrite.from).toHaveBeenCalledWith('users');
  expect(mockAppwrite.insert).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'test@example.com' })
  );
});
```

---

## 🐛 Debugging Mocks

### Check Mock Calls

```typescript
// Log all calls to a mock
console.log(mockAppwrite.from.mock.calls);
console.log(mockAppwrite.from.mock.results);
```

### Verify Mock Setup

```typescript
// Check if mock is properly configured
expect(mockAppwrite.from).toBeDefined();
expect(typeof mockAppwrite.from).toBe('function');
```

### Reset and Retry

```typescript
// If mocks aren't working, reset and reconfigure
jest.resetAllMocks();
jest.clearAllMocks();
```

---

## 📚 Related Documentation

- [Testing Guide](../README.md) - Main testing documentation
- [Unit Tests](../unit/) - Unit test suite
- [Integration Tests](../integration/) - Integration test suite
- [Jest Documentation](https://jestjs.io/docs/mock-functions) - Jest mocking guide

---

## 💡 Tips

- **Keep mocks in sync** with actual service interfaces
- **Update mocks** when services change
- **Test mock behavior** to ensure they work correctly
- **Document mock limitations** and known issues
- **Share mocks** across test suites for consistency

---

For questions about mocking, see the [Testing Strategy](../../../docs/guides/testing.md).
