# Security Setup Guide

This guide provides step-by-step instructions for configuring GitHub repository security settings that cannot be automated through configuration files.

## Table of Contents
- [GitHub Advanced Security](#github-advanced-security)
- [Branch Protection Rules](#branch-protection-rules)
- [Dependabot Security Alerts](#dependabot-security-alerts)
- [Security Advisories](#security-advisories)
- [Code Scanning](#code-scanning)

---

## GitHub Advanced Security

GitHub Advanced Security (GHAS) is required to view SARIF security scan results uploaded by Trivy and other security tools.

### For Public Repositories
✅ **Already enabled by default** - No action needed

### For Private Repositories

1. Navigate to **Settings** → **Code security and analysis**
2. Enable the following features:
   - **Dependency graph** (if not already enabled)
   - **Dependabot alerts**
   - **Dependabot security updates**
   - **Code scanning** (GitHub Advanced Security required)
   - **Secret scanning** (GitHub Advanced Security required)

**Note:** GHAS requires a GitHub Enterprise license for private repositories.

---

## Branch Protection Rules

Protect your main branches from unauthorized changes and enforce security checks.

### Recommended Configuration for `main` branch

1. Go to **Settings** → **Branches** → **Add branch protection rule**
2. Branch name pattern: `main`
3. Enable the following rules:

#### Required Settings
- ✅ **Require a pull request before merging**
  - Require approvals: `1` (minimum)
  - Dismiss stale pull request approvals when new commits are pushed
  - Require review from Code Owners

- ✅ **Require status checks to pass before merging**
  - Require branches to be up to date before merging
  - Status checks that are required:
    - `typecheck` (from CI workflow)
    - `test` (from CI workflow)
    - `build` (from CI workflow)
    - `compile-and-test` (from Smart Contracts CI)
    - `slither` (from Smart Contracts CI)
    - `dependency-audit` (from Security workflow)
    - `secrets-scan` (from Security workflow)
    - `megalinter` (from MegaLinter workflow)

- ✅ **Require conversation resolution before merging**
- ✅ **Require signed commits** (recommended)
- ✅ **Require linear history** (optional, prevents merge commits)
- ✅ **Include administrators** (enforce rules for admins too)

#### Additional Security Settings
- ✅ **Do not allow bypassing the above settings**
- ✅ **Restrict who can push to matching branches**
  - Add: `ProTechPh` and trusted maintainers only

### Configuration for `develop` branch

Apply similar rules but with slightly relaxed requirements:
- Require approvals: `1`
- Same status checks as main
- Allow force pushes from maintainers (optional)

---

## Dependabot Security Alerts

Ensure Dependabot is configured to automatically detect and alert on vulnerable dependencies.

### Enable Dependabot Alerts

1. Go to **Settings** → **Code security and analysis**
2. Enable:
   - ✅ **Dependency graph**
   - ✅ **Dependabot alerts**
   - ✅ **Dependabot security updates**

### Configure Notifications

1. Go to **Settings** → **Notifications**
2. Under **Dependabot alerts**:
   - ✅ Enable email notifications
   - ✅ Enable web notifications
   - Set severity threshold: **High and Critical**

### Review Existing Alerts

1. Navigate to **Security** → **Dependabot alerts**
2. Review and address any existing vulnerabilities
3. Set up automatic security updates in `.github/dependabot.yml` (already configured)

---

## Security Advisories

Configure how security vulnerabilities are reported and managed.

### Enable Private Vulnerability Reporting

1. Go to **Settings** → **Code security and analysis**
2. Enable **Private vulnerability reporting**
3. This allows security researchers to privately report vulnerabilities

### Create Security Policy

A `SECURITY.md` file should be created in the repository root:

```markdown
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

Please report security vulnerabilities through GitHub's private vulnerability reporting:
1. Go to the Security tab
2. Click "Report a vulnerability"
3. Provide detailed information about the vulnerability

Alternatively, email security concerns to: [your-security-email]

We aim to respond within 48 hours and provide a fix within 7 days for critical issues.
```

---

## Code Scanning

Automated code scanning helps identify security vulnerabilities in your codebase.

### Enable CodeQL Analysis

1. Go to **Security** → **Code scanning**
2. Click **Set up code scanning**
3. Choose **CodeQL Analysis**
4. Select languages: **JavaScript/TypeScript**
5. Configure scan schedule:
   - On push to `main` and `develop`
   - On pull requests
   - Weekly scheduled scan

### Review Scan Results

1. Navigate to **Security** → **Code scanning alerts**
2. Review and triage alerts by severity
3. Create issues or fix directly
4. Dismiss false positives with justification

### Current Security Scans

The repository already has the following security scans configured:
- ✅ **Trivy** - Container vulnerability scanning (docker-hub.yml, release.yml)
- ✅ **TruffleHog** - Secret scanning (security.yml)
- ✅ **Slither** - Smart contract security analysis (smart-contracts.yml)
- ✅ **npm audit** - Dependency vulnerability scanning (security.yml)
- ✅ **MegaLinter** - Multi-language linting (megalinter.yml)

---

## Additional Security Measures

### Secret Scanning

1. Go to **Settings** → **Code security and analysis**
2. Enable **Secret scanning**
3. Enable **Push protection** to prevent secrets from being committed

### Security Insights

Monitor your security posture:
1. Navigate to **Insights** → **Security**
2. Review:
   - Dependency vulnerabilities over time
   - Code scanning trends
   - Secret scanning alerts

### Audit Log

For organizations:
1. Go to **Organization Settings** → **Audit log**
2. Monitor security-related events
3. Set up audit log streaming for compliance

---

## Verification Checklist

After completing the setup, verify:

- [ ] Branch protection rules are active on `main` and `develop`
- [ ] All required status checks are configured
- [ ] Dependabot alerts are enabled and notifications configured
- [ ] CODEOWNERS file is in place (`.github/CODEOWNERS`)
- [ ] Security policy is published (`SECURITY.md`)
- [ ] Code scanning is active (CodeQL or equivalent)
- [ ] Secret scanning is enabled with push protection
- [ ] Team members are aware of security policies
- [ ] Security contact information is up to date

---

## Maintenance

### Regular Security Tasks

**Weekly:**
- Review Dependabot alerts and PRs
- Check code scanning results

**Monthly:**
- Review and update CODEOWNERS
- Audit access permissions
- Review security policy

**Quarterly:**
- Security training for team members
- Review and update branch protection rules
- Conduct security audit

---

## Resources

- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Dependabot Documentation](https://docs.github.com/en/code-security/dependabot)
- [Code Scanning Documentation](https://docs.github.com/en/code-security/code-scanning)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

**Last Updated:** February 18, 2026
