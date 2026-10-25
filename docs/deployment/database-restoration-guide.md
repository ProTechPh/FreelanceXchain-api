# Database Restoration & Panel Demo Guide

This guide provides step-by-step instructions for demonstrating database deletion, recovery, and initialization during thesis defenses and panel evaluations.

---

## 🎯 Panel Presentation Scenario

During technical evaluations or panel defenses, panel members often test the system's disaster recovery and resilience by asking:

> *"What happens if the database is deleted or corrupted? Can you rebuild it and get the system running immediately?"*

FreelanceXchain provides an **all-in-one idempotent setup and restore script** ([`scripts/setup-appwrite-db.ts`](../../scripts/setup-appwrite-db.ts)) that handles the entire restoration lifecycle in seconds.

---

## ⚡ Quick Restoration Commands

From the `FreelanceXchain-api` directory:

### Option 1: Clean Restoration (Without Seed Data)

Creates the database, all 39 collections, all attributes, all indexes, and all 5 storage buckets with required permissions without creating any mock documents:

```bash
pnpm run db:restore
```

*Alternative:* `npx tsx scripts/setup-appwrite-db.ts`

### Option 2: Full Restoration With Demo Seed Data (Recommended for Live Demo)

Creates the complete database architecture, storage buckets, and populates essential demo users, freelancer profiles, employer profiles, skills, categories, and active projects:

```bash
pnpm run db:restore:seed
```

*Alternative:* `npx tsx scripts/setup-appwrite-db.ts --seed`

---

## 📋 What Gets Restored

### 1. Appwrite Database Architecture

- **Database ID:** `freelancexchain`
- **Collections (39 total):**
  - Core Users & Auth: `users`, `pending_mfa_sessions`, `email_preferences`, `user_preferences`
  - Profiles & Portfolios: `freelancer_profiles`, `employer_profiles`, `portfolio_items`, `user_custom_skills`, `favorites`, `saved_searches`
  - Skills Catalog: `skill_categories`, `skills`, `skill_suggestions`
  - Projects & Bidding: `projects`, `proposals`, `rush_upgrade_requests`
  - Contracts & Milestones: `contracts`, `milestones`, `reviews`
  - Disputes & Evidence: `disputes`, `dispute_evidence`, `refund_requests`
  - Messaging & Alerts: `conversations`, `messages`, `notifications`, `emails`, `email_delivery_failures`
  - Payments & Billing: `payments`, `transactions`, `subscriptions`
  - KYC & Compliance: `kyc_verifications`, `audit_log_entries`
  - Blockchain Ledgers: `blockchain_transactions`, `blockchain_escrows`, `blockchain_escrow_milestones`, `blockchain_agreements`, `blockchain_milestones`, `blockchain_dispute_records`, `blockchain_ratings`

### 2. Appwrite Storage Buckets (5 total)

| Bucket ID | Name | Permissions |
| :--- | :--- | :--- |
| `proposal-attachments` | Proposal Attachments | Public Read, Authenticated Write |
| `project-attachments` | Project Attachments | Public Read, Authenticated Write |
| `dispute-evidence` | Dispute Evidence | Restricted (Private) |
| `portfolio-images` | Portfolio Images | Public Read, Authenticated Write |
| `milestone-deliverables` | Milestone Deliverables | Restricted (Private) |

### 3. Demo Seed Data (When using `--seed`)

When running `pnpm run db:restore:seed`, the script automatically seeds:

#### A. Skill Categories & Skills

- **16 categories** covering engineering, design, operations, data, management, writing, and specialist domains
- **183 skills** available for profiles, project requirements, and matching

#### B. Demo Accounts & Profiles

The full seed creates **20 freelancers and 20 employers**, plus the default administrator (**41 users total**). All accounts use `DEMO_USER_PASSWORD`, or `FreelanceXchain2026!` when that environment variable is not set.

| User ID | Email | Role | Name / Organization | Hourly Rate |
| :--- | :--- | :--- | :--- | :--- |
| `freelancer-1` | `ana@freelance.com` | Freelancer | Ana Reyes (Smart Contract Auditor) | $50/hr |
| `freelancer-2` | `juan@web3.dev` | Freelancer | Juan dela Cruz (Web3 UI/UX Designer) | $28/hr |
| `freelancer-3` | `maria@fullstack.io` | Freelancer | Maria Santos (Full-Stack Web Developer) | $35/hr |
| `employer-1` | `sarah@techcorp.com` | Employer | Sarah Chen (TechCorp) | — |
| `employer-2` | `mike@blockchain.io` | Employer | Mike Johnson (Blockchain.io) | — |
| `employer-3` | `alex@defi.finance` | Employer | Alex Rivera (DeFi Finance) | — |
| `freelancer-4` | `carlo@mobile.dev` | Freelancer | Carlo Mendoza (Mobile Engineer) | $42/hr |
| `freelancer-5` | `aisha@ml.engineer` | Freelancer | Aisha Khan (ML Engineer) | $65/hr |
| `freelancer-6` | `lucas@cloudops.dev` | Freelancer | Lucas Silva (Cloud/DevOps Engineer) | $55/hr |
| `freelancer-7` | `mei@security.pro` | Freelancer | Mei Tan (Security Specialist) | $72/hr |
| `freelancer-8` | `ethan@data.engineer` | Freelancer | Ethan Clark (Data Engineer) | $58/hr |
| `freelancer-9` | `isabella@product.design` | Freelancer | Isabella Rossi (Product Designer) | $46/hr |
| `freelancer-10` | `kenji@qa.automation` | Freelancer | Kenji Sato (QA Automation Engineer) | $48/hr |
| `employer-4` | `priya@aivista.io` | Employer | Priya Sharma (AI Vista) | — |
| `employer-5` | `daniel@cloudforge.dev` | Employer | Daniel Kim (CloudForge) | — |
| `employer-6` | `olivia@finsecure.co` | Employer | Olivia Brown (FinSecure) | — |
| `employer-7` | `liam@mobilefirst.app` | Employer | Liam Wilson (MobileFirst) | — |
| `employer-8` | `sofia@datapulse.ai` | Employer | Sofia Garcia (DataPulse) | — |
| `employer-9` | `emma@productlane.eu` | Employer | Emma Muller (ProductLane) | — |
| `employer-10` | `noah@qualitylabs.io` | Employer | Noah Martin (QualityLabs) | — |

