# GitHub Workflows & CI/CD

Automated workflows for continuous integration, deployment, and quality assurance.

## 📁 Workflow Files

Located in `.github/workflows/`

### 🔄 Continuous Integration

#### ci.yml
**Purpose:** Main CI pipeline for code quality and testing

**Triggers:**
- Push to `main` and `develop` branches
- Pull requests to `main` and `develop`

**Jobs:**
- **Type Check** - TypeScript type checking with smart contract compilation
- **Test** - Run unit tests with coverage reporting
- **Build** - Build production artifacts

**Environment:** Node.js 20.x with pnpm

---

#### pr-checks.yml
**Purpose:** Additional checks for pull requests

**Triggers:**
- Pull request opened, synchronized, reopened, labeled, or unlabeled

**Jobs:**
- **Labeler** - Auto-label PRs based on changed files
- **Size Check** - Warn on large PRs (>1000 lines)

---

### 🔒 Security

#### security.yml
**Purpose:** Security scanning and vulnerability detection

**Triggers:**
- Push to `main`
- Pull requests to `main`
- Scheduled (weekly on Sunday)

**Jobs:**
- **Dependency Audit** - Run pnpm audit for vulnerable dependencies
- **Secrets Scan** - TruffleHog OSS for exposed secrets

**Tools:**
- pnpm audit
- TruffleHog

---

#### megalinter.yml
**Purpose:** Comprehensive code quality and security linting

**Triggers:**
- Push to `main` and `develop` branches
- Pull requests to `main` and `develop`

**Jobs:**
- Run MegaLinter with enabled linters
- Upload MegaLinter reports as artifacts

**Linters Enabled:**
- TypeScript ESLint
- JSON Lint
- YAML Lint
- Markdown Lint
- Dockerfile Hadolint
- Solidity Solhint

---

### ⛓️ Blockchain

#### smart-contracts.yml
**Purpose:** Smart contract compilation, testing, and security analysis

**Triggers:**
- Push to `main` and `develop` affecting `contracts/` or `hardhat.config.cjs`
- Pull requests to `main` affecting `contracts/` or `hardhat.config.cjs`

**Jobs:**
- **Compile and Test** - Compile contracts and run Hardhat tests
- **Slither** - Static analysis for security vulnerabilities

**Environment:**
- Node.js 20.x with pnpm
- Hardhat
- Slither

---

### 🚀 Deployment

#### docker-hub.yml
**Purpose:** Build and push Docker images to Docker Hub

**Triggers:**
- Push to `main` branch

**Jobs:**
- Build Docker image with Buildx
- Tag images (latest and commit SHA)
- Push to Docker Hub
- Run Trivy vulnerability scanner

**Tags:**
- `latest` - Latest main branch
- `<commit-sha>` - Specific commit

---

#### sync-huggingface.yml
**Purpose:** Deploy to Hugging Face Spaces

**Triggers:**
- Push to `main` branch

**Jobs:**
- Checkout repository with LFS
- Push to Hugging Face Space repository

