# Technology Stack & Dependencies

<cite>
**Referenced Files in This Document**   
- [package.json](file://package.json)
- [hardhat.config.cjs](file://hardhat.config.cjs)
- [Dockerfile](file://Dockerfile)
- [env.ts](file://src/config/env.ts)
- [supabase.ts](file://src/config/supabase.ts)
- [app.ts](file://src/app.ts)
- [ai-client.ts](file://src/services/ai-client.ts)
- [web3-client.ts](file://src/services/web3-client.ts)
- [blockchain-client.ts](file://src/services/blockchain-client.ts)
</cite>

## Table of Contents
1. [Core Technology Stack](#core-technology-stack)
2. [Dependency Categorization](#dependency-categorization)
3. [Technology Rationale](#technology-rationale)
4. [Containerization Strategy](#containerization-strategy)
5. [Third-Party Integrations](#third-party-integrations)
6. [Dependency Management](#dependency-management)

## Core Technology Stack

The FreelanceXchain platform leverages a modern technology stack combining blockchain, AI, and traditional web technologies to create a decentralized freelance marketplace. The architecture is built around TypeScript as the primary language, Express.js for REST API handling, Supabase for database and authentication, Hardhat for Ethereum smart contract development, and ethers.js for blockchain interaction.

TypeScript serves as the foundation for backend development, providing static typing that enhances code quality, maintainability, and developer productivity. The type safety offered by TypeScript reduces runtime errors and improves code documentation, making the codebase more robust and easier to understand.

Express.js functions as the web application framework, handling REST API requests and responses. It provides a minimalist and flexible Node.js web application framework for building single-page, multi-page, and hybrid web applications. The framework's middleware architecture enables efficient request processing and response handling.

Supabase acts as the PostgreSQL database provider and authentication system. It offers real-time capabilities through PostgreSQL's replication functionality and implements Row Level Security (RLS) for fine-grained access control. This allows the application to securely expose the database directly to clients while maintaining data integrity and privacy.

Hardhat serves as the Ethereum development environment, providing tools for compiling, testing, debugging, and deploying smart contracts. Its local blockchain testing capability enables developers to simulate Ethereum network conditions without incurring gas costs, facilitating rapid development and thorough testing of blockchain functionality.

ethers.js is the library used for blockchain interaction, providing a comprehensive, compact, and efficient implementation for interacting with the Ethereum blockchain. It handles wallet management, transaction signing, contract interaction, and blockchain queries, abstracting the complexity of direct blockchain communication.

**Section sources**
- [package.json](file://package.json)
- [app.ts](file://src/app.ts)
- [env.ts](file://src/config/env.ts)

## Dependency Categorization

The dependencies in the FreelanceXchain project are organized into distinct categories based on their functionality and purpose within the application architecture.

### Core Frameworks
The core frameworks form the foundation of the application:
- **express**: Web application framework for handling HTTP requests and responses
- **@supabase/supabase-js**: Client library for interacting with Supabase services
- **typescript**: Programming language that adds static typing to JavaScript

### Blockchain Tools
These dependencies enable blockchain functionality and smart contract interaction:
- **ethers**: Comprehensive library for Ethereum blockchain interaction
- **hardhat**: Development environment for Ethereum smart contracts
- **@nomicfoundation/hardhat-ethers**: Hardhat plugin for ethers.js integration
- **@nomicfoundation/hardhat-toolbox**: Collection of essential Hardhat plugins

### Security Packages
Security-related dependencies protect the application and its users:
- **bcrypt**: Password hashing library for secure credential storage
- **helmet**: Middleware for setting various HTTP headers to enhance security
- **jsonwebtoken**: Implementation of JSON Web Tokens for authentication
- **cors**: Middleware for enabling Cross-Origin Resource Sharing with restrictions

### Testing Libraries
These dependencies support comprehensive testing of the application:
- **jest**: JavaScript testing framework for unit and integration tests
- **@types/jest**: Type definitions for Jest
- **ts-jest**: Jest transformer for TypeScript
- **fast-check**: Property-based testing library for generating test cases

### Development Utilities
Various utilities enhance the development experience:
- **dotenv**: Loads environment variables from .env files
- **eslint**: Linting tool for identifying and fixing code issues
- **@typescript-eslint/eslint-plugin**: ESLint plugin for TypeScript
- **tsx**: TypeScript execution tool for running TypeScript files directly
- **uuid**: Generates RFC4122 UUIDs for unique identifiers

**Section sources**
- [package.json](file://package.json)

## Technology Rationale

The technology choices in FreelanceXchain are driven by specific requirements for security, scalability, developer experience, and functionality in a decentralized freelance marketplace.

TypeScript's type safety provides significant benefits for a complex application like FreelanceXchain. By catching errors at compile time rather than runtime, TypeScript reduces bugs and improves code quality. The type system also serves as documentation, making the codebase more maintainable and easier for new developers to understand. This is particularly important in a system that handles financial transactions and sensitive user data.

Supabase was selected over traditional database solutions due to its real-time capabilities and Row Level Security (RLS) features. The real-time functionality enables instant updates across clients when data changes, which is essential for features like notification systems and live project updates. RLS allows the application to implement fine-grained access control directly at the database level, reducing the need for complex application-level permission checks and minimizing the risk of unauthorized data access.

Hardhat's local blockchain testing environment provides significant advantages for smart contract development. Developers can test contract functionality, edge cases, and failure scenarios without incurring gas costs on public networks. The ability to simulate different network conditions, mine blocks programmatically, and inspect transaction details enhances the testing process and ensures contract reliability before deployment to production networks.

The combination of these technologies creates a robust foundation for a decentralized application that requires both traditional web functionality and blockchain integration. The architecture separates concerns effectively, with Supabase handling relational data and authentication, while the blockchain manages smart contracts for escrow, reputation, and dispute resolution.

**Section sources**
- [package.json](file://package.json)
- [hardhat.config.cjs](file://hardhat.config.cjs)
- [supabase.ts](file://src/config/supabase.ts)

## Containerization Strategy

FreelanceXchain employs a multi-stage Docker build process to create optimized production containers while maintaining development efficiency. The Dockerfile implements a two-stage build strategy that separates development dependencies from production requirements.

The first stage, labeled "builder," uses the Node.js 20 Alpine image as its base. This stage installs all dependencies, including development packages required for TypeScript compilation. It copies the source code and compiles TypeScript to JavaScript, producing the transpiled output in the dist directory.

The second stage, labeled "production," creates a minimal runtime environment by again using the Node.js 20 Alpine image. This stage installs only production dependencies by using npm ci with the --omit=dev flag, significantly reducing the container size and attack surface. It then copies the compiled JavaScript files from the builder stage, sets environment variables, and configures the application to run on port 7860.

This multi-stage approach provides several benefits:
- **Smaller image size**: Production containers exclude development dependencies and source files
- **Improved security**: Reduced attack surface by minimizing installed packages
- **Faster deployment**: Smaller images transfer more quickly between environments
- **Consistent builds**: Reproducible build process across different environments
- **Separation of concerns**: Clear distinction between build-time and runtime dependencies

The containerization strategy ensures that the application can be deployed consistently across different environments, from development to production, while maintaining optimal performance and security characteristics.

**Section sources**
- [Dockerfile](file://Dockerfile)
- [package.json](file://package.json)

## Third-Party Integrations

FreelanceXchain integrates with external services to enhance functionality, particularly in the area of artificial intelligence. The most significant third-party integration is with the Google Gemini API, which powers the AI matching system.

The AI integration is implemented through the ai-client.ts service, which handles communication with the LLM API. This service includes robust error handling, retry logic, and timeout management to ensure reliable operation despite network conditions. The integration supports AI-powered skill matching between freelancers and projects, proposal generation, project description enhancement, and dispute analysis.

The architecture includes fallback mechanisms when the AI service is unavailable. For skill matching, the system implements keyword-based matching as a fallback to the AI-powered analysis. Similarly, skill extraction includes a keyword-based fallback when the AI service cannot be reached. This ensures that core functionality remains available even when external services experience outages.

The integration with Supabase extends beyond basic database operations to leverage its real-time capabilities. The application can subscribe to database changes, enabling features like instant notifications and live updates without requiring constant polling. This real-time functionality enhances the user experience by providing immediate feedback on actions taken within the platform.

The blockchain integration through ethers.js connects to Ethereum networks via Infura or Alchemy, allowing the application to interact with smart contracts on various networks including mainnet, testnets, and local development chains. This flexibility supports development, testing, and production deployment across different environments.

**Section sources**
- [ai-client.ts](file://src/services/ai-client.ts)
- [web3-client.ts](file://src/services/web3-client.ts)
- [blockchain-client.ts](file://src/services/blockchain-client.ts)
- [env.ts](file://src/config/env.ts)

## Dependency Management

The FreelanceXchain project employs npm for dependency management, utilizing package-lock.json to ensure consistent installations across different environments. The dependency strategy emphasizes stability, security, and compatibility through careful version selection and regular updates.

The project uses caret (^) version ranges in package.json to allow for minor and patch updates while preventing breaking changes. This approach balances the need for security updates and bug fixes with the stability required for production applications. Regular dependency audits are recommended to identify and address security vulnerabilities.

For blockchain-related dependencies, version compatibility is critical. The configuration specifies Solidity version 0.8.19 for smart contracts, which is compatible with the Hardhat and ethers.js versions in use. This ensures that contract compilation, testing, and deployment processes work reliably across different environments.

The multi-stage Docker build process supports effective dependency management by separating development and production dependencies. This not only reduces the production container size but also minimizes the risk of accidentally including development-only packages in production.

Upgrade strategies should follow a systematic approach:
1. Review changelogs for breaking changes
2. Update dependencies in development environment
3. Run comprehensive tests to verify functionality
4. Deploy to staging environment for further testing
5. Roll out to production with monitoring

Regular dependency updates are essential for maintaining security, especially for packages handling authentication, cryptography, and network communication. Automated tools can help identify outdated packages and security vulnerabilities, enabling proactive maintenance of the dependency ecosystem.

**Section sources**
- [package.json](file://package.json)
- [hardhat.config.cjs](file://hardhat.config.cjs)
- [Dockerfile](file://Dockerfile)