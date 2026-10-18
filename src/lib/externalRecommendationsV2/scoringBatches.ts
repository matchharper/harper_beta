import { chunks, mapConcurrent, type Fit } from "./contract";

export function scoringStopCounts(fits: Iterable<Fit>) {
  let atLeast60 = 0;
  let atLeast50 = 0;
  for (const fit of fits) {
    if (fit.constraintPass <= 50) continue;
    if (fit.mutualFit >= 60) atLeast60++;
    if (fit.mutualFit >= 50) atLeast50++;
  }
  return { atLeast60, atLeast50 };
}

// The map contains this run's candidates, including reused evaluations. The
// caller adds new valid fits only after saving them (or in an explicit dry run).
export async function runScoringBatches<T>(
  fresh: T[],
  fits: ReadonlyMap<string, Fit>,
  scoreBatch: (batch: T[]) => Promise<void>
) {
  let skippedRoles = 0;
  await mapConcurrent(chunks(fresh), 6, async (batch) => {
    const counts = scoringStopCounts(fits.values());
    if (counts.atLeast60 >= 20 && counts.atLeast50 >= 50) {
      skippedRoles += batch.length;
      return;
    }
    // Already-started calls finish and persist; do not cancel them on threshold.
    await scoreBatch(batch);
  });
  return {
    earlyStopped: skippedRoles > 0,
    scoringSkippedRoleCount: skippedRoles,
    scoringStopCounts: scoringStopCounts(fits.values()),
  };
}
