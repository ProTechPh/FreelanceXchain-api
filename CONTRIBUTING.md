# Contributing to FreelanceXchain API

Thank you for your interest in contributing to FreelanceXchain! This guide will help you get started.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)

---

## 🤝 Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect differing viewpoints
- Accept responsibility for mistakes

### Unacceptable Behavior

- Harassment or discriminatory language
- Trolling or insulting comments
- Publishing others' private information
- Any conduct that could be considered unprofessional

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (20 recommended)
- pnpm package manager
- Git
- Supabase account
- Basic knowledge of TypeScript, Express, and Blockchain

### Initial Setup

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub
   ```

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/FreelanceXchain-api.git
   cd FreelanceXchain-api
   ```

3. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/FreelanceXchain-api.git
   ```

4. **Install dependencies**
   ```bash
   pnpm install --frozen-lockfile
   ```

5. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

6. **Run the application**
   ```bash
   pnpm run dev
   ```

7. **Run tests**
   ```bash
   pnpm test
   ```

### Project Documentation

Before contributing, familiarize yourself with:
- [Developer Setup Guide](docs/getting-started/setup.md)
- [Architecture Documentation](docs/architecture/)
- [Source Code Structure](src/README.md)

---

## 🔄 Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
# Update your main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### Branch Naming Convention

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/updates
- `chore/` - Maintenance tasks

Examples:
- `feature/add-payment-gateway`
- `fix/authentication-token-expiry`
- `docs/update-api-documentation`

### 2. Make Your Changes

- Write clean, readable code
- Follow existing code style
- Add tests for new features
- Update documentation as needed
- Keep commits focused and atomic

### 3. Test Your Changes

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Check coverage
pnpm run test:coverage

# Run linter
pnpm run lint

# Type checking
pnpm exec tsc --noEmit
```

### 4. Commit Your Changes

Follow our [commit guidelines](#commit-guidelines):

```bash
git add .
git commit -m "feat: add payment gateway integration"
```

### 5. Push and Create PR

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create Pull Request on GitHub
```

---

## 📝 Coding Standards

### TypeScript Style

#### Use Strict Typing
```typescript
// ✅ Good
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ❌ Bad
function calculateTotal(items: any): any {
  return items.reduce((sum: any, item: any) => sum + item.price, 0);
}
```

#### Prefer Interfaces for Objects
```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
  role: 'freelancer' | 'employer';
}

// ❌ Bad
type User = {
  id: any;
  email: any;
  role: any;
}
```

#### Use Async/Await
```typescript
// ✅ Good
async function getUser(id: string): Promise<User> {
  const user = await userRepository.findById(id);
  return user;
}

// ❌ Bad
function getUser(id: string): Promise<User> {
  return userRepository.findById(id).then(user => user);
}
```

### File Organization

#### Naming Conventions
- **Files:** `kebab-case.ts` (e.g., `user-service.ts`)
- **Classes:** `PascalCase` (e.g., `UserService`)
- **Functions/Variables:** `camelCase` (e.g., `getUserById`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_ATTEMPTS`)

#### File Structure
```typescript
// 1. Imports
import { Express } from 'express';
import { UserRepository } from '../repositories';

// 2. Types/Interfaces
interface CreateUserDto {
  email: string;
  password: string;
}

// 3. Constants
const MAX_LOGIN_ATTEMPTS = 5;

// 4. Class/Functions
export class UserService {
  // Implementation
}

// 5. Exports
export { CreateUserDto };
```

### Code Quality

#### Error Handling
```typescript
// ✅ Good
try {
  const user = await userService.create(userData);
  return res.status(201).json(user);
} catch (error) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: error.message });
  }
  throw error; // Let error middleware handle
}

// ❌ Bad
try {
  const user = await userService.create(userData);
  return res.status(201).json(user);
} catch (error) {
  console.log(error); // Don't just log
  return res.status(500).json({ error: 'Something went wrong' });
}
```

#### Validation
```typescript
// ✅ Good
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

if (!validateEmail(userData.email)) {
  throw new ValidationError('Invalid email format');
}

// ❌ Bad
if (!userData.email.includes('@')) {
  throw new Error('Bad email');
}
```

