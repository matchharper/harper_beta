import { setTimeout as delay } from "node:timers/promises";
import type { TalentAdminClient } from "../talentOnboarding/admin";
import { embedTitles, TitleEmbeddingHttpError } from "./retrieval";
import { chunks, mapConcurrent } from "./contract";

type Options = {
  concurrency?: number;
  writeBatchSize?: number;
  afterTitleKey?: string;
  signal?: AbortSignal;
  onBatch?: (value: Record<string, number>) => void;
};

async function retry<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await fn();
    } catch (error) {
      // Invalid input/authentication needs correction, not repeated API spend.
      if (
        attempt >= 2 ||
        signal?.aborted ||
        (error instanceof TitleEmbeddingHttpError &&
          error.status < 500 &&
          error.status !== 429 &&
          error.status !== 408)
      )
        throw error;
      await delay(500 * 2 ** attempt, undefined, { signal });
    }
  }
}

// The insert/rename trigger is the durable queue. A failed title stays NULL;
// keyset pagination lets later titles progress even when one input is invalid.
export async function backfillRoleTitles(
  admin: TalentAdminClient,
  limit = 512,
  options: Options = {}
) {
  const signal = options.signal ?? AbortSignal.timeout(240_000);
  let query = admin
    .from("external_role_title_embeddings" as never)
    .select("title_key,title")
    .is("embedding", null)
    .order("title_key")
    .limit(Math.min(1000, Math.max(1, limit)));
  if (options.afterTitleKey)
    query = query.gt("title_key", options.afterTitleKey);
  const { data, error } = await query.abortSignal(signal);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ title_key: string; title: string }>;
  let updated = 0,
    failed = 0;
  const errors = new Set<string>();
  async function processBatch(batch: typeof rows): Promise<void> {
    try {
      const began = Date.now();
      const vectors = await retry(
        () =>
          embedTitles(
            batch.map((r) => r.title),
            signal
          ),
        signal
      );
      const embeddedAt = Date.now();
      const entries = batch.map((r, i) => ({
        titleKey: r.title_key,
        title: r.title,
        embedding: vectors[i],
      }));
      // Retry the same vectors on a write failure; do not pay to embed them again.
      for (const part of chunks(
        entries,
        Math.min(64, Math.max(1, options.writeBatchSize ?? 64))
      )) {
        const written = await retry(async () => {
          const { data, error } = await admin
            .rpc(
              "save_external_title_embeddings" as never,
              { p_rows: part } as never
            )
            .abortSignal(signal);
          if (error) throw new Error(error.message);
          return Number(data ?? 0);
        }, signal);
        updated += written;
      }
      options.onBatch?.({
        titles: batch.length,
        embeddingMs: embeddedAt - began,
        writingMs: Date.now() - embeddedAt,
      });
    } catch (error) {
      // Isolate a rejected input so the rest of its batch can still be saved.
      if (
        !signal.aborted &&
        batch.length > 1 &&
        error instanceof TitleEmbeddingHttpError &&
        (error.status === 400 || error.status === 413)
      ) {
        const middle = Math.ceil(batch.length / 2);
        await processBatch(batch.slice(0, middle));
        await processBatch(batch.slice(middle));
        return;
      }
      failed += batch.length;
      errors.add(
        error instanceof Error ? error.message : "Embedding batch failed"
      );
    }
  }
  await mapConcurrent(
    chunks(rows, 64),
    Math.max(1, options.concurrency ?? 3),
    processBatch
  );
  return {
    scanned: rows.length,
    uniqueTitles: rows.length,
    updated,
    failed,
    errors: [...errors],
    lastTitleKey: rows.at(-1)?.title_key,
  };
}

export async function drainRoleTitleEmbeddings(
  admin: TalentAdminClient,
  options: Options & { maxRows?: number; maxDurationMs?: number } = {}
) {
  const began = Date.now();
  const deadline = AbortSignal.timeout(options.maxDurationMs ?? 240_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline])
    : deadline;
  const maxRows = options.maxRows ?? 10_000;
  let scanned = 0,
    updated = 0,
    failed = 0,
    afterTitleKey: string | undefined;
  const errors = new Set<string>();
  while (scanned < maxRows && !signal.aborted) {
    try {
      const page = await backfillRoleTitles(
        admin,
        Math.min(1000, maxRows - scanned),
        { ...options, signal, afterTitleKey }
      );
      scanned += page.scanned;
      updated += page.updated;
      failed += page.failed;
      for (const error of page.errors) errors.add(error);
      afterTitleKey = page.lastTitleKey;
      if (!page.scanned || page.failed === page.scanned) break;
    } catch (error) {
      errors.add(
        error instanceof Error ? error.message : "Embedding scan failed"
      );
      break;
    }
  }
  // Independent short deadline leaves time for a health response before the
  // function's 300s limit, even when the processing budget has expired.
  const { count, error } = await admin
    .from("external_role_title_embeddings" as never)
    .select("title_key", { count: "exact", head: true })
    .is("embedding", null)
    .abortSignal(AbortSignal.timeout(5000));
  if (error) errors.add(error.message);
  return {
    scanned,
    updated,
    failed,
    remaining: error ? null : count,
    errors: [...errors],
    budgetExhausted: signal.aborted,
    elapsedMs: Date.now() - began,
  };
}
