// Default: inspect/dry run. --apply builds disjoint country/employment/remote graphs.
// Existing role rows are unchanged; production builds are serial and concurrent.
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  indexedTitleCountries,
  titleBucketIndexName,
  titleBucketIndexSql,
} from "../src/lib/externalRecommendationsV2/indexedTitleSearch";
async function main() {
  const url = process.env.JOB_SEARCH_COMPARISON_DATABASE_URL;
  if (!url) throw new Error("Missing JOB_SEARCH_COMPARISON_DATABASE_URL");
  const db = postgres(url, {
    max: 1,
    connect_timeout: 30,
    idle_timeout: 20,
    max_lifetime: 300,
    prepare: false,
    ssl: "require",
    onnotice: () => {},
  });
  const apply = process.argv.includes("--apply");
  try {
    const [helper] =
      await db`SELECT to_regprocedure('public.external_role_has_type(text[],text[])') IS NOT NULL AS present`;
    if (!helper.present)
      throw new Error("Required existing type helper is absent");
    if (apply) {
      const [scopeHelper] =
        await db`SELECT prosrc,provolatile,prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.external_role_index_vector(public.vector,text)')`;
      if (
        scopeHelper &&
        (scopeHelper.prosrc.trim() !==
          "SELECT p_embedding::public.halfvec(1536)" ||
          scopeHelper.provolatile !== "i" ||
          scopeHelper.prosecdef)
      )
        throw new Error(
          "Inspect existing vector helper before changing indexed semantics"
        );
      const migration = readFileSync(
        new URL(
          "../supabase/migrations/20261022132418_job_search_employment_remote_hnsw.sql",
          import.meta.url
        ),
        "utf8"
      );
      await db.unsafe(migration.split("DO $migration$")[0]).simple();
      await db`SET lock_timeout='5min'`;
      await db`SET statement_timeout='15min'`;
      await db`SET maintenance_work_mem='128MB'`;
      await db`SET max_parallel_maintenance_workers=0`;
    }
    const countries = [
      ...indexedTitleCountries.filter((c) => c !== "US" && c !== "KR"),
      "KR",
      "US",
      null,
    ];
    const catalog = new Map(
      (
        await db`SELECT c.relname, i.indisvalid, i.indisready, obj_description(i.indexrelid,'pg_class') AS comment, pg_relation_size(i.indexrelid) AS bytes FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'company_roles_search_%_b%_hnsw_idx'`
      ).map((row) => [row.relname, row])
    );
    let built = 0,
      existing = 0;
    for (const country of countries)
      for (let bucket = 0; bucket < 16; bucket++) {
        const name = titleBucketIndexName(country, bucket);
        const fingerprint =
          "harper:title-bucket:v2:" +
          createHash("sha256")
            .update(titleBucketIndexSql(country, bucket))
            .digest("hex");
        const inspect = () =>
          db`SELECT indisvalid,indisready,obj_description(indexrelid,'pg_class') AS comment,pg_relation_size(indexrelid) AS bytes FROM pg_index WHERE indexrelid=to_regclass(${"public." + name})`;
        const found = catalog.get(name);
        if (found) {
          const legacyFingerprint =
            "harper:title-bucket:v1:" +
            createHash("sha256")
              .update(titleBucketIndexSql(country, bucket, false, true))
              .digest("hex");
          if (!found.indisvalid || !found.indisready)
            throw new Error(`Inspect incomplete index: ${name}`);
          if (found.comment === fingerprint) {
            existing++;
            continue;
          }
          if (found.comment !== legacyFingerprint)
            throw new Error(`Inspect mismatched index: ${name}`);
          if (apply) {
            console.log(
              JSON.stringify({
                index: name,
                status: "replacing-unscoped-expression",
              })
            );
            await db.unsafe(`DROP INDEX CONCURRENTLY public.${name}`).simple();
          }
        }
        if (!apply) {
          console.log(JSON.stringify({ index: name, action: "create" }));
          continue;
        }
        console.log(JSON.stringify({ index: name, status: "building" }));
        const began = performance.now();
        await db.unsafe(titleBucketIndexSql(country, bucket, true)).simple();
        await db.unsafe(`COMMENT ON INDEX public.${name} IS '${fingerprint}'`);
        const [ready] = await inspect();
        if (!ready?.indisvalid || !ready.indisready)
          throw new Error(`Index not ready: ${name}`);
        built++;
        console.log(
          JSON.stringify({
            index: name,
            status: "ready",
            ms: Math.round(performance.now() - began),
            bytes: ready.bytes,
          })
        );
      }
    console.log(
      JSON.stringify({ complete: true, applied: apply, built, existing })
    );
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
