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
- **4 Categories:** Blockchain, Frontend, Backend, Design
- **10 Core Skills:** Solidity, Rust, Hardhat, React, TypeScript, Tailwind CSS, Node.js, Python, Figma, UI/UX Design

#### B. Demo Accounts & Profiles
| User ID | Email | Role | Name / Organization | Hourly Rate |
| :--- | :--- | :--- | :--- | :--- |
| `freelancer-1` | `ana@freelance.com` | Freelancer | Ana Reyes (Smart Contract Auditor) | $50/hr |
| `freelancer-2` | `juan@web3.dev` | Freelancer | Juan dela Cruz (Web3 UI/UX Designer) | $28/hr |
| `freelancer-3` | `maria@fullstack.io` | Freelancer | Maria Santos (Full-Stack Web Developer) | $45/hr |
| `employer-1` | `sarah@techcorp.com` | Employer | Sarah Chen (TechCorp) | — |
| `employer-2` | `mike@blockchain.io` | Employer | Mike Johnson (Blockchain.io) | — |
| `employer-3` | `alex@defi.finance` | Employer | Alex Rivera (DeFi Finance) | — |

#### C. KYC Verifications (All 6 `APPROVED`)
Prevents live demo interruptions by auto-approving Didit KYC verification for all demo users:
| Document ID | User ID | Document Type | Status | Flags Verified | Admin Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `kyc-freelancer-1` | `freelancer-1` | PASSPORT (`P1234567A`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved demo account |
| `kyc-freelancer-2` | `freelancer-2` | NATIONAL_ID (`N7654321B`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved demo account |
| `kyc-freelancer-3` | `freelancer-3` | DRIVERS_LICENSE (`D9876543C`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved demo account |
| `kyc-employer-1` | `employer-1` | PASSPORT (`E1122334D`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved employer account |
| `kyc-employer-2` | `employer-2` | PASSPORT (`E2233445E`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved employer account |
| `kyc-employer-3` | `employer-3` | PASSPORT (`E3344556F`) | `approved` | Doc: ✓, Liveness: ✓, Face: ✓ | Auto-approved employer account |

#### D. Active Projects with Milestones (6 Projects)
| Project ID | Employer | Title | Budget | Status | Milestones Count | Required Skills |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `project-1` | Sarah Chen (`employer-1`) | Decentralized Exchange (DEX) Frontend | $8,000 | Open | 3 Milestones ($3k, $3k, $2k) | React, TypeScript, Tailwind |
| `project-2` | Mike Johnson (`employer-2`) | Smart Contract Audit for DeFi Protocol | $15,000 | Open (Rush) | 3 Milestones ($5k, $7k, $3k) | Solidity, Hardhat |
| `project-3` | Alex Rivera (`employer-3`) | NFT Marketplace Development | $12,000 | Open | 3 Milestones ($4k, $4k, $4k) | React, Node.js, Solidity |
| `project-4` | Sarah Chen (`employer-1`) | DAO Governance Dashboard | $6,500 | Open | 3 Milestones ($2k, $2.5k, $2k) | React, Figma, UI/UX Design |
| `project-5` | Mike Johnson (`employer-2`) | Cross-Chain Bridge UI | $9,000 | Open (Rush) | 3 Milestones ($3k, $4k, $2k) | React, TypeScript, Rust |
| `project-6` | Alex Rivera (`employer-3`) | DeFi Yield Aggregator | $14,000 | Open | 4 Milestones ($6k, $4k, $4k) | Solidity, Node.js, Python |

#### E. Freelancer Portfolios (4 Projects)
| Item ID | Freelancer | Portfolio Title | Technologies Used |
| :--- | :--- | :--- | :--- |
| `port-1` | Ana Reyes (`freelancer-1`) | Decentralized Exchange (DEX) & AMM Liquidity Frontend | React, TypeScript, EVM, Ethers.js, Tailwind CSS |
| `port-2` | Ana Reyes (`freelancer-1`) | Decentralized Freelance & Milestone Escrow Protocol | Solidity, Smart Contracts, Polygon, React, Next.js |
| `port-3` | Juan dela Cruz (`freelancer-2`) | Web3 Multi-Chain NFT Marketplace UI | Figma, UI/UX Design, Tailwind CSS, React |
| `port-4` | Maria Santos (`freelancer-3`) | Enterprise Web3 Analytics & Subgraph Dashboard | Node.js, TypeScript, React, Python |


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
