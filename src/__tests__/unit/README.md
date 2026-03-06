# Unit Tests

Unit tests for individual services, clients, and utilities.

## 📁 Test Files

### Authentication & Authorization
- **auth-service.test.ts** - Authentication service tests
- **auth-service.oauth.test.ts** - OAuth authentication tests

### Profile Services
- **freelancer-profile-service.test.ts** - Freelancer profile management
- **employer-profile-service.test.ts** - Employer profile management

### Project & Proposal Services
- **project-service.test.ts** - Project CRUD operations
- **proposal-service.test.ts** - Proposal submission and management
- **contract-service.test.ts** - Contract lifecycle management

### Payment & Transaction Services
- **payment-service.test.ts** - Payment processing
- **transaction-service.test.ts** - Transaction management

### Communication Services
- **message-service.test.ts** - Direct messaging
- **notification-service.test.ts** - Notification delivery

### Reputation & Review Services
- **reputation-service.test.ts** - Reputation calculation
- **review-service.test.ts** - Review management

### Dispute Services
- **dispute-service.test.ts** - Dispute resolution

### Search & Matching Services
- **search-service.test.ts** - Search functionality
- **matching-service.test.ts** - AI-powered matching

### Skill Services
- **skill-service.test.ts** - Skill management
- **skill-service-simple.test.ts** - Simplified skill tests

### Blockchain Services
- **blockchain-client.test.ts** - Blockchain client
- **blockchain-services.test.ts** - Blockchain service orchestration
- **web3-client.test.ts** - Web3 utilities
- **agreement-blockchain.test.ts** - Agreement contract interactions
- **escrow-blockchain.test.ts** - Escrow contract interactions
- **reputation-blockchain.test.ts** - Reputation contract interactions
- **kyc-contract.test.ts** - KYC contract interactions

### External Integrations
- **ai-client.test.ts** - AI/LLM client
- **didit-client.test.ts** - Didit KYC client

### Sanity Tests
- **sanity.test.ts** - Basic sanity checks

---

## 🧪 Running Unit Tests

### All Unit Tests
```bash
# Run all unit tests
pnpm test unit/

# Watch mode
pnpm test unit/ -- --watch

# With coverage
pnpm test unit/ -- --coverage
```

### Specific Test Files
```bash
# Run specific service tests
pnpm test unit/auth-service.test.ts
pnpm test unit/project-service.test.ts

# Run all blockchain tests
pnpm test unit/ -- --testPathPattern="blockchain"

# Run all service tests
pnpm test unit/ -- --testPathPattern="service"
```

---

## 📝 Writing Unit Tests

### Test Structure
```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ServiceName } from '../../services/service-name.js';

describe('ServiceName', () => {
  let service: ServiceName;

  beforeEach(() => {
    // Setup
    service = new ServiceName();
  });

  describe('methodName', () => {
    it('should perform expected behavior', async () => {
      // Arrange
      const input = { /* test data */ };

      // Act
      const result = await service.methodName(input);

      // Assert
      expect(result).toBeDefined();
      expect(result.property).toBe(expectedValue);
    });

    it('should handle error cases', async () => {
      // Arrange
      const invalidInput = { /* invalid data */ };

      // Act & Assert
      await expect(service.methodName(invalidInput))
        .rejects
        .toThrow(ExpectedError);
    });
  });
});
```

### Best Practices

1. **Test One Thing** - Each test should verify one specific behavior
2. **Use Descriptive Names** - Test names should clearly state what is being tested
3. **Follow AAA Pattern** - Arrange, Act, Assert
4. **Mock Dependencies** - Isolate the unit under test
5. **Test Edge Cases** - Include boundary conditions and error scenarios
6. **Keep Tests Fast** - Unit tests should run quickly

### Mocking

Use mocks from `../mocks/` folder:
```typescript
import { mockSupabase } from '../mocks/supabase-mocks.js';
import { mockBlockchain } from '../mocks/blockchain-mocks.js';

jest.mock('../../config/supabase.js', () => mockSupabase);
```

---

## 🎯 Coverage Goals

| Component | Target Coverage |
|-----------|----------------|
| Services | >90% |
| Repositories | >90% |
| Utils | >95% |
| Blockchain Clients | >85% |
| External Clients | >80% |

---

## 🔍 Test Categories

### Service Tests
Test business logic and service layer functionality.

**Focus:**
- Business rule validation
- Service orchestration
- Error handling
- Data transformation

### Client Tests
Test external API and blockchain client interactions.

**Focus:**
- API request/response handling
- Error handling and retries
- Data serialization
- Connection management

### Blockchain Tests
Test smart contract interactions and blockchain operations.

**Focus:**
- Contract method calls
- Transaction handling
- Event parsing
- Gas estimation

---

## 🐛 Debugging Tests

### Run Single Test
```bash
pnpm test unit/auth-service.test.ts -- --testNamePattern="should login user"
```

### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": [
    "--runInBand",
    "--no-cache",
    "${file}"
  ],
  "console": "integratedTerminal"
}
```

### Verbose Output
```bash
pnpm test unit/ -- --verbose
```

---

## 📚 Related Documentation

- [Testing Guide](../README.md) - Main testing documentation
- [Integration Tests](../integration/) - Integration test suite
- [Security Tests](../security/) - Security test suite
- [Test Mocks](../mocks/) - Mock implementations

---

For questions about unit testing, see the [Testing Strategy](../../../docs/guides/testing.md).
