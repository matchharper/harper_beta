import type {
  AnswerExampleLookupResult,
  ServiceAnswerExampleAudience,
} from "./serviceAnswerExamples";

export const ANSWER_EXAMPLE_CACHE_TTL_MS = 30_000;

export type AnswerExampleRow = {
  id: string;
  user_example_text: string;
  answer_example_text: string;
  tags: string[] | null;
  embedding: string | number[];
  updated_at: string;
};

type CachedAnswerExample = {
  example: Omit<AnswerExampleLookupResult, "score">;
  vector: Float64Array;
  magnitude: number;
  updatedAt: string;
  updatedAtMs: number;
};

type Snapshot = {
  examples: CachedAnswerExample[];
  expiresAt: number;
};

export type AnswerExampleCacheStatus = "hit" | "miss" | "refresh" | "shared";

function prepareExample(row: AnswerExampleRow): CachedAnswerExample {
  const values: unknown =
    typeof row.embedding === "string"
      ? JSON.parse(row.embedding)
      : row.embedding;
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    !values.every(
      (value) => typeof value === "number" && Number.isFinite(value)
    )
  ) {
    throw new Error("Invalid service answer example vector");
  }
  const vector = Float64Array.from(values, Math.fround);
  if (!vector.every(Number.isFinite)) {
    throw new Error("Service answer example vector exceeds float32 range");
  }
  const updatedAtMs = Date.parse(row.updated_at);
  if (!Number.isFinite(updatedAtMs)) {
    throw new Error("Invalid service answer example timestamp");
  }
  return {
    example: {
      id: row.id,
      user_example_text: row.user_example_text,
      answer_example_text: row.answer_example_text,
      tags: [...(row.tags ?? [])],
    },
    vector,
    magnitude: Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)),
    updatedAt: row.updated_at,
    updatedAtMs,
  };
}

/** Instance-local, request-driven snapshots. Hits never extend freshness. */
export function createAnswerExampleCache(
  load: (audience: ServiceAnswerExampleAudience) => Promise<AnswerExampleRow[]>,
  now: () => number = Date.now
) {
  const entries = new Map<
    ServiceAnswerExampleAudience,
    { snapshot?: Snapshot; pending?: Promise<Snapshot> }
  >();

  return {
    async get(audience: ServiceAnswerExampleAudience) {
      let entry = entries.get(audience);
      if (!entry) {
        entry = {};
        entries.set(audience, entry);
      }
      if (entry.snapshot && now() < entry.snapshot.expiresAt) {
        return { ...entry.snapshot, cacheStatus: "hit" as const };
      }
      if (entry.pending) {
        return { ...(await entry.pending), cacheStatus: "shared" as const };
      }

      const cacheStatus: AnswerExampleCacheStatus = entry.snapshot
        ? "refresh"
        : "miss";
      // Remove stale data before loading: failures must never revive it.
      entry.snapshot = undefined;
      const expiresAt = now() + ANSWER_EXAMPLE_CACHE_TTL_MS;
      const currentEntry = entry;
      const pending = (async (): Promise<Snapshot> => {
        const rows = await load(audience);
        const snapshot = { examples: rows.map(prepareExample), expiresAt };
        if (now() >= expiresAt) {
          throw new Error(
            "Service answer example snapshot expired while loading"
          );
        }
        currentEntry.snapshot = snapshot;
        return snapshot;
      })();
      entry.pending = pending;
      try {
        return { ...(await pending), cacheStatus };
      } finally {
        currentEntry.pending = undefined;
      }
    },
  };
}

/** Same cosine score, threshold and updated_at tie-break as the matching RPC. */
export function matchCachedAnswerExamples(
  examples: readonly CachedAnswerExample[],
  query: readonly number[],
  options: { minScore: number; topK: number }
): AnswerExampleLookupResult[] {
  if (!query.length || !query.every(Number.isFinite)) {
    throw new Error("Invalid answer example query vector");
  }
  // PostgreSQL vector stores float32 components, including the query argument.
  const vector = Float32Array.from(query);
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0)
  );
  if (!Number.isFinite(magnitude))
    throw new Error("Invalid query vector magnitude");
  if (magnitude === 0) return [];

  return examples
    .map((cached) => {
      if (cached.vector.length !== vector.length) {
        throw new Error("Answer example vector dimensions do not match");
      }
      let dot = 0;
      for (let i = 0; i < vector.length; i++)
        dot += vector[i] * cached.vector[i];
      const score = Math.max(
        -1,
        Math.min(1, dot / (magnitude * cached.magnitude))
      );
      return { cached, score };
    })
    .filter(({ score }) => Number.isFinite(score) && score >= options.minScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.cached.updatedAtMs - a.cached.updatedAtMs ||
        // PostgREST returns UTC timestamps; retain sub-millisecond ordering.
        b.cached.updatedAt.localeCompare(a.cached.updatedAt)
    )
    .slice(0, options.topK)
    .map(({ cached, score }) => ({
      ...cached.example,
      tags: [...cached.example.tags],
      score,
    }));
}
