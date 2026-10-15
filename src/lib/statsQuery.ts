const BATCH_SIZE = 1_000;
const MAX_CONCURRENT_QUERIES = 6;
const RETRY_DELAYS_MS = [1_000, 3_000];
const TRANSIENT_READ_ERROR_CODES = new Set(["57014", "PGRST003", "53300"]);

type StatsPageResult<T> = {
  data: T[] | null;
  error: { code?: string; message: string } | null;
};

let activeQueries = 0;
const waitingQueries: Array<() => void> = [];

// Daily, weekly, and company reports share a bound within the same invocation.
async function withQuerySlot<T>(query: () => PromiseLike<T>): Promise<T> {
  if (activeQueries < MAX_CONCURRENT_QUERIES) {
    activeQueries += 1;
  } else {
    await new Promise<void>((resolve) => waitingQueries.push(resolve));
  }

  try {
    return await query();
  } finally {
    const nextQuery = waitingQueries.shift();
    if (nextQuery) nextQuery();
    else activeQueries -= 1;
  }
}

async function fetchPage<T>(
  loadPage: (from: number, to: number) => PromiseLike<StatsPageResult<T>>,
  from: number,
  to: number,
  label: string
) {
  for (let attempt = 0; ; attempt += 1) {
    // Rebuild the read for each attempt; retrying never appends a page twice.
    const result = await withQuerySlot(() => loadPage(from, to));
    if (!result.error) return result.data ?? [];

    const { code, message } = result.error;
    if (
      !code ||
      !TRANSIENT_READ_ERROR_CODES.has(code) ||
      attempt >= RETRY_DELAYS_MS.length
    ) {
      throw new Error(
        `Stats query failed${code ? ` (${code})` : ""}, ${label}, rows ${from}-${to}: ${message}`
      );
    }

    console.warn("[stats-query] Retrying transient read failure", {
      attempt: attempt + 1,
      code,
      from,
      label,
      to,
    });
    await new Promise((resolve) =>
      setTimeout(resolve, RETRY_DELAYS_MS[attempt])
    );
  }
}

export async function fetchAllStatsRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<StatsPageResult<T>>,
  label = "stats"
) {
  const rows: T[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const page = await fetchPage(loadPage, from, from + BATCH_SIZE - 1, label);
    rows.push(...page);
    if (page.length < BATCH_SIZE) return rows;
  }
}
