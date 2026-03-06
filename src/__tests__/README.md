# Testing Documentation

Comprehensive testing strategy and test suite for FreelanceXchain API.

## 📁 Test Structure

```
src/__tests__/
├── unit/                        # Unit tests (28 test files)
├── integration/                 # Integration tests
├── security/                    # Security & OWASP tests
├── mocks/                       # Mock implementations
├── helpers/                     # Test helper utilities
└── README.md                    # This file
```

## 🗂️ Test Organization

### [Unit Tests](unit/)
Individual service, client, and utility tests.
- **28 test files** covering all services
- Authentication, profiles, projects, payments
- Blockchain clients and contracts
- AI and external integrations

### [Integration Tests](integration/)
End-to-end workflow tests across multiple services.
- Complete user journeys
- Project workflows
- Payment flows
- Communication workflows

### [Security Tests](security/)
OWASP Top 10 security validation.
- Access control testing
- Cryptographic validation
- Injection prevention
- Security misconfiguration checks

### [Mocks](mocks/)
Mock implementations for external dependencies.
- Blockchain mocks
- Supabase mocks
- Test setup utilities

### [Helpers](helpers/)
Reusable test utilities and helper functions.
- Test data factories
- Database helpers
- Authentication helpers
- Custom assertions

---

## 🧪 Test Types

### Unit Tests
Test individual components in isolation.

**Location:** [unit/](unit/)  
**Files:** 28 test files  
**Coverage Target:** >90%

**Categories:**
- Service tests (auth, profiles, projects, payments)
- Blockchain client tests
- External integration tests (AI, KYC)
- Utility function tests

**Example:**
```typescript
describe('ProjectService', () => {
  it('should create project with valid data', async () => {
    const project = await projectService.create(validData);
    expect(project).toBeDefined();
    expect(project.status).toBe('open');
  });
});
```

---

### Integration Tests
Test complete workflows across multiple services.

**Location:** [integration/](integration/)  
**Files:** 1 comprehensive test file  
**Coverage Target:** 100% of critical paths

**Workflows:**
- User registration → Profile → Project creation
- Project → Proposal → Contract → Payment
- Dispute creation → Resolution
- Notification delivery

**Example:**
```typescript
describe('Complete Project Workflow', () => {
  it('should handle full project lifecycle', async () => {
    const employer = await createUser('employer');
    const project = await createProject(employer.id);
    const proposal = await submitProposal(project.id);
    const contract = await acceptProposal(proposal.id);
    expect(contract.status).toBe('active');
  });
});
```

---

### Security Tests
OWASP Top 10 security validation.

**Location:** [security/](security/)  
**Files:** 1 comprehensive security test file  
**Coverage Target:** 100% of OWASP Top 10

**Categories:**
- Access control (A01)
- Cryptography (A02)
- Injection prevention (A03)
- Authentication (A07)
- Logging & monitoring (A09)

**Example:**
```typescript
describe('OWASP A01: Broken Access Control', () => {
  it('should enforce role-based access', async () => {
    const freelancerAccess = checkAccess('freelancer', 'admin-endpoint');
    expect(freelancerAccess).toBe(false);
  });
});
```

---

## 🛠️ Test Utilities

### [Mocks](mocks/)
Mock implementations for external services.

**Files:**
- `blockchain-mocks.ts` - Blockchain and smart contract mocks
- `supabase-mocks.ts` - Database operation mocks
- `test-setup.ts` - Centralized test configuration

**Usage:**
```typescript
import { mockSupabase } from '../mocks/supabase-mocks.js';
import { mockBlockchainClient } from '../mocks/blockchain-mocks.js';

jest.mock('../../config/supabase.js', () => ({ supabase: mockSupabase }));
```

---

### [Helpers](helpers/)
Reusable test utilities and helper functions.

**Common Helpers:**
- Test data factories (users, projects, proposals)
- Database utilities (cleanup, seeding)
- Authentication helpers (token generation)
- Custom assertions (entity validation)
- Async wait utilities

**Usage:**
```typescript
import { createTestUser, expectValidUser } from '../helpers';

const user = createTestUser({ role: 'employer' });
expectValidUser(user);
```

---

## 🚀 Running Tests

### All Tests
```bash
# Run all tests
pnpm test

# Run with coverage
pnpm run test:coverage

# Run in watch mode
pnpm run test:watch
```

### Specific Test Files
```bash
# Run integration tests
pnpm test integration.test.ts

# Run security tests
pnpm test owasp-integration.test.ts

# Run specific test suite
pnpm test -- --testNamePattern="Project Workflow"
```

### Coverage Reports
```bash
# Generate coverage report
pnpm run test:coverage

# View HTML report
open coverage/lcov-report/index.html
```

---

## 📊 Test Coverage Goals

| Category | Target | Current |
|----------|--------|---------|
| **Overall** | >80% | Check coverage report |
| **Services** | >90% | High priority |
| **Routes** | >85% | Critical paths |
| **Repositories** | >90% | Data access |
| **Utils** | >95% | Pure functions |
| **Smart Contracts** | >90% | Security critical |

