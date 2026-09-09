import {
  getTalentSupabaseAdmin,
  refreshTalentContextEmbeddings,
  TALENT_CONTEXT_EMBEDDING_MODEL,
} from "../src/lib/talentOnboarding/server";

const BATCH_SIZE = 20;

async function main() {
  const admin = getTalentSupabaseAdmin();
  let lastBatchSignature = "";
  let processed = 0;

  while (true) {
    const { data, error } = await (
      admin.from("talent_contexts" as never) as any
    )
      .select("id, talent_id")
      .eq("collection", "memory")
      .is("deleted_at", null)
      .or(
        `embedding.is.null,embedding_model.is.null,embedding_model.neq.${TALENT_CONTEXT_EMBEDDING_MODEL}`
      )
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);
    if (error) {
      throw new Error(error.message ?? "Failed to load pending memories");
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) break;
    const batchSignature = rows
      .map((row) => `${String(row?.talent_id ?? "")}:${String(row?.id ?? "")}`)
      .join("|");
    if (batchSignature === lastBatchSignature) {
      throw new Error("Embedding backfill made no progress");
    }
    lastBatchSignature = batchSignature;

    const idsByTalent = new Map<string, number[]>();
    for (const row of rows) {
      const talentId = String(row?.talent_id ?? "").trim();
      const id = Number(row?.id);
      if (!talentId || !Number.isSafeInteger(id) || id <= 0) continue;
      idsByTalent.set(talentId, [...(idsByTalent.get(talentId) ?? []), id]);
    }
    if (idsByTalent.size === 0) {
      throw new Error("Pending memory rows contained no valid identifiers");
    }

    for (const [userId, ids] of idsByTalent) {
      await refreshTalentContextEmbeddings({ admin, ids, userId });
      processed += ids.length;
    }
    console.info(`[talent-contexts] embedded ${processed} memories`);
  }

  console.info(`[talent-contexts] backfill complete (${processed} memories)`);
}

void main().catch((error) => {
  console.error(
    "[talent-contexts] embedding backfill failed",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
