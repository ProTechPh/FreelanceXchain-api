# Reliability & SLO

This document formalizes the service-level objectives (SLOs), error budget, and
recovery targets for the FreelanceXchain API. It follows the Google SRE
workbook discipline: an SLO is only useful with a named error-budget owner,
measurable SLIs, and explicit latency targets.

- **Error-budget owner:** API/platform lead (role owned by the project
  maintainer — the individual with merge rights on the release pipeline).
  Named approver for any SLO change or budget exhaustion response.
- **Last reviewed:** 2026-08-11
- **Status:** Draft — to be confirmed by the product owner for the availability
  tier (see [Open items](#open-items)).

---

## 1. SLI definitions

| SLI | Definition | Measurement source |
| --- | ---------- | ------------------ |
| **Availability** | Successful requests ÷ total requests, sampled per calendar month. Success = HTTP < 500 (client/validation errors excluded). | API access logs, health-check probes |
| **Latency** | Server processing time (request received → response headers sent). | `request-logger` timings |
| **Error budget burn** | Time rate at which the error budget is being consumed. | Monthly aggregation of availability SLI |

All SLIs are computed over a 30-day rolling window.

## 2. SLO targets

| Endpoint class | Availability SLO | Latency budget (server-side, p95) |
| -------------- | ---------------- | --------------------------------- |
| **Dashboard** (`GET /api/dashboard`) | 99.5% | p50 ≤ 120 ms · p95 ≤ 400 ms · p99 ≤ 900 ms |
| **Contracts** (list/detail under `/api/contracts`) | 99.5% | p50 ≤ 100 ms · p95 ≤ 350 ms · p99 ≤ 800 ms |
| **Global (all endpoints)** | 99.5% | p50 ≤ 200 ms · p95 ≤ 600 ms · p99 ≤ 1,200 ms |

### Latency budget rationale

- **Dashboard** composes four independent count queries plus an unread
  notification count, all executed in parallel (`Promise.all`). Its latency is
  dominated by the slowest of those queries, so the budget is set ~15% above the
  contract list budget. If the count queries regress (e.g. N+1 or list
  materialization creeps back in), p95 breaches this budget.
- **Contracts** list/detail are single-query reads (plus optional relation
  enrichment for detail), so the budget is the tightest of the monitored set.
- The **global** budget reflects mixed workloads including blockchain-backed
  writes and AI matching, which are inherently slower than pure reads.

These budgets assume the current **read-heavy (~20:1) workload at p99 < 50 QPS**
(shared multi-tenant Appwrite, `node-express` modular-monolith profile). They
must be re-baselined if QPS grows past ~50 p99 or a new slow dependency
(LLM matching on the hot path, on-chain calls in request handlers) is added.

## 3. Error budget

| Availability SLO | Allowed monthly downtime | Monthly error budget |
| ---------------- | ------------------------ | -------------------- |
| 99.5% | ~3.65 hours | 0.5% of requests |

- The budget is **not** consumed by 4xx responses (client errors), maintenance
  windows declared in advance, or deliberately rate-limited requests.
- **Burn alert:** if the projected monthly consumption exceeds 2× the budget
  rate before day 15 of the month, the owner triggers the incident process and
  pauses non-essential feature work until the cause is remediated.

## 4. Recovery targets (RPO / RTO)

| Target | Value | Notes |
| ------ | ----- | ----- |
| **RPO** (Recovery Point Objective) | 5 minutes | Wallet addresses, KYC verification state, and in-flight payments are user-visible and must not be lost. Appwrite is the source of truth; on-chain state is recoverable from the chain. |
| **RTO** (Recovery Time Objective) | 15 minutes | Restore a read-capable API (start instances, reconnect to Appwrite/Redis). Full write capability within 60 minutes if infrastructure is partially degraded. |

### Key recovery flows

1. **Appwrite unavailable:** API returns 503 from `health-routes`; read traffic
   fails fast. Restore the Appwrite project, then re-connect the repository
   layer. Counts degrade to 0 per repository error contracts — acceptable for a
   read-only dashboard for up to 15 minutes.
2. **Redis unavailable:** rate limiters fail open (auth limiters fail closed).
   Webhook endpoints continue to verify signatures (HMAC) but lose per-IP
   throttling until Redis returns.
3. **Blockchain RPC unavailable:** in `simulated` mode nothing is affected; in
   `real` mode, blockchain-backed operations (escrow, reputation) fail with a
   clear service error. On-chain data remains authoritative and can be
   re-indexed after recovery.

## 5. Dashboards & alerts

- Track p50/p95/p99 latency per endpoint class and the availability SLI from
  request logs.
- Alert when p95 latency exceeds the budget above for ≥ 5 consecutive minutes
  or when error-budget burn exceeds the threshold in §3.

## 6. Open items

- [ ] Product owner confirmation of the 99.5% availability tier (vs. 99.9%,
      which would require redundancy for Appwrite and Redis).
- [ ] Automated SLI aggregation (currently logged but not exported to a
      metrics backend).
- [ ] Baseline latency measurement on staging to validate the budgets above
      before production sign-off.

---

## Appendix: forcing-question record

This document resolves the architecture grill for the reliability dimension:

1. **Read/write ratio + QPS:** ~20:1 read-heavy, p99 < 50 QPS (drives the
   latency budgets above).
2. **Tenancy:** shared multi-tenant on Appwrite (no per-tenant isolation
   concerns in the SLOs).
3. **Sync/async:** sync REST plus event-driven notifications; webhooks are
   async-safe (HMAC-verified, rate-limited, idempotent processing where
   applicable).
4. **Data sensitivity:** PII (KYC, wallet addresses) — recovery targets are
   set to minimize exposure of these fields (RPO 5 min).
5. **Architecture:** modular monolith, layered routes → services →
   repositories.
6. **RPO + RTO:** 5 min / 15 min (see §4).
7. **SLO + named error-budget owner:** 99.5% availability, owner named above.
