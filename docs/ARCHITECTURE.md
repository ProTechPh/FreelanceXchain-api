# System Architecture

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
│  │  Azure Cosmos DB  │  │ │ │ Ethereum Network│ │ │  │  Google Gemini    │  │
│  │                   │  │ │ │  (Sepolia/Local)│ │ │  │      API          │  │
│  │  • Users          │  │ │ └─────────────────┘ │ │  └───────────────────┘  │
│  │  • Projects       │  │ │         │           │ │           │             │
│  │  • Proposals      │  │ │         ▼           │ │           ▼             │
│  │  • Contracts      │  │ │ ┌─────────────────┐ │ │  • Skill Matching       │
│  │  • Notifications  │  │ │ │ Smart Contracts │ │ │  • Skill Extraction     │
│  │  • Skills         │  │ │ │ • Escrow        │ │ │  • Gap Analysis         │
│  └───────────────────┘  │ │ │ • Reputation    │ │ │  • Recommendations      │
└─────────────────────────┘ │ └─────────────────┘ │ └─────────────────────────┘
                            └─────────────────────┘
```

## Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           MIDDLEWARE LAYER                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │   Auth     │  │  Request   │  │   Error    │  │ Validation │           │
│  │ Middleware │  │  Logger    │  │  Handler   │  │ Middleware │           │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL INTEGRATIONS                               │
│                                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐                        │
│  │    Web3 Client      │    │     AI Client       │                        │
│  │  ┌───────────────┐  │    │  ┌───────────────┐  │                        │
│  │  │ Ethers.js     │  │    │  │ Gemini API    │  │                        │
│  │  │ Provider      │  │    │  │ Integration   │  │                        │
│  │  └───────────────┘  │    │  └───────────────┘  │                        │
│  │  ┌───────────────┐  │    │  ┌───────────────┐  │                        │
│  │  │ Contract      │  │    │  │ Keyword       │  │                        │
│  │  │ Interactions  │  │    │  │ Fallback      │  │                        │
│  │  └───────────────┘  │    │  └───────────────┘  │                        │
│  └─────────────────────┘    └─────────────────────┘                        │
└────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### 1. User Registration & Authentication

```
┌──────┐     ┌─────────┐     ┌─────────────┐     ┌──────────┐
│Client│────▶│Auth API │────▶│Auth Service │────▶│Cosmos DB │
└──────┘     └─────────┘     └─────────────┘     └──────────┘
    │                              │
    │◀─────── JWT Token ───────────┤
```

### 2. Project Creation & Proposal Flow

```
┌────────┐    ┌───────────┐    ┌─────────────┐    ┌──────────┐
│Employer│───▶│Project API│───▶│Project Svc  │───▶│Cosmos DB │
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
                              │  Cosmos DB    │
                              │ (Status Update)│
                              └───────────────┘
```

### 4. AI Matching Flow

```
┌──────────┐    ┌────────────┐    ┌─────────────┐    ┌────────────┐
│Freelancer│───▶│Matching API│───▶│Matching Svc │───▶│ AI Client  │
└──────────┘    └────────────┘    └─────────────┘    └────────────┘
                                        │                  │
                                        │                  ▼
                                        │          ┌────────────┐
                                        │          │Gemini API  │
                                        │          └────────────┘
                                        │                  │
                                        │◀─── Match Scores─┤
                                        │
                                        ▼
                              ┌───────────────────┐
                              │ Ranked Project    │
                              │ Recommendations   │
                              └───────────────────┘
```

### 5. Reputation Flow

```
┌──────┐    ┌──────────────┐    ┌─────────────────┐    ┌────────────────────┐
│ User │───▶│Reputation API│───▶│Reputation Svc   │───▶│Reputation Contract │
└──────┘    └──────────────┘    └─────────────────┘    └────────────────────┘
                                        │                       │
                                        │                       │ On-chain
                                        │                       │ Storage
                                        │                       ▼
                                        │              ┌────────────────┐
                                        │              │ Immutable      │
                                        │              │ Rating Record  │
                                        │              └────────────────┘
                                        │
                                        ▼
                              ┌───────────────────┐
                              │   Cosmos DB       │
                              │ (Cache/Reference) │
                              └───────────────────┘
