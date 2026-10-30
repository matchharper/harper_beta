// How a batch of candidate decisions ran, for one summary toast.

export type OrgDecisionOutcome<T> = {
  failures: Array<{ error: unknown; item: T }>;
  /** Came back without a change: already moving, needs a check, no access. */
  unchanged: T[];
};

/** Runs each decision, three at a time, keeping which ones did not land. */
export async function runEach<T>(
  items: T[],
  run: (item: T) => Promise<unknown>,
  concurrency = 3
): Promise<OrgDecisionOutcome<T>> {
  const outcome: OrgDecisionOutcome<T> = { failures: [], unchanged: [] };
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        const result = await run(item);
        if (result === null || result === undefined) {
          outcome.unchanged.push(item);
        }
      } catch (error) {
        outcome.failures.push({ error, item });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return outcome;
}

/** "김민준, 이서연 외 2명" for a toast. */
export function namesForToast(names: string[], more: (n: number) => string) {
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} ${more(names.length - 3)}` : shown;
}
