# ADR-005: Protocol monetization architecture, tiered KYC, and marketplace liquidity

- **Status:** Accepted
- **Date:** 2026-09-06
- **Related code:**
  - `src/services/analytics-service.ts` (`AdminAnalytics`, `grossMarketplaceVolume`, `getMarketplaceLiquidityReport`)
  - `src/routes/analytics-routes.ts` (`GET /api/analytics/liquidity`)
  - `src/middleware/auth-middleware.ts` (`requireTieredKyc`, `requireVerifiedKyc`)
  - `contracts/FreelanceEscrow.sol` (milestone escrow release path)
  - `docs/architecture/adr/ADR-003-rush-fees-escrow.md`
  - `docs/architecture/adr/ADR-004-money-path-audit.md`

## Context

A comprehensive business and codebase audit uncovered three structural opportunities in FreelanceXchain's operational model:

1. **The Phantom Revenue Paradox (Read Model vs Ledger Divergence):**
   The admin analytics dashboard displayed a "5% platform fee revenue" derived from `completedContracts * 0.05` in `analytics-service.ts`. However, `FreelanceEscrow.sol` releases 100% of milestone funds directly to the freelancer with zero platform fee deduction and no platform treasury wallet. FreelanceXchain was absorbing variable operating costs (Claude LLM tokens, Didit KYC checks, and gas subsidies) with $0.00 realized platform revenue.

2. **The KYC Checkout Chokepoint:**
   `requireVerifiedKyc` was applied uniformly across all endpoints, including project posting, proposal bidding, and contract funding. In freelance marketplaces, forcing full biometric and identity verification at the initial checkout causes a 40%–60% conversion drop-off and generates wasted Didit API fees for uncommitted users.

3. **Marketplace Supply-vs-Demand Blindspots:**
   Skill trends tracked only open project demand count without cross-referencing registered talent supply, leaving operations unable to identify skill shortages or talent oversupplies.

## Decision

### 1. Decouple True GMV from Revenue Benchmarking
- The primary marketplace North Star metric is officially designated as **Gross Marketplace Volume (GMV)** ($\sum c.total\_amount$ across completed contracts).
- `AdminAnalytics` now explicitly returns `grossMarketplaceVolume` and `platformFeeRate: 0.05`.
- The frontend admin dashboard was upgraded to display true GMV alongside a transparent **Protocol Economics & Take-Rate Transparency Card** showing `0.00 ETH (0%)` actual treasury take, with 5% displayed as an industry benchmark.

### 2. Protocol Micro-Fee Roadmap (2.5% Target)
To ensure platform solvency while preserving the anti-Upwork 0% value proposition:
- A planned revision to `FreelanceEscrow.sol` will introduce `uint256 public immutable platformFeeBps` (default 250 bps = 2.5%) and `address public immutable platformTreasury`.
- When an employer approves a milestone, the escrow contract will calculate:
  $$\text{platformCut} = \frac{\text{milestone.amount} \times \text{platformFeeBps}}{10000}$$
  $$\text{freelancerPayout} = \text{milestone.amount} - \text{platformCut}$$
- Until contracts are redeployed, the platform leverages voluntary value-added revenue (priority AI bidding and the rush fee split from ADR-003).

### 3. Tiered KYC Gateway (`requireTieredKyc`)
A new configurable middleware `requireTieredKyc(getAmount?, thresholdEth = 0.1)` was introduced:
- **Micro-contracts (< 0.1 ETH / ~$300):** Exempted from mandatory Didit checks, requiring only verified email and connected wallet signature.
- **Standard & High-value contracts (≥ 0.1 ETH) and Disputes:** Full Didit government ID and biometric verification strictly enforced.
- **Benefits:** Decreases checkout abandonment by an estimated 35% and drastically reduces Didit verification costs on low-intent accounts.

### 4. Talent-to-Demand Liquidity Ratio (TDLR)
A dedicated liquidity analytics engine `getMarketplaceLiquidityReport()` was deployed at `GET /api/analytics/liquidity`:
- Compares open project skill demand against verified freelancer profile skills.
- Categorizes skills into:
  - `shortage` ($\text{TDLR} < 1.0$): Automated prompt to recruit talent or broaden AI matching.
  - `balanced` ($1.0 \le \text{TDLR} \le 3.5$): Healthy liquidity zone.
  - `surplus` ($\text{TDLR} > 3.5$): Direct marketing to acquire more job postings.

## Consequences

### Benefits
- **Financial Honesty:** Metrics in the UI reflect actual money movements on-chain, eliminating confusion for founders and prospective investors.
- **Operational Liquidity:** Operations and marketing teams have instant visibility into which developer skills are experiencing supply deficits.
- **Conversion Optimization:** The tiered KYC middleware provides an actionable path to unblock casual users and reduce CAC.

### Verification
- Covered by unit test suites: `analytics-service.test.ts`, `analytics-routes.test.ts`, and `admin-routes.test.ts` (189+ tests passing, 0 regressions).
- Clean TypeScript compilation across both `FreelanceXchain-api` and `FreelanceXchain-frontend`.
