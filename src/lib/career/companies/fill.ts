import type { ResourceContext } from "../resources/types";
import { checkCompanySignals, signalsDue, type CompanySignals } from "./signals";

/**
 * Preparing companies' shared public information (overview and hiring signals)
 * before they are judged. Named companies are prepared before a search
 * evaluates; after it, companies that could reach the top while their
 * information is missing or stale are prepared and judged again. A search waits
 * only for its budget; what is not ready by then is judged with what exists and
 * finishes in the background for the next search. The per-company provider
 * lease keeps two requests from preparing one company at once.
 * (docs/career-good-opportunity-recommendation-ko.md 2.7)
 */

/** How long a search waits for the companies it names before judging them. */
export const NAMED_COMPANY_PREPARATION_BUDGET_MS = 40_000;
/** How long a search waits, after judging, for companies near the top whose information was missing or stale. */
export const TOP_COMPANY_FILL_BUDGET_MS = 30_000;
/** One company's preparation, including what continues after a search stops waiting. Shorter than the
 * three-minute provider lease, so a stuck provider call cannot hold a company's lease past it. */
export const COMPANY_PREPARATION_TIMEOUT_MS = 120_000;
/** Companies prepared at once. Each runs up to two web searches; this keeps a search's burst of
 * provider requests near the bounded concurrency used elsewhere for Exa. */
export const COMPANY_PREPARATION_CONCURRENCY = 6;

export type CompanyPreparation = (context: ResourceContext, workspaceId: string, signal: AbortSignal) => Promise<unknown>;

/** Overview when missing or past its cache window, and hiring signals when their last check is old; in parallel. */
export async function prepareCompany(context: ResourceContext, workspaceId: string, signal: AbortSignal) {
  const { refreshCompanySummaryIfDue } = await import("../resources/companyData");
  const [summary, signals] = await Promise.allSettled([
    refreshCompanySummaryIfDue(context, workspaceId, { signal }),
    checkCompanySignals(context, workspaceId, { signal }),
  ]);
  // Company search reads the overview; a new one enters the index for the next search.
  if (summary.status === "fulfilled" && summary.value === "refreshed") {
    const { indexCompanies } = await import("./discovery");
    await indexCompanies(context.admin, { ids: [workspaceId], signal }).catch(() => undefined);
  }
  // One part failing still leaves the other's information for the company.
  if (summary.status === "rejected" && signals.status === "rejected") throw summary.reason;
  return { summary: summary.status === "fulfilled" ? summary.value : undefined,
    signals: signals.status === "fulfilled" ? signals.value : undefined };
}

function keepAliveAfterResponse(work: Promise<unknown>) {
  import("next/server").then(({ after }) => after(() => work)).catch(() => undefined);
}

/** Resolves when work settles or the time is up, whichever is first; rejects only when the caller aborts. */
function waitWithin(work: Promise<unknown>, ms: number, signal?: AbortSignal) {
  return new Promise<boolean>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => { cleanup(); reject(signal!.reason); };
    // Node runs a timer longer than its 32-bit limit immediately.
    const timer = setTimeout(() => { cleanup(); resolve(false); }, Math.min(Math.max(0, ms), 2_147_483_647));
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); };
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(() => { cleanup(); resolve(true); });
  });
}

/**
 * Prepares the companies in the given order with bounded concurrency and waits
 * up to budgetMs. ready: finished in time. pending: still preparing; finishes in
 * the background. failed: their preparation failed (the search uses what exists).
 * deferred: with startWithinBudget, companies not started before the budget
 * passed; a later search that still finds them near the top prepares them.
 */
export async function prepareCompanies(context: ResourceContext, workspaceIds: readonly string[], options: {
  budgetMs: number;
  /** The budget also bounds how many companies are started, and so the provider cost of one search. */
  startWithinBudget?: boolean;
  signal?: AbortSignal;
  prepare?: CompanyPreparation;
  keepAlive?: (work: Promise<unknown>) => void;
}) {
  const ids = [...new Set(workspaceIds.filter(Boolean))];
  const prepare = options.prepare ?? prepareCompany;
  const started = new Set<string>(), ready = new Set<string>(), failed = new Set<string>();
  let next = 0, waiting = true;
  const worker = async () => {
    while (next < ids.length && (waiting || !options.startWithinBudget)) {
      const id = ids[next++];
      started.add(id);
      try {
        await prepare(context, id, AbortSignal.timeout(COMPANY_PREPARATION_TIMEOUT_MS));
        ready.add(id);
      } catch (error) {
        failed.add(id);
        console.warn("[career/company-preparation] company skipped", { companyWorkspaceId: id, error: String(error) });
      }
    }
  };
  const all = Promise.all(Array.from({ length: Math.min(COMPANY_PREPARATION_CONCURRENCY, ids.length) }, worker));
  let finished = false;
  try {
    finished = ids.length ? await waitWithin(all, options.budgetMs, options.signal) : true;
  } finally {
    waiting = false;
    if (!finished) (options.keepAlive ?? keepAliveAfterResponse)(all);
  }
  const deferred = (id: string) => Boolean(options.startWithinBudget) && !started.has(id);
  return {
    ready: ids.filter(id => ready.has(id)),
    pending: ids.filter(id => !ready.has(id) && !failed.has(id) && !deferred(id)),
    failed: ids.filter(id => failed.has(id)),
    deferred: ids.filter(deferred),
  };
}

// ── Choosing companies near the top ──────────────────────────────────────────

export type SummaryState = "current" | "missing" | "stale";
/** The overview is missing or past its cache window, or the hiring signals are due a check. */
export function needsInformation(summary: SummaryState | undefined, signals: Pick<CompanySignals, "checkedAt"> | undefined, now = Date.now()) {
  return summary !== "current" || signalsDue(signals, now);
}

/** 1-based rank of each option by weighted score, highest first; unscored options have none. */
export function scoreRanks(options: { key: string; score: number | null | undefined }[]) {
  const ranked = options.filter(option => typeof option.score === "number" && Number.isFinite(option.score))
    .sort((a, b) => b.score! - a.score!);
  return new Map(ranked.map((option, index) => [option.key, index + 1]));
}

/** 1-based place of each company within each route that found it, in retrieval order; its best place. */
export function retrievalRanks(order: readonly string[], angles: Record<string, string[]> = {}) {
  const placed = new Map<string, number>(), ranks = new Map<string, number>();
  for (const id of order) {
    for (const angle of angles[id]?.length ? angles[id] : [""]) {
      const rank = (placed.get(angle) ?? 0) + 1;
      placed.set(angle, rank);
      ranks.set(id, Math.min(ranks.get(id) ?? rank, rank));
    }
  }
  return ranks;
}

export type FillCandidate = { companyId: string; scoreRank?: number | null; retrievalRank?: number | null; needsInformation: boolean };

/**
 * Companies whose information is missing or stale and that could reach the top:
 * by their score now, or by how close their retrieval found them, so a company
 * that scored low only for lack of information is not buried. Closest first.
 * top is where the top ends: the first page of results the agent reads.
 */
export function chooseCompaniesToFill(candidates: FillCandidate[], top: number) {
  const reach = (candidate: FillCandidate) => Math.min(candidate.scoreRank ?? Infinity, candidate.retrievalRank ?? Infinity);
  return candidates
    .filter(candidate => candidate.needsInformation && reach(candidate) <= top)
    .sort((a, b) => reach(a) - reach(b) || (a.scoreRank ?? Infinity) - (b.scoreRank ?? Infinity))
    .map(candidate => candidate.companyId);
}
