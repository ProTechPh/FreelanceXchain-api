# Testing Documentation

## Overview

This document covers the testing strategy, test cases, and results for the Blockchain Freelance Marketplace.

---

## Testing Strategy

### Test Types

| Type | Purpose | Tools |
|------|---------|-------|
| Unit Tests | Test individual functions/services | Jest, ts-jest |
| Integration Tests | Test API endpoints | Jest, supertest |
| Contract Tests | Test smart contracts | Hardhat, Chai |
| Property-Based Tests | Test with random inputs | fast-check |

### Test Structure

```
src/
├── services/
│   └── __tests__/           # Service unit tests
├── middleware/
│   └── __tests__/           # Middleware tests
└── __tests__/               # Integration tests

contracts/                    # Smart contracts
scripts/
└── test-workflow.cjs        # Contract workflow tests
```

---

## Running Tests

### Unit & Integration Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- auth-service.test.ts

# Watch mode (development)
npm run test:watch
```

### Smart Contract Tests

```bash
# Compile contracts
npm run compile

# Test with local Ganache
npm run deploy:ganache
node scripts/test-workflow.cjs
```

---

## Test Cases

### Authentication Service

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Register valid user | Register with valid email/password | User created, tokens returned |
| Register duplicate email | Register with existing email | Error: Email already exists |
| Register invalid email | Register with malformed email | Validation error |
| Register weak password | Password < 8 characters | Validation error |
| Login valid credentials | Login with correct email/password | Tokens returned |
| Login invalid password | Login with wrong password | Error: Invalid credentials |
| Login non-existent user | Login with unknown email | Error: User not found |
| Refresh valid token | Refresh with valid refresh token | New access token |
| Refresh expired token | Refresh with expired token | Error: Token expired |

### Project Service

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Create project | Employer creates project | Project created with ID |
| Create without milestones | Project with empty milestones | Validation error |
| Get project by ID | Fetch existing project | Project data returned |
| Get non-existent project | Fetch with invalid ID | Error: Not found |
| Update project | Owner updates project | Project updated |
| Update by non-owner | Non-owner attempts update | Error: Forbidden |
| Delete draft project | Delete project in draft status | Project deleted |
| Delete active project | Delete project with proposals | Error: Cannot delete |
| List open projects | Get all open projects | Paginated list |
| Filter by skills | Filter projects by skill IDs | Matching projects |
| Filter by budget | Filter by min/max budget | Projects in range |

### Proposal Service

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Submit proposal | Freelancer submits to open project | Proposal created |
| Submit duplicate | Submit to same project twice | Error: Already submitted |
| Submit to closed project | Submit to non-open project | Error: Project not open |
| Accept proposal | Employer accepts proposal | Contract created |
| Accept already accepted | Accept when another accepted | Error: Project has contract |
| Reject proposal | Employer rejects proposal | Status updated |
| Withdraw proposal | Freelancer withdraws | Status updated |
| Withdraw accepted | Withdraw accepted proposal | Error: Cannot withdraw |

### Contract Service

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Get contract | Fetch by ID | Contract data |
| Get by non-party | Non-party fetches contract | Error: Forbidden |
| List user contracts | Get all contracts for user | Filtered list |
| Update status | Update contract status | Status changed |

### Payment Service

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Initialize escrow | Deploy escrow contract | Escrow address set |
| Request completion | Freelancer submits milestone | Status: submitted |
| Approve milestone | Employer approves | Payment released |
| Approve non-submitted | Approve pending milestone | Error: Not submitted |
| Dispute milestone | Party disputes | Dispute created |
| Get payment status | Check contract payment state | Status summary |

### Reputation Service

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Submit rating | Rate after contract completion | Rating stored on-chain |
| Submit duplicate | Rate same contract twice | Error: Already rated |
| Submit invalid score | Score outside 1-5 | Validation error |
| Get reputation | Fetch user's ratings | Aggregate score + list |
| Get work history | Fetch completed contracts | History entries |

### Dispute Service

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Create dispute | Party creates dispute | Dispute created |
| Create by non-party | Non-party creates dispute | Error: Forbidden |
| Submit evidence | Add evidence to dispute | Evidence attached |
| Resolve dispute | Arbiter resolves | Funds distributed |
| Resolve by non-arbiter | Non-arbiter resolves | Error: Forbidden |

### Matching Service (AI)

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Get project recommendations | Freelancer requests matches | Scored project list |
| Get freelancer recommendations | Employer requests matches | Scored freelancer list |
| Extract skills from text | Parse job description | Skill list extracted |
| Analyze skill gaps | Compare freelancer to project | Gap analysis |
| Fallback to keywords | AI unavailable | Keyword matching used |

### Search Service

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Search projects | Search with query | Matching projects |
| Search with filters | Apply multiple filters | Filtered results |
| Search freelancers | Search by skills | Matching freelancers |
| Pagination | Request with continuation token | Next page |

---

## Smart Contract Tests

### FreelanceEscrow Contract

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Deploy with milestones | Deploy with valid params | Contract deployed |
| Deploy insufficient funds | Send less than total | Revert: Insufficient funds |
| Submit milestone | Freelancer submits | Status: Submitted |
| Submit by non-freelancer | Employer submits | Revert: Only freelancer |
| Approve milestone | Employer approves | ETH transferred |
| Approve non-submitted | Approve pending | Revert: Not submitted |
| Dispute milestone | Party disputes | Status: Disputed |
| Resolve in favor of freelancer | Arbiter resolves | ETH to freelancer |
| Resolve in favor of employer | Arbiter resolves | ETH refunded |
| Refund pending milestone | Employer refunds | ETH returned |
| Cancel contract | Employer cancels | Remaining ETH returned |
| Reentrancy attack | Malicious contract calls | Revert: Reentrancy guard |

### FreelanceReputation Contract

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| Submit rating | Valid rating submission | Rating stored |
| Submit self-rating | Rate yourself | Revert: Cannot rate yourself |
| Submit invalid score | Score > 5 or < 1 | Revert: Score must be 1-5 |
| Submit duplicate | Same rater/ratee/contract | Revert: Already rated |
| Get average rating | Query user average | Correct calculation |
| Get rating count | Query total ratings | Correct count |
| Get rating by index | Fetch specific rating | Rating data |
| Check has rated | Query if rating exists | Boolean result |

---

## Test Results Summary

### Unit Tests

```
Test Suites: 15 passed, 15 total
Tests:       127 passed, 127 total
Snapshots:   0 total
Time:        8.234s
```

### Coverage Report

| Module | Statements | Branches | Functions | Lines |
|--------|------------|----------|-----------|-------|
| Services | 89% | 82% | 91% | 88% |
| Middleware | 95% | 90% | 100% | 94% |
| Routes | 78% | 75% | 85% | 77% |
| Utils | 92% | 88% | 95% | 91% |
| **Overall** | **87%** | **83%** | **91%** | **86%** |

### Smart Contract Tests

```
FreelanceEscrow
  ✓ Should deploy with correct parameters
  ✓ Should accept milestone submission from freelancer
  ✓ Should release payment on approval
  ✓ Should handle disputes correctly
  ✓ Should prevent reentrancy attacks
  ✓ Should refund on cancellation

FreelanceReputation
  ✓ Should store ratings immutably
  ✓ Should calculate average correctly
  ✓ Should prevent duplicate ratings
  ✓ Should enforce score range

10 passing (2.5s)
```

---

## Known Test Limitations

1. **AI Service Tests**: Mocked due to LLM API costs; real API tested manually
2. **Blockchain Tests**: Use local Ganache; testnet deployment tested separately
3. **Load Testing**: Not included; recommend using k6 or Artillery for production
4. **E2E Tests**: Require frontend; API-level integration tests cover flows

---

## Continuous Integration

Recommended CI pipeline:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm test -- --coverage
      - run: npm run compile
```
