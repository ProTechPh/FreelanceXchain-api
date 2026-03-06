# Test Helpers

Reusable test utilities and helper functions for writing tests.

## 📁 Purpose

This folder contains shared test utilities that can be used across all test types (unit, integration, security).

## 🛠️ Common Test Helpers

### Test Data Factories

Create test data with realistic values:

```typescript
// helpers/factories.ts
export const createTestUser = (role: 'freelancer' | 'employer' = 'freelancer') => ({
  id: generateId(),
  email: `test-${Date.now()}@example.com`,
  role,
  walletAddress: '0x' + 'a'.repeat(40),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const createTestProject = (employerId: string) => ({
  id: generateId(),
  employerId,
  title: 'Test Project',
  description: 'Test project description',
  budget: 1000,
  status: 'open',
  createdAt: new Date().toISOString(),
});

export const createTestProposal = (projectId: string, freelancerId: string) => ({
  id: generateId(),
  projectId,
  freelancerId,
  coverLetter: 'Test cover letter',
  proposedRate: 50,
  estimatedDuration: 30,
  status: 'pending',
  createdAt: new Date().toISOString(),
});
```

### Database Helpers

Manage test database state:

```typescript
// helpers/database.ts
export const cleanupDatabase = async () => {
  // Clear all test data
  await supabase.from('contracts').delete().neq('id', '');
  await supabase.from('proposals').delete().neq('id', '');
  await supabase.from('projects').delete().neq('id', '');
  await supabase.from('users').delete().neq('id', '');
};

export const seedTestData = async () => {
  // Insert common test data
  const users = await createTestUsers();
  const projects = await createTestProjects(users);
  return { users, projects };
};
```

### Authentication Helpers

Handle test authentication:

```typescript
// helpers/auth.ts
export const generateTestToken = (userId: string, role: string) => {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
  });
};

export const createAuthenticatedRequest = (userId: string, role: string) => {
  const token = generateTestToken(userId, role);
  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
};
```

### Assertion Helpers

Custom assertions for common patterns:

```typescript
// helpers/assertions.ts
export const expectValidUser = (user: any) => {
  expect(user).toBeDefined();
  expect(user.id).toBeDefined();
  expect(user.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  expect(user.role).toMatch(/^(freelancer|employer|admin)$/);
};

export const expectValidProject = (project: any) => {
  expect(project).toBeDefined();
  expect(project.id).toBeDefined();
  expect(project.title).toBeDefined();
  expect(project.budget).toBeGreaterThan(0);
};

export const expectValidContract = (contract: any) => {
  expect(contract).toBeDefined();
  expect(contract.id).toBeDefined();
  expect(contract.status).toMatch(/^(pending|active|completed|cancelled)$/);
};
```

### Wait Helpers

Handle async operations:

```typescript
// helpers/wait.ts
export const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
};

export const waitForNotification = async (userId: string, timeout = 5000) => {
  return waitFor(async () => {
    const notifications = await getNotifications(userId);
    return notifications.length > 0;
  }, timeout);
};
```

### Mock Helpers

Simplify mock creation:

```typescript
// helpers/mocks.ts
export const createMockService = <T extends object>(
  methods: (keyof T)[]
): jest.Mocked<T> => {
  const mock = {} as jest.Mocked<T>;
  methods.forEach(method => {
    mock[method] = jest.fn() as any;
  });
  return mock;
};

export const resetAllServiceMocks = (services: any[]) => {
  services.forEach(service => {
    Object.values(service).forEach(method => {
      if (typeof method === 'function' && 'mockClear' in method) {
        (method as jest.Mock).mockClear();
      }
    });
  });
};
```

---

## 📝 Creating New Helpers

### File Organization

```
helpers/
├── factories.ts       # Test data factories
├── database.ts        # Database utilities
├── auth.ts           # Authentication helpers
├── assertions.ts     # Custom assertions
├── wait.ts           # Async wait utilities
├── mocks.ts          # Mock creation helpers
└── index.ts          # Export all helpers
```

### Best Practices

1. **Keep Helpers Generic** - Make them reusable across tests
2. **Document Parameters** - Add JSDoc comments
3. **Handle Errors** - Provide clear error messages
4. **Export from Index** - Centralize exports
5. **Test Helpers** - Write tests for complex helpers

### Example Helper

```typescript
/**
 * Creates a test user with optional overrides
 * @param overrides - Partial user data to override defaults
 * @returns User object with test data
 */
export const createTestUser = (overrides: Partial<User> = {}): User => {
  return {
    id: generateId(),
    email: `test-${Date.now()}@example.com`,
    role: 'freelancer',
    walletAddress: '0x' + 'a'.repeat(40),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
};
```

---

## 🎯 Usage Examples

### In Unit Tests

```typescript
import { createTestUser, expectValidUser } from '../helpers';

describe('UserService', () => {
  it('should create user', async () => {
    const userData = createTestUser({ role: 'employer' });
    const user = await userService.create(userData);
    expectValidUser(user);
  });
});
```

### In Integration Tests

```typescript
import { 
  createTestUser, 
  createTestProject, 
  cleanupDatabase 
} from '../helpers';

describe('Project Workflow', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('should complete workflow', async () => {
    const employer = createTestUser({ role: 'employer' });
    const project = createTestProject(employer.id);
    // ... test implementation
  });
});
```

### In Security Tests

```typescript
import { 
  generateTestToken, 
  createAuthenticatedRequest 
} from '../helpers';

describe('Authorization', () => {
  it('should prevent unauthorized access', async () => {
    const token = generateTestToken('user-123', 'freelancer');
    const request = createAuthenticatedRequest('user-123', 'freelancer');
    // ... test implementation
  });
});
```

---

## 🔍 Helper Categories

### Data Generation
- User factories
- Project factories
- Proposal factories
- Contract factories
- Random data generators

### Database Operations
- Cleanup utilities
- Seeding utilities
- Transaction helpers
- Query builders

### Authentication
- Token generation
- Request builders
- Session management
- Permission helpers

### Assertions
- Entity validators
- Response validators
- Error validators
- State validators

### Async Utilities
- Wait functions
- Retry logic
- Timeout handlers
- Promise utilities

---

## 📚 Related Documentation

- [Testing Guide](../README.md) - Main testing documentation
- [Unit Tests](../unit/) - Unit test suite
- [Integration Tests](../integration/) - Integration test suite
- [Mocks](../mocks/) - Mock implementations

---

## 💡 Tips

- **DRY Principle** - Don't repeat test setup code
- **Composability** - Build complex helpers from simple ones
- **Type Safety** - Use TypeScript for better IDE support
- **Documentation** - Document complex helper functions
- **Testing** - Test critical helper functions

---

For questions about test helpers, see the [Testing Strategy](../../../docs/guides/testing.md).
