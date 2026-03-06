# Source Code Structure

Backend API source code organized in a layered architecture pattern.

## 📁 Directory Structure

```
src/
├── config/          # Configuration and setup
├── middleware/      # Express middleware
├── models/          # Data models and types
├── repositories/    # Data access layer
├── routes/          # API route handlers
├── services/        # Business logic layer
├── utils/           # Utility functions
├── __tests__/       # Test files
├── app.ts           # Express app setup
└── index.ts         # Application entry point
```

## 🏗️ Architecture Layers

### Layer 1: Configuration (`/config`)
Application configuration and initialization.

**Files:**
- **env.ts** - Environment variable validation and typing
- **supabase.ts** - Supabase client configuration
- **swagger.ts** - OpenAPI/Swagger documentation setup
- **logger.ts** - Winston logger configuration
- **contracts.ts** - Smart contract addresses and ABIs
- **index.ts** - Centralized config exports

**Purpose:** Centralize all configuration, validate environment variables, and provide typed config objects.

---

### Layer 2: Middleware (`/middleware`)
Express middleware for request/response processing.

**Common Middleware:**
- **Authentication** - JWT token validation
- **Authorization** - Role-based access control (RBAC)
- **Validation** - Request body/query validation
- **Error Handling** - Centralized error handling
- **Rate Limiting** - API rate limiting
- **Logging** - Request/response logging
- **CORS** - Cross-origin resource sharing
- **Security Headers** - Helmet security headers

**Purpose:** Process requests before they reach route handlers, enforce security, validate input.

---

### Layer 3: Routes (`/routes`)
API endpoint definitions and request routing.

**Route Files:**
- **auth-routes.ts** - Authentication endpoints (login, register, refresh)
- **freelancer-routes.ts** - Freelancer profile management
- **employer-routes.ts** - Employer profile management
- **project-routes.ts** - Project CRUD operations
- **proposal-routes.ts** - Proposal submission and management
- **contract-routes.ts** - Contract lifecycle management
- **payment-routes.ts** - Payment and escrow operations
- **reputation-routes.ts** - Ratings and reviews
- **dispute-routes.ts** - Dispute resolution
- **matching-routes.ts** - AI-powered matching
- **search-routes.ts** - Search functionality
- **skill-routes.ts** - Skill taxonomy
- **notification-routes.ts** - User notifications
- **message-routes.ts** - Direct messaging
- **didit-kyc-routes.ts** - KYC verification
- **audit-logs.ts** - Audit log queries
- **file-upload.ts** - File upload handling
- **review-routes.ts** - Review management
- **admin-routes.ts** - Admin operations
- **index.ts** - Route aggregation

**Purpose:** Define API endpoints, apply middleware, delegate to services.

**Pattern:**
```typescript
router.post('/projects',
  authenticate,
  authorize(['employer']),
  validateProjectInput,
  async (req, res, next) => {
    try {
      const project = await projectService.create(req.body);
      res.status(201).json(project);
    } catch (error) {
      next(error);
    }
  }
);
```

---

### Layer 4: Services (`/services`)
Business logic and orchestration layer.

**Service Categories:**

#### Core Services
- **auth-service.ts** - Authentication logic
- **freelancer-profile-service.ts** - Freelancer operations
- **employer-profile-service.ts** - Employer operations
- **project-service.ts** - Project management
- **proposal-service.ts** - Proposal handling
- **contract-service.ts** - Contract lifecycle
- **payment-service.ts** - Payment processing
- **reputation-service.ts** - Reputation calculation
- **dispute-service.ts** - Dispute resolution
- **skill-service.ts** - Skill management
- **search-service.ts** - Search functionality
- **notification-service.ts** - Notification delivery
- **message-service.ts** - Messaging system
- **review-service.ts** - Review management
- **audit-log-service.ts** - Audit logging

#### AI Services
- **ai-client.ts** - LLM API client
- **ai-assistant.ts** - AI assistant functionality
- **matching-service.ts** - AI-powered matching
- **ai-types.ts** - AI-related types

#### Blockchain Services
- **blockchain-client.ts** - Ethereum client
- **blockchain-integration.ts** - Blockchain orchestration
- **web3-client.ts** - Web3 utilities
- **escrow-blockchain.ts** - Escrow contract interaction
- **escrow-contract.ts** - Escrow contract wrapper
- **reputation-blockchain.ts** - Reputation contract interaction
- **reputation-contract.ts** - Reputation contract wrapper
- **agreement-blockchain.ts** - Agreement contract interaction
- **agreement-contract.ts** - Agreement contract wrapper
- **milestone-registry.ts** - Milestone tracking
- **dispute-registry.ts** - Dispute tracking
- **kyc-contract.ts** - KYC contract interaction
- **contract-abis.ts** - Contract ABIs
- **contract-deployment.ts** - Deployment utilities
- **blockchain-types.ts** - Blockchain types

#### External Integrations
- **didit-client.ts** - Didit KYC API client
- **didit-kyc-service.ts** - KYC verification service

#### Supporting Services
- **transaction-service.ts** - Transaction management
- **index.ts** - Service exports

**Purpose:** Implement business rules, coordinate between layers, handle complex operations.