```

## Smart Contract Architecture

### FreelanceEscrow Contract

```
┌─────────────────────────────────────────────────────────────────┐
│                     FreelanceEscrow                              │
├─────────────────────────────────────────────────────────────────┤
│ State Variables:                                                 │
│   • employer: address                                           │
│   • freelancer: address                                         │
│   • arbiter: address                                            │
│   • milestones: Milestone[]                                     │
│   • totalAmount: uint256                                        │
│   • releasedAmount: uint256                                     │
│   • isActive: bool                                              │
├─────────────────────────────────────────────────────────────────┤
│ Functions:                                                       │
│   • constructor(freelancer, arbiter, milestones) payable        │
│   • submitMilestone(index) - Freelancer                         │
│   • approveMilestone(index) - Employer → Releases ETH           │
│   • disputeMilestone(index) - Either party                      │
│   • resolveDispute(index, decision) - Arbiter                   │
│   • refundMilestone(index) - Employer                           │
│   • cancelContract() - Employer                                 │
├─────────────────────────────────────────────────────────────────┤
│ Events:                                                          │
│   • FundsDeposited, MilestoneSubmitted, MilestoneApproved       │
│   • MilestoneDisputed, MilestoneRefunded, DisputeResolved       │
└─────────────────────────────────────────────────────────────────┘
```

### FreelanceReputation Contract

```
┌─────────────────────────────────────────────────────────────────┐
│                   FreelanceReputation                            │
├─────────────────────────────────────────────────────────────────┤
│ State Variables:                                                 │
│   • ratings: Rating[]                                           │
│   • userRatings: mapping(address => uint256[])                  │
│   • givenRatings: mapping(address => uint256[])                 │
│   • ratingExists: mapping(bytes32 => bool)                      │
│   • totalScore: mapping(address => uint256)                     │
│   • ratingCount: mapping(address => uint256)                    │
├─────────────────────────────────────────────────────────────────┤
│ Functions:                                                       │
│   • submitRating(ratee, score, comment, contractId, isEmployer) │
│   • getAverageRating(user) → uint256                            │
│   • getRatingCount(user) → uint256                              │
│   • getUserRatingIndices(user) → uint256[]                      │
│   • getRating(index) → Rating                                   │
│   • hasRated(rater, ratee, contractId) → bool                   │
├─────────────────────────────────────────────────────────────────┤
│ Events:                                                          │
│   • RatingSubmitted(index, rater, ratee, score, contractId)     │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema (Cosmos DB)

### Collections

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     users       │  │    projects     │  │   proposals     │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ id (PK)         │  │ id (PK)         │  │ id (PK)         │
│ email           │  │ employerId      │  │ projectId       │
│ passwordHash    │  │ title           │  │ freelancerId    │
│ role            │  │ description     │  │ coverLetter     │
│ walletAddress   │  │ requiredSkills  │  │ proposedRate    │
│ createdAt       │  │ budget          │  │ status          │
│ updatedAt       │  │ milestones      │  │ createdAt       │
└─────────────────┘  │ status          │  └─────────────────┘
                     │ deadline        │
                     └─────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   contracts     │  │    disputes     │  │  notifications  │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ id (PK)         │  │ id (PK)         │  │ id (PK)         │
│ projectId       │  │ contractId      │  │ userId          │
│ proposalId      │  │ milestoneIndex  │  │ type            │
│ freelancerId    │  │ initiatorId     │  │ title           │
│ employerId      │  │ reason          │  │ message         │
│ escrowAddress   │  │ evidence        │  │ data            │
│ totalAmount     │  │ status          │  │ isRead          │
│ status          │  │ resolution      │  │ createdAt       │
└─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐
│     skills      │  │ skill_categories│
├─────────────────┤  ├─────────────────┤
│ id (PK)         │  │ id (PK)         │
│ categoryId      │  │ name            │
│ name            │  │ description     │
│ description     │  │ isActive        │
│ isActive        │  └─────────────────┘
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
│  │ Input Validation: Request validation middleware          │    │
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