**Environment:** production (https://protechph-freelancexchain.hf.space)

---

#### release.yml
**Purpose:** Automated release creation and Docker image publishing

**Triggers:**
- Push tags matching `v*`

**Jobs:**
- Build production artifacts
- Generate changelog
- Create GitHub release with release notes
- Build and push versioned Docker image
- Run Trivy vulnerability scanner on image

**Artifacts:**
- GitHub release with changelog
- Docker image tagged with version

---

## 🔧 Workflow Configuration

### Secrets Required

Configure these in GitHub Settings → Secrets:

| Secret | Description | Used In |
|--------|-------------|------|
| `DOCKERHUB_USERNAME` | Docker Hub username | docker-hub.yml, release.yml |
| `DOCKERHUB_TOKEN` | Docker Hub access token | docker-hub.yml, release.yml |
| `HF_TOKEN` | Hugging Face access token | sync-huggingface.yml |
| `GITHUB_TOKEN` | GitHub token (auto-provided) | All workflows |
| `HF_TOKEN` | Hugging Face token | sync-huggingface.yml |

### Environment Variables

Set in workflow files or GitHub Environments:

```yaml
env:
  NODE_VERSION: '20.x'
  BLOCKCHAIN_RPC_URL: 'https://sepolia.infura.io/v3/...'
  DOCKER_IMAGE: 'freelancexchain/api'
```

---

## 📊 Status Badges

Add to README.md:

```markdown
![CI](https://github.com/username/repo/workflows/CI/badge.svg)
![Security](https://github.com/username/repo/workflows/Security/badge.svg)
![Docker](https://github.com/username/repo/workflows/Docker%20Hub/badge.svg)
[![codecov](https://codecov.io/gh/username/repo/branch/main/graph/badge.svg)](https://codecov.io/gh/username/repo)
```

---

## 🛠️ Local Testing

### Test Workflows Locally

Use [act](https://github.com/nektos/act) to run workflows locally:

```bash
# Install act
brew install act  # macOS
# or
choco install act  # Windows

# Run CI workflow
act -j ci

# Run specific job
act -j test

# List available workflows
act -l
```

### Validate Workflow Syntax

```bash
# Install actionlint
brew install actionlint

# Validate all workflows
actionlint .github/workflows/*.yml
```

---

## 🔄 Workflow Best Practices

### 1. Fast Feedback
- Run quick checks first (linting, type checking)
- Parallel jobs when possible
- Cache dependencies

### 2. Security
- Never commit secrets
- Use GitHub Secrets
- Scan for vulnerabilities
- Verify dependencies

### 3. Reliability
- Use specific action versions (not @latest)
- Add timeout limits
- Handle failures gracefully
- Retry flaky tests

### 4. Efficiency
- Cache node_modules
- Cache Docker layers
- Skip unnecessary jobs
- Use matrix builds

---

## 📝 Adding New Workflows

1. **Create workflow file**
   ```bash
   touch .github/workflows/new-workflow.yml
   ```

2. **Define workflow**
   ```yaml
   name: New Workflow
   
   on:
     push:
       branches: [main]
   
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - name: Run task
           run: echo "Hello"
   ```

3. **Test locally**
   ```bash
   act -j build
   ```

4. **Commit and push**
   ```bash
   git add .github/workflows/new-workflow.yml
   git commit -m "Add new workflow"
   git push
   ```

---

## 🐛 Troubleshooting

### Workflow Fails

1. **Check logs** - View detailed logs in GitHub Actions tab
2. **Run locally** - Use `act` to reproduce
3. **Check secrets** - Verify all required secrets are set
4. **Review changes** - Check recent commits for breaking changes

### Common Issues

**"Secret not found"**
- Add secret in GitHub Settings → Secrets

**"Permission denied"**
- Check repository permissions
- Verify token scopes

**"Timeout"**
- Increase timeout in workflow
- Optimize slow steps

**"Cache miss"**
- Check cache key
- Verify cache paths

---

## 📚 Related Documentation

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [CI/CD Best Practices](../docs/guides/deployment.md)
- [Security Implementation](../docs/security/overview.md)
- [Testing Strategy](../docs/guides/testing.md)

---

## 🔗 Additional Files

### CODEOWNERS
Defines code ownership for automatic PR reviewer assignment.

```
# Backend
/src/**/*.ts @backend-team

# Smart Contracts
/contracts/**/*.sol @blockchain-team

# Documentation
/docs/** @docs-team
```

### dependabot.yml
Automated dependency updates.

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

### labeler.yml
Automatic PR labeling based on changed files.

```yaml
backend:
  - src/**/*

blockchain:
  - contracts/**/*

documentation:
  - docs/**/*
```

---

## 📊 Monitoring

### Workflow Metrics
- Success rate
- Average duration
- Failure patterns
- Resource usage

### Alerts
- Failed deployments
- Security vulnerabilities
- Test failures
- Performance degradation

---

For questions or issues with workflows, contact the DevOps team or open an issue.

