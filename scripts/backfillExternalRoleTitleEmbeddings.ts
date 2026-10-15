/** Preview by default. --apply is an explicit operator data operation, not deployment. */
import { getTalentSupabaseAdmin } from "../src/lib/talentOnboarding/admin";
import { backfillRoleTitles } from "../src/lib/externalRecommendationsV2/embeddings";
async function main() {
  const admin = getTalentSupabaseAdmin();
  const apply = process.argv.includes("--apply");
  const maxRows = Number(
    process.argv.find((a) => a.startsWith("--max-rows="))?.split("=")[1] ??
      10000
  );
  if (!Number.isInteger(maxRows) || maxRows < 1)
    throw new Error("Invalid --max-rows");
  if (!apply) {
    const { count, error } = await (
      admin.from("external_role_title_embeddings") as any
    )
      .select("title_key", { count: "exact", head: true })
      .is("embedding", null);
    if (error) throw error;
    console.log({ pendingTitles: count, apply: false, maxRows });
    return;
  }
  let scanned = 0,
    updated = 0;
  let failures = 0;
  const began = Date.now();
  while (scanned < maxRows) {
    try {
      const result = await backfillRoleTitles(
        admin,
        Math.min(1000, maxRows - scanned),
        {
          concurrency: 6,
          writeBatchSize: 64,
          onBatch: process.argv.includes("--verbose") ? console.log : undefined,
        }
      );
      scanned += result.scanned;
      updated += result.updated;
      failures = 0;
      console.log({ scanned, updated, elapsedMs: Date.now() - began });
      if (!result.scanned) break;
    } catch (error) {
      console.error(
        error instanceof AggregateError
          ? error.errors.map((e) =>
              e instanceof Error ? e.message : String(e)
            )
          : String(error)
      );
      if (++failures >= 5) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(30000, 1000 * 2 ** failures))
      );
    }
  }
}
void main().catch((error) => {
  console.error(
    error instanceof AggregateError
      ? error.errors.map((e) => (e instanceof Error ? e.message : String(e)))
      : error instanceof Error
        ? error.message
        : "Embedding backfill failed"
  );
  process.exitCode = 1;
});