Freelancers `freelancer-11` through `freelancer-20` and employers `employer-11` through `employer-20` add backend, performance, documentation, blockchain, data science, product, design, API, mobile, commerce, health, retail, clean-tech, fintech, education, logistics, creator, enterprise, travel, and agriculture profiles.

#### C. KYC Verifications

The seed creates KYC records for all 41 users. Thirty-eight are approved; `freelancer-2`, `freelancer-3`, and `admin-1` remain in review to populate the admin KYC queue.

| Document ID | User ID | Document Type | Status | Flags Verified | Admin Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `kyc-freelancer-1` | `freelancer-1` | PASSPORT (`P1234567A`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved demo account |
| `kyc-freelancer-2` | `freelancer-2` | NATIONAL_ID (`N7654321B`) | `completed` / review | Doc: ✓, Liveness: ✓, Face: ✓ | Populates admin review queue |
| `kyc-freelancer-3` | `freelancer-3` | DRIVERS_LICENSE (`D9876543C`) | `completed` / review | Doc: ✓, Liveness: ✓, Face: ✓ | Populates admin review queue |
| `kyc-employer-1` | `employer-1` | PASSPORT (`E1122334D`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved employer account |
| `kyc-employer-2` | `employer-2` | PASSPORT (`E2233445E`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved employer account |
| `kyc-employer-3` | `employer-3` | PASSPORT (`E3344556F`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved employer account |

#### D. Active Projects with Milestones (20 Projects)

| Project ID | Employer | Title | Budget | Status | Milestones Count | Required Skills |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `project-1` | Sarah Chen (`employer-1`) | Decentralized Exchange (DEX) Frontend | 2.5 | Open | 3 | React, TypeScript |
| `project-2` | Mike Johnson (`employer-2`) | Smart Contract Audit for DeFi Protocol | 4.5 | Open (Rush) | 3 | Solidity, Hardhat |
| `project-3` | Alex Rivera (`employer-3`) | NFT Marketplace Development | 3.6 | Open | 3 | React, Node.js, Solidity |
| `project-4` | Sarah Chen (`employer-1`) | DAO Governance Dashboard | 2.0 | Open | 3 | React, Figma, UI/UX Design |
| `project-5` | Mike Johnson (`employer-2`) | Cross-Chain Bridge UI | 1.8 | Open | 3 | React, Tailwind CSS, TypeScript |
| `project-6` | Alex Rivera (`employer-3`) | DeFi Yield Aggregator | 5.5 | Open | 4 | Solidity, Node.js, React |

Projects `project-7` through `project-20` add AI/RAG, Kubernetes, security, mobile, analytics, QA, product design, monitoring, documentation, computer vision, cloud cost, and identity work. Each includes required skills, tags, deadlines, budgets, and two milestones.

#### E. Freelancer Portfolios (20 Items)

| Item ID | Freelancer | Portfolio Title | Technologies Used |
| :--- | :--- | :--- | :--- |
| `port-1` | Ana Reyes (`freelancer-1`) | Decentralized Exchange (DEX) & AMM Liquidity Frontend | React, TypeScript, EVM, Ethers.js, Tailwind CSS |
| `port-2` | Ana Reyes (`freelancer-1`) | Decentralized Freelance & Milestone Escrow Protocol | Solidity, Smart Contracts, Polygon, React, Next.js |
| `port-3` | Juan dela Cruz (`freelancer-2`) | Web3 Multi-Chain NFT Marketplace UI | Figma, UI/UX Design, Tailwind CSS, React |
| `port-4` | Maria Santos (`freelancer-3`) | Enterprise Web3 Analytics & Subgraph Dashboard | Node.js, TypeScript, React, Python |

Items `port-5` through `port-20` distribute additional mobile, AI, cloud, security, data, design, and QA work across all 10 freelancer profiles.

---

## 🛠️ Step-by-Step Panel Demonstration Procedure

1. **Demonstrate Deletion (Optional by Panel):**
   - In Appwrite Cloud Console, navigate to `Databases` > `freelancexchain`.
   - Delete the database or individual collections.

2. **Execute Restoration:**

   ```bash
   pnpm run db:restore:seed
   ```

3. **Verify Restoration:**
   - Refresh the Appwrite Console to show all 39 collections and 5 storage buckets recreated.
   - Start or reload the frontend (`http://localhost:3000`) and backend (`http://localhost:3001`).
   - Log in with any of the seeded accounts to demonstrate live platform functionality.

4. **Deploy Smart Contracts (If blockchain was also wiped / switching networks):**
   - **Ganache (Local Demo):** `pnpm run deploy:contracts:ganache`
   - **Polygon (Production):** `pnpm run deploy:contracts:prod`
   - *For detailed instructions, see the [Smart Contract Deployment Guide](smart-contract-deployment-guide.md).*
