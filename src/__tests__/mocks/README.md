# Test Mocks

Mock implementations for external services and dependencies used in tests.

## 📄 Mock Files

- **test-setup.ts** - Centralized test setup and configuration

> Note: `blockchain-mocks.ts` and `appwrite-mocks.ts` were removed. Most mocks
> are provided globally by `jest.setup.ts` (node-appwrite databases/storage/
> account, web3-client, contract-abis, file-type, email SDK, storage-uploader)
> or defined per-suite with `jest.unstable_mockModule(...)` (ESM-style).

---

## 🎭 Available Mocks

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

// Mock config/env and repositories, then re-import the module under test
jest.unstable_mockModule('../../config/env.js', () => ({ config: { ... } }));

const { myService } = await import('../../services/my-service.js');
```

### Resetting Mocks

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

---

## 🎯 Mock Categories

### External Services

- **Blockchain** - Ethereum, smart contracts
- **Database** - Appwrite
- **AI/LLM** - LLM skill matching (Anthropic-compatible)
- **KYC** - Didit verification
- **Email** - Cloudflare email worker

### Internal Services

- **Authentication** - JWT, MFA
- **File Storage** - Appwrite Storage
- **Caching** - Redis, in-memory

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
