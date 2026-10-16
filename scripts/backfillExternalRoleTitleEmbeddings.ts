/** Preview by default. --apply is an explicit operator data operation, not deployment. */
import { getTalentSupabaseAdmin } from "../src/lib/talentOnboarding/admin";
import { drainRoleTitleEmbeddings } from "../src/lib/externalRecommendationsV2/embeddings";
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
  const result = await drainRoleTitleEmbeddings(admin, {
    maxRows,
    concurrency: 6,
    onBatch: process.argv.includes("--verbose") ? console.log : undefined,
  });
  console.log(result);
  if (result.errors.length) process.exitCode = 1;
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