**Pattern:**
```typescript
class ProjectService {
  async create(data: CreateProjectDto): Promise<Project> {
    // Validate business rules
    // Call repository
    // Trigger notifications
    // Log audit trail
    // Return result
  }
}
```

---

### Layer 5: Repositories (`/repositories`)
Data access layer for database operations.

**Purpose:** Abstract database queries, provide clean data access interface, handle ORM operations.

**Pattern:**
```typescript
class ProjectRepository {
  async findById(id: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw new DatabaseError(error.message);
    return data;
  }
}
```

---

### Layer 6: Models (`/models`)
Data models, types, and interfaces.

**Purpose:** Define data structures, TypeScript types, validation schemas, DTOs.

**Types:**
- **Entity Models** - Database table representations
- **DTOs** - Data Transfer Objects for API requests/responses
- **Enums** - Enumerated types
- **Interfaces** - Contract definitions
- **Type Guards** - Runtime type checking

---

### Layer 7: Utils (`/utils`)
Utility functions and helpers.

**Common Utils:**
- **Validation** - Input validation helpers
- **Formatting** - Data formatting utilities
- **Encryption** - Hashing and encryption
- **Date/Time** - Date manipulation
- **String** - String utilities
- **Error** - Custom error classes
- **Constants** - Application constants

**Purpose:** Reusable functions used across the application.

---

## 🔄 Request Flow

```
1. HTTP Request
   ↓
2. Middleware (auth, validation, logging)
   ↓
3. Route Handler
   ↓
4. Service Layer (business logic)
   ↓
5. Repository Layer (database access)
   ↓
6. Database (Supabase)
   ↓
7. Response (back through layers)
```

## 🎯 Design Principles

### Separation of Concerns
- **Routes** - Handle HTTP, delegate to services
- **Services** - Implement business logic, coordinate operations
- **Repositories** - Handle data access only
- **Models** - Define data structures

### Dependency Injection
Services receive dependencies through constructor:
```typescript
class ProjectService {
  constructor(
    private projectRepo: ProjectRepository,
    private notificationService: NotificationService
  ) {}
}
```

### Single Responsibility
Each class/module has one clear purpose.

### DRY (Don't Repeat Yourself)
Common logic extracted to utilities and shared services.

## 🧪 Testing (`/__tests__`)

Test files organized by layer:
- **Unit Tests** - Test individual functions/classes
- **Integration Tests** - Test layer interactions
- **E2E Tests** - Test complete workflows

**Naming Convention:**
```
service-name.test.ts
repository-name.test.ts
route-name.test.ts
```

## 📝 Development Guidelines

### Adding New Features

1. **Define Models** - Create types in `/models`
2. **Create Repository** - Add data access in `/repositories`
3. **Implement Service** - Add business logic in `/services`
4. **Add Routes** - Create endpoints in `/routes`
5. **Write Tests** - Add tests in `/__tests__`
6. **Update Docs** - Document in `/docs`

### Code Style

- **TypeScript** - Use strict typing, avoid `any`
- **Async/Await** - Prefer over promises
- **Error Handling** - Use try/catch, throw custom errors
- **Naming** - Use descriptive names, follow conventions
- **Comments** - Document complex logic, not obvious code

### File Naming

- **kebab-case** - For file names: `project-service.ts`
- **PascalCase** - For classes: `ProjectService`
- **camelCase** - For functions/variables: `createProject`
- **UPPER_CASE** - For constants: `MAX_FILE_SIZE`

## 🔗 Related Documentation

- [Architecture Documentation](../docs/architecture/) - Detailed architecture docs
- [API Endpoints Reference](../docs/architecture/api-overview.md) - API documentation
- [Business Logic Layer](../docs/architecture/services-overview.md) - Service layer details
- [Data Models](../docs/architecture/models-overview.md) - Model documentation
- [Testing Strategy](../docs/guides/testing.md) - Testing guidelines

## 🚀 Quick Start for Developers

1. **Understand the architecture** - Read this document
2. **Review existing code** - Look at similar features
3. **Follow the patterns** - Maintain consistency
4. **Write tests** - Test as you develop
5. **Document changes** - Update relevant docs

## 📦 Key Dependencies

- **Express** - Web framework
- **TypeScript** - Type safety
- **Supabase** - Database and auth
- **Ethers.js** - Blockchain interaction
- **Winston** - Logging
- **Joi/Zod** - Validation
- **Jest** - Testing

## 🛠️ Development Commands

```bash
# Start development server
pnpm run dev

# Build TypeScript
pnpm run build

# Run tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Type checking
pnpm run type-check

# Linting
pnpm run lint
```

## 📄 Entry Points

- **index.ts** - Application entry point, starts server
- **app.ts** - Express app configuration, middleware setup, route mounting

## 🔒 Security Considerations

- **Input Validation** - All inputs validated at route level
- **Authentication** - JWT tokens required for protected routes
- **Authorization** - RBAC enforced in middleware
- **SQL Injection** - Prevented by Supabase parameterized queries
- **XSS Protection** - Input sanitization and output encoding
- **Rate Limiting** - API rate limits enforced
- **CORS** - Configured for allowed origins only

---

For more detailed information about specific components, refer to the [architecture documentation](../docs/architecture/).