---

## 🎯 Testing Best Practices

### 1. Test Structure (AAA Pattern)
```typescript
it('should create project successfully', async () => {
  // Arrange - Setup test data
  const user = await createTestUser('employer');
  const projectData = { title: 'Test Project', ... };
  
  // Act - Execute the action
  const project = await projectService.create(projectData);
  
  // Assert - Verify results
  expect(project).toBeDefined();
  expect(project.title).toBe('Test Project');
});
```

### 2. Isolation
- Each test should be independent
- Clean up after tests
- Use transactions for database tests
- Mock external dependencies

### 3. Descriptive Names
```typescript
// Good
it('should return 401 when token is expired', async () => {});

// Bad
it('test auth', async () => {});
```

### 4. Test Edge Cases
- Null/undefined inputs
- Empty arrays/objects
- Boundary values
- Error conditions
- Race conditions

### 5. Mock External Services
```typescript
jest.mock('../services/blockchain-client', () => ({
  deployContract: jest.fn().mockResolvedValue('0x123...'),
}));
```

---

## 🔧 Test Configuration

### Jest Configuration (`jest.config.js`)
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### Setup File (`jest.setup.js`)
```javascript
// Global test setup
beforeAll(async () => {
  // Initialize test database
  // Setup test environment
});

afterAll(async () => {
  // Cleanup
});
```

---

## 🗄️ Test Database

### Setup
```bash
# Create test database
createdb freelancexchain_test

# Apply schema
psql -d freelancexchain_test -f supabase/schema.sql
```

### Environment Variables
```env
# .env.test
NODE_ENV=test
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=test-key
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/freelancexchain_test
```

### Cleanup Strategy
```typescript
afterEach(async () => {
  // Rollback transaction or truncate tables
  await cleanupTestData();
});
```

---

## 🔐 Testing Security Features

### Authentication Tests
```typescript
describe('Authentication', () => {
  it('should hash passwords before storing', async () => {});
  it('should validate JWT tokens', async () => {});
  it('should refresh expired tokens', async () => {});
  it('should prevent brute force attacks', async () => {});
});
```

### Authorization Tests
```typescript
describe('Authorization', () => {
  it('should enforce role-based access control', async () => {});
  it('should prevent privilege escalation', async () => {});
  it('should validate resource ownership', async () => {});
});
```

### Input Validation Tests
```typescript
describe('Input Validation', () => {
  it('should reject invalid email formats', async () => {});
  it('should sanitize HTML input', async () => {});
  it('should validate file uploads', async () => {});
});
```

---

## ⛓️ Testing Blockchain Integration

### Mock Blockchain
```typescript
// Mock ethers.js
jest.mock('ethers', () => ({
  Contract: jest.fn(),
  JsonRpcProvider: jest.fn(),
  Wallet: jest.fn(),
}));
```

### Test Smart Contract Interactions
```typescript
describe('Escrow Contract', () => {
  it('should deposit funds to escrow', async () => {
    // Mock contract call
    // Verify transaction
  });
  
  it('should release funds on milestone approval', async () => {
    // Test payment release
  });
});
```

---

## 🤖 Testing AI Features

### Mock LLM API
```typescript
jest.mock('../services/ai-client', () => ({
  generateCompletion: jest.fn().mockResolvedValue({
    skills: ['JavaScript', 'React'],
    confidence: 0.95,
  }),
}));
```

### Test Matching Algorithm
```typescript
describe('AI Matching', () => {
  it('should recommend relevant freelancers', async () => {
    const recommendations = await matchingService.getFreelancerRecommendations(projectId);
    expect(recommendations).toHaveLength(5);
    expect(recommendations[0].score).toBeGreaterThan(0.8);
  });
});
```

---

## 📈 Continuous Testing

### Pre-commit Hooks
```bash
# .husky/pre-commit
npm test -- --bail --findRelatedTests
```

### CI/CD Integration
Tests run automatically on:
- Pull requests
- Push to main/develop
- Before deployment

See [GitHub Workflows](../.github/README.md) for CI configuration.

---

## 🐛 Debugging Tests

### Run Single Test
```bash
pnpm test -- --testNamePattern="should create project"
```

### Debug in VS Code
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal"
}
```

### Verbose Output
```bash
pnpm test -- --verbose
```

---

## 📚 Related Documentation

- [Testing Strategy](../../docs/guides/testing.md) - Overall testing approach
- [Blockchain Testing](../../docs/blockchain/testing.md) - Smart contract testing
- [Security Testing](../../docs/security/MFA_TESTING_GUIDE.md) - Security test guidelines
- [CI/CD Workflows](../../.github/README.md) - Automated testing

---

## ✅ Test Checklist

Before merging code:
- [ ] All tests pass
- [ ] Coverage meets threshold (>80%)
- [ ] New features have tests
- [ ] Edge cases covered
- [ ] Security tests pass
- [ ] Integration tests pass
- [ ] No console errors/warnings
- [ ] Tests run in CI/CD

---

## 🎓 Learning Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

---

For questions about testing, consult the testing strategy documentation or reach out to the QA team.
