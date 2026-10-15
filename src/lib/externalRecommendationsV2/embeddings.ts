import type { TalentAdminClient } from "../talentOnboarding/admin";
import { embedTitles } from "./retrieval";
import { chunks, mapConcurrent } from "./contract";

// Initial backfill and scheduled maintenance share the title dictionary.
// New/renamed roles enqueue a title; exact title CAS prevents stale vector reuse.
export async function backfillRoleTitles(
  admin: TalentAdminClient,
  limit = 512,
  options: {
    concurrency?: number;
    writeBatchSize?: number;
    onBatch?: (value: Record<string, number>) => void;
  } = {}
) {
  const { data, error } = await admin.rpc(
    "pending_external_title_embeddings" as never,
    { p_limit: Math.min(1000, Math.max(1, limit)) } as never
  );
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ title_key: string; title: string }>;
  const byTitle = new Map<string, string[]>();
  for (const row of rows)
    byTitle.set(row.title, [...(byTitle.get(row.title) ?? []), row.title_key]);
  let updated = 0;
  await mapConcurrent(
    chunks([...byTitle.keys()], 64),
    options.concurrency ?? 3,
    async (titles) => {
      const began = Date.now();
      const vectors = await embedTitles(titles);
      const embeddedAt = Date.now();
      // Bound the write payload even when many postings share a title.
      const entries = titles.flatMap((title, i) =>
        byTitle
          .get(title)!
          .map((roleId) => ({ titleKey: roleId, title, embedding: vectors[i] }))
      );
      for (const batch of chunks(entries, options.writeBatchSize ?? 64)) {
        const { data, error } = await admin.rpc(
          "save_external_title_embeddings" as never,
          { p_rows: batch } as never
        );
        if (error) throw new Error(error.message);
        updated += Number(data ?? 0);
      }
      options.onBatch?.({
        titles: titles.length,
        embeddingMs: embeddedAt - began,
        writingMs: Date.now() - embeddedAt,
      });
    }
  );
  return { scanned: rows.length, uniqueTitles: byTitle.size, updated };
}
