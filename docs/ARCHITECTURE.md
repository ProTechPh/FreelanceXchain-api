# System Architecture

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Docker Container / Cloud Host                     │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  freelancexchain-api                                         │    │    │
│  │  │  Node.js + Express + TypeScript                              │    │    │
│  │  │  Port: 3000                                                  │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Supabase (PostgreSQL)                             │    │
│  │                    freelance-marketplace                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Docker Hub     │  │  Ethereum RPC   │  │    LLM          │             │
│  │  (Image Store)  │  │  (Blockchain)   │  │  (AI/LLM)       │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│                    (Web App / Mobile App / API Clients)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY                                     │
│                         Express.js REST API                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    Auth     │  │   Project   │  │  Proposal   │  │   Payment   │        │
│  │   Routes    │  │   Routes    │  │   Routes    │  │   Routes    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Matching   │  │ Reputation  │  │   Dispute   │  │Notification │        │
│  │   Routes    │  │   Routes    │  │   Routes    │  │   Routes    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SERVICE LAYER                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Auth Service   │  │ Project Service  │  │ Proposal Service │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Payment Service  │  │ Matching Service │  │Reputation Service│          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ Contract Service │  │ Dispute Service  │  │  Search Service  │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                   │                    │
                    ▼                   ▼                    ▼
┌─────────────────────────┐ ┌─────────────────────┐ ┌─────────────────────────┐
│     DATA LAYER          │ │   BLOCKCHAIN LAYER  │ │      AI LAYER           │
│  ┌───────────────────┐  │ │ ┌─────────────────┐ │ │  ┌───────────────────┐  │
│  │     Supabase      │  │ │ │ Ethereum Network│ │ │  │  Google Gemini    │  │
│  │   (PostgreSQL)    │  │ │ │  (Sepolia/Local)│ │ │  │      API          │  │
│  │                   │  │ │ └─────────────────┘ │ │  └───────────────────┘  │
│  │  • Users          │  │ │         │           │ │           │             │
│  │  • Projects       │  │ │         ▼           │ │           ▼             │
│  │  • Proposals      │  │ │ ┌─────────────────┐ │ │  • Skill Matching       │
│  │  • Contracts      │  │ │ │ Smart Contracts │ │ │  • Skill Extraction     │
│  │  • Notifications  │  │ │ │ • Escrow        │ │ │  • Gap Analysis         │
│  │  • Skills         │  │ │ │ • Reputation    │ │ │  • Recommendations      │
│  └───────────────────┘  │ │ └─────────────────┘ │ │                         │
└─────────────────────────┘ └─────────────────────┘ └─────────────────────────┘
```

## Data Flow Diagrams

### 1. User Registration & Authentication

```
┌──────┐     ┌─────────┐     ┌─────────────┐     ┌──────────┐
│Client│────▶│Auth API │────▶│Auth Service │────▶│ Supabase │
└──────┘     └─────────┘     └─────────────┘     └──────────┘
    │                              │
    │◀─────── JWT Token ───────────┤
```

### 2. Project Creation & Proposal Flow

```
┌────────┐    ┌───────────┐    ┌─────────────┐    ┌──────────┐
│Employer│───▶│Project API│───▶│Project Svc  │───▶│ Supabase │
└────────┘    └───────────┘    └─────────────┘    └──────────┘
                                      │
                                      ▼
┌──────────┐   ┌────────────┐   ┌─────────────┐
│Freelancer│──▶│Proposal API│──▶│Proposal Svc │
└──────────┘   └────────────┘   └─────────────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Notification  │
                              │   Service     │
                              └───────────────┘
```

### 3. Payment & Escrow Flow

```
┌────────┐    ┌────────────┐    ┌─────────────┐    ┌──────────────┐
│Employer│───▶│Payment API │───▶│Payment Svc  │───▶│Escrow Contract│
└────────┘    └────────────┘    └─────────────┘    └──────────────┘
                                      │                    │
                                      │                    │ ETH
                                      │                    ▼
┌──────────┐                          │            ┌──────────────┐
│Freelancer│◀─────── Notification ────┤            │  Freelancer  │
└──────────┘                          │            │   Wallet     │
                                      │            └──────────────┘
                                      ▼
                              ┌───────────────┐
                              │   Supabase    │
                              │ (Status Update)│
                              └───────────────┘
```

## Database Schema (Supabase PostgreSQL)

### Tables

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     users       │  │    projects     │  │   proposals     │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ id (PK, UUID)   │  │ id (PK, UUID)   │  │ id (PK, UUID)   │
│ email           │  │ employer_id (FK)│  │ project_id (FK) │
│ password_hash   │  │ title           │  │ freelancer_id   │
│ role            │  │ description     │  │ cover_letter    │
│ wallet_address  │  │ required_skills │  │ proposed_rate   │
│ created_at      │  │ budget          │  │ status          │
│ updated_at      │  │ milestones      │  │ created_at      │
└─────────────────┘  │ status          │  └─────────────────┘
                     │ deadline        │
                     └─────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   contracts     │  │    disputes     │  │  notifications  │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ id (PK, UUID)   │  │ id (PK, UUID)   │  │ id (PK, UUID)   │
│ project_id (FK) │  │ contract_id (FK)│  │ user_id (FK)    │
│ proposal_id (FK)│  │ milestone_id    │  │ type            │
│ freelancer_id   │  │ initiator_id    │  │ title           │
│ employer_id     │  │ reason          │  │ message         │
│ escrow_address  │  │ evidence (JSONB)│  │ data (JSONB)    │
│ total_amount    │  │ status          │  │ is_read         │
│ status          │  │ resolution      │  │ created_at      │
└─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐
│     skills      │  │ skill_categories│
├─────────────────┤  ├─────────────────┤
│ id (PK, UUID)   │  │ id (PK, UUID)   │
│ category_id (FK)│  │ name            │
│ name            │  │ description     │
│ description     │  │ is_active       │
│ is_active       │  └─────────────────┘
└─────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SECURITY LAYERS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Transport Security: HTTPS/TLS                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Authentication: JWT Bearer Tokens                        │    │
│  │   • Access Token (1h expiry)                            │    │
│  │   • Refresh Token (7d expiry)                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Authorization: Role-Based Access Control                 │    │
│  │   • Freelancer: Profile, proposals, contracts           │    │
│  │   • Employer: Projects, hiring, payments                │    │
│  │   • Admin: Full system access                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Database Security: Supabase Row Level Security (RLS)     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Smart Contract Security:                                 │    │
│  │   • Reentrancy guards                                   │    │
│  │   • Access modifiers (onlyEmployer, onlyFreelancer)     │    │
│  │   • Input validation                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
