/**
 * SLI Metrics Service
 *
 * Aggregates the availability + latency SLIs defined in docs/reliability/slo.md
 * straight from request-logger timings (the measurement source named in the SLO
 * doc). Counts are bucketed by endpoint class so the dashboard and contracts
 * budgets can be measured independently of the global baseline.
 *
 * The store is intentionally in-process (no Redis/db): metrics are best-effort
 * observability, and losing a few samples during a restart is acceptable — the
 * alternative (a hard dependency in the request path) would violate the fail-open
 * principle used everywhere else. A 30-day rolling window matches the SLO doc.
 */

export type SliRouteClass = 'dashboard' | 'contracts' | 'global';

export type SliLatency = {
  p50: number;
  p95: number;
  p99: number;
};

export type SliSummary = {
  routeClass: SliRouteClass;
  windowDays: number;
  totalRequests: number;
  serverErrorRequests: number;
  /** Availability = 1 - (server errors / total). 4xx are excluded from the error budget. */
  availability: number;
  /** How much of the monthly error budget has been consumed by the observed error rate. */
  errorBudgetBurn: number;
  latency: SliLatency;
  latencySamples: number;
};

/** 99.5% availability target from docs/reliability/slo.md. */
const SLO_AVAILABILITY = 0.995;
const SLI_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30-day rolling window

/** A single recorded request. Every request logged by request-logger pushes one. */
type SliSample = {
  at: number;
  ms: number;
  /** true when the response status was >= 500 (counts against the error budget). */
  serverError: boolean;
};

/**
 * Totals are derived from the retained samples (never stored as separate
 * counters), so pruning the window automatically drops old counts too.
 */
type SliClassStore = {
  samples: SliSample[];
};

const stores = new Map<SliRouteClass, SliClassStore>();
const ROUTE_CLASSES: SliRouteClass[] = ['dashboard', 'contracts', 'global'];

function storeFor(routeClass: SliRouteClass): SliClassStore {
  let store = stores.get(routeClass);
  if (!store) {
    store = { samples: [] };
    stores.set(routeClass, store);
  }
  return store;
}

/**
 * Classify a request path into an endpoint class for the SLO latency budgets.
 * Path-segment matching (not prefix) so sibling routes like
 * /api/dashboard-settings are not miscounted as dashboard. Query strings are
 * stripped defensively (req.path has none, but callers may pass full URLs).
 */
export function classifyRouteClass(path: string): SliRouteClass {
  const cleanPath = path.split('?')[0]!;
  if (cleanPath === '/api/dashboard' || cleanPath.startsWith('/api/dashboard/')) return 'dashboard';
  if (cleanPath === '/api/contracts' || cleanPath.startsWith('/api/contracts/')) return 'contracts';
  return 'global';
}

/** Drop samples older than the 30-day window from a class store. */
function pruneWindow(store: SliClassStore, now: number): void {
  const cutoff = now - SLI_WINDOW_MS;
  if (store.samples.length > 0 && store.samples[0]!.at < cutoff) {
    store.samples = store.samples.filter((s) => s.at >= cutoff);
  }
}

/**
 * Record one request sample. Best-effort, never throws — metrics must not
 * interfere with the request path it measures.
 */
export function recordSliSample(
  routeClass: SliRouteClass,
  statusCode: number,
  durationMs: number
): void {
  const store = storeFor(routeClass);
  const now = Date.now();
  pruneWindow(store, now);

  store.samples.push({ at: now, ms: durationMs, serverError: statusCode >= 500 });

  // Bound memory: only the most recent 100k samples per class are kept.
  if (store.samples.length > 100_000) {
    store.samples = store.samples.slice(store.samples.length - 100_000);
  }
}

/**
 * Nearest-rank percentile. Integer math avoids float drift (e.g. 0.95 * 100)
 * shifting the index; the result is the smallest value such that at least p%
 * of samples are <= it.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p * sorted.length) / 100) - 1);
  return sorted[index]!;
}

/** Summarize one endpoint class against the SLO. */
export function getSliSummary(routeClass: SliRouteClass): SliSummary {
  const store = storeFor(routeClass);
  pruneWindow(store, Date.now());

  const total = store.samples.length;
  let serverError = 0;
  for (const sample of store.samples) {
    if (sample.serverError) serverError += 1;
  }

  const availability = total === 0 ? 1 : 1 - serverError / total;

  // Error budget burn: observed error rate as a fraction of the allowed rate
  // (1 - SLO). >1 means the budget for this window has been fully consumed.
  const allowedErrorRate = 1 - SLO_AVAILABILITY;
  const errorBudgetBurn = total === 0 ? 0 : Math.min((1 - availability) / allowedErrorRate, 10);

  const sorted = store.samples.map((s) => s.ms).sort((a, b) => a - b);
  const latency: SliLatency = {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };

  return {
    routeClass,
    windowDays: 30,
    totalRequests: total,
    serverErrorRequests: serverError,
    availability: Number(availability.toFixed(5)),
    errorBudgetBurn: Number(errorBudgetBurn.toFixed(5)),
    latency,
    latencySamples: sorted.length,
  };
}

export function getAllSliSummaries(): SliSummary[] {
  return ROUTE_CLASSES.map(getSliSummary);
}

/** Test helper: clear all accumulated samples. */
export function resetSliMetrics(): void {
  stores.clear();
}
