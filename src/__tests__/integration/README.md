# Integration Tests

End-to-end integration tests that verify complete workflows across multiple services.

## 📄 Test Files

- **integration.test.ts** - Complete workflow integration tests

## 🔄 What Integration Tests Cover

Integration tests verify that multiple components work together correctly:

### User Workflows
- User registration and authentication
- Profile creation and management
- Complete user journey flows

### Project Workflows
- Project creation by employer
- Proposal submission by freelancer
- Proposal acceptance and contract creation
- Milestone completion and payment
- Project completion and review

### Payment Workflows
- Escrow deposit
- Milestone-based payments
- Fund release on approval
- Dispute handling

### Communication Workflows
- Notification delivery
- Message sending and receiving
- Real-time updates

### Reputation Workflows
- Rating submission
- Reputation score calculation
- Review management

---

## 🧪 Running Integration Tests

### All Integration Tests
```bash
# Run all integration tests
pnpm test integration/

# Watch mode
pnpm test integration/ -- --watch

# With coverage
pnpm test integration/ -- --coverage
```

### Specific Workflows
```bash
# Run specific workflow tests
pnpm test integration/ -- --testNamePattern="Project Workflow"
pnpm test integration/ -- --testNamePattern="Payment Workflow"
```

---

## 📝 Writing Integration Tests

### Test Structure
```typescript
describe('Complete Workflow', () => {
  it('should complete end-to-end flow', async () => {
    // Step 1: Create users
    const employer = await createTestUser('employer');
    const freelancer = await createTestUser('freelancer');

    // Step 2: Create project
    const project = await projectService.create({
      employerId: employer.id,
      title: 'Test Project',
      // ...
    });

    // Step 3: Submit proposal
    const proposal = await proposalService.submit({
      projectId: project.id,
      freelancerId: freelancer.id,
      // ...
    });

    // Step 4: Accept proposal
    const contract = await proposalService.accept(proposal.id);

    // Step 5: Verify contract created
    expect(contract).toBeDefined();
    expect(contract.status).toBe('active');
  });
});
```

### Best Practices

1. **Test Real Workflows** - Simulate actual user journeys
2. **Use In-Memory Stores** - Fast, isolated test data
3. **Clean Up After Tests** - Reset state between tests
4. **Test Happy Path First** - Then add error scenarios
5. **Keep Tests Independent** - Each test should be self-contained

---

## 🗄️ Test Data Management

Integration tests use in-memory stores:

```typescript
// In-memory stores
let userStore: Map<string, User> = new Map();
let projectStore: Map<string, Project> = new Map();
let contractStore: Map<string, Contract> = new Map();

// Reset between tests
beforeEach(() => {
  userStore.clear();
  projectStore.clear();
  contractStore.clear();
});
```

---

## 🎯 Coverage Goals

| Workflow | Target Coverage |
|----------|----------------|
| User Registration | 100% |
| Project Creation | 100% |
| Proposal Flow | 100% |
| Payment Flow | 100% |
| Dispute Flow | 100% |
| Notification Flow | 100% |

---

## 🔍 Test Scenarios

### Critical Paths
- ✅ User registration → Profile creation → Project creation
- ✅ Project creation → Proposal submission → Contract creation
- ✅ Contract creation → Milestone completion → Payment release
- ✅ Payment issue → Dispute creation → Resolution
- ✅ Project completion → Review submission → Reputation update

### Error Scenarios
- ❌ Invalid user data
- ❌ Unauthorized access attempts
- ❌ Duplicate proposals
- ❌ Insufficient funds
- ❌ Invalid state transitions

---

## 🐛 Debugging Integration Tests

### Verbose Logging
```typescript
// Enable detailed logging
process.env.LOG_LEVEL = 'debug';
```

### Step-by-Step Debugging
```bash
# Run with node inspector
node --inspect-brk node_modules/.bin/jest integration/
```

### Check Test Data
```typescript
// Log intermediate states
console.log('User created:', user);
console.log('Project created:', project);
console.log('Contract state:', contract);
```

---

## ⚡ Performance Considerations

Integration tests should:
- Complete in < 5 seconds per test
- Use in-memory data stores
- Mock external services (blockchain, AI)
- Avoid real network calls
- Clean up resources properly

---

## 📚 Related Documentation

- [Testing Guide](../README.md) - Main testing documentation
- [Unit Tests](../unit/) - Unit test suite
- [Security Tests](../security/) - Security test suite
- [Test Mocks](../mocks/) - Mock implementations

---

For questions about integration testing, see the [Testing Strategy](../../../docs/guides/testing.md).