---

## 💬 Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/).

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes

### Examples

```bash
# Feature
feat(auth): add OAuth2 authentication

# Bug fix
fix(payment): resolve escrow release timing issue

# Documentation
docs(api): update endpoint documentation

# Breaking change
feat(api)!: change user authentication flow

BREAKING CHANGE: JWT tokens now expire after 1 hour instead of 24 hours
```

### Commit Best Practices

- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor to..." not "moves cursor to...")
- Keep subject line under 50 characters
- Capitalize subject line
- Don't end subject line with period
- Separate subject from body with blank line
- Wrap body at 72 characters
- Explain what and why, not how

---

## 🔍 Pull Request Process

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] All tests pass (`pnpm test`)
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] No commented-out code
- [ ] Linter passes (`pnpm run lint`)
- [ ] Type checking passes (`pnpm exec tsc --noEmit`)

### PR Title Format

Follow commit message format:
```
feat(scope): add new feature
fix(scope): resolve bug
docs(scope): update documentation
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally

## Related Issues
Closes #123
```

### Review Process

1. **Automated Checks**
   - CI/CD pipeline runs
   - Tests must pass
   - Linting must pass
   - Coverage threshold met

2. **Code Review**
   - At least one approval required
   - Address all review comments
   - Keep discussions professional

3. **Merge**
   - Squash and merge preferred
   - Delete branch after merge

---

## 🧪 Testing Requirements

### Test Coverage

- Minimum 80% overall coverage
- 90%+ for services and repositories
- 85%+ for routes

### Writing Tests

```typescript
describe('UserService', () => {
  describe('create', () => {
    it('should create user with valid data', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!'
      };

      // Act
      const user = await userService.create(userData);

      // Assert
      expect(user).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.password).not.toBe(userData.password); // Should be hashed
    });

    it('should throw error for invalid email', async () => {
      // Arrange
      const userData = {
        email: 'invalid-email',
        password: 'SecurePass123!'
      };

      // Act & Assert
      await expect(userService.create(userData))
        .rejects
        .toThrow(ValidationError);
    });
  });
});
```

### Test Best Practices

- Test one thing per test
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Clean up after tests
- Test edge cases and error conditions

---

## 📚 Documentation

### When to Update Documentation

- Adding new features
- Changing API endpoints
- Modifying configuration
- Updating dependencies
- Fixing bugs that affect usage

### Documentation Locations

- **API Changes:** Update OpenAPI spec and [API docs](docs/architecture/api-overview.md)
- **Features:** Add to [features documentation](docs/features/)
- **Configuration:** Update [CONFIGURATION.md](CONFIGURATION.md)
- **Architecture:** Update [architecture docs](docs/architecture/)
- **README:** Update if setup process changes

### Documentation Style

- Use clear, concise language
- Include code examples
- Add screenshots for UI changes
- Keep formatting consistent
- Update table of contents

---

## 🐛 Reporting Bugs

### Before Reporting

- Check existing issues
- Verify it's reproducible
- Test on latest version

### Bug Report Template

```markdown
**Description**
Clear description of the bug

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Environment**
- OS: [e.g., macOS 12.0]
- Node: [e.g., 20.0.0]
- Version: [e.g., 1.2.3]

**Additional Context**
Any other relevant information
```

---

## 💡 Feature Requests

### Feature Request Template

```markdown
**Problem Statement**
What problem does this solve?

**Proposed Solution**
How should it work?

**Alternatives Considered**
Other approaches you've thought about

**Additional Context**
Any other relevant information
```

---

## 🎓 Learning Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Supabase Documentation](https://supabase.com/docs)
- [Hardhat Documentation](https://hardhat.org/docs)
- [Jest Testing](https://jestjs.io/docs/getting-started)

---

## 📞 Getting Help

- **Documentation:** Check [docs/](docs/)
- **Issues:** Search existing issues
- **Discussions:** GitHub Discussions
- **Chat:** Project Discord/Slack

---

## 🙏 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

Thank you for contributing to FreelanceXchain! 🎉
