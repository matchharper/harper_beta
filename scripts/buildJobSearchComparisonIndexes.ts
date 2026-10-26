// Usage: node --env-file=.env.local --import tsx scripts/buildJobSearchComparisonIndexes.ts [--apply]
// Uses JOB_SEARCH_COMPARISON_DATABASE_URL (server-only). Default is a dry run.
import { readFileSync } from "node:fs";
import postgres from "postgres";
import {
  comparisonIndexedCountries,
  comparisonIndexName,
  comparisonIndexSql,
} from "../src/lib/ops/jobSearchComparisonIndexes";

async function main() {
  const databaseUrl = process.env.JOB_SEARCH_COMPARISON_DATABASE_URL;
  if (!databaseUrl)
    throw new Error("Missing JOB_SEARCH_COMPARISON_DATABASE_URL");
  const apply = process.argv.includes("--apply");
  const db = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: "require",
    onnotice: () => {},
  });
  try {
    const migration = readFileSync(
      new URL(
        "../supabase/migrations/20261022120257_job_search_country_non_intern_hnsw.sql",
        import.meta.url
      ),
      "utf8"
    );
    const helper = migration.split("DO $migration$")[0];
    if (apply) {
      const existing =
        await db`SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.external_role_has_type(text[],text[])')`;
      if (
        existing.length &&
        !existing[0].prosrc.includes("lower(btrim(t.value)) = ANY(p_matches)")
      )
        throw new Error(
          "Existing type helper differs; inspect it before replacing indexed semantics"
        );
      await db.unsafe(helper).simple();
      await db`SET lock_timeout='5min'`;
      await db`SET statement_timeout='15min'`;
      await db`SET maintenance_work_mem='128MB'`;
      await db`SET max_parallel_maintenance_workers=0`;
    }
    // Small country graphs first; only one concurrent build runs at a time.
    const countries = [
      ...comparisonIndexedCountries.filter((c) => c !== "KR" && c !== "US"),
      "KR",
      "US",
      null,
    ];
    for (const country of countries)
      for (const excludeIntern of [false, true]) {
        const name = comparisonIndexName(country, excludeIntern);
        const inspect =
          () => db`SELECT i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) AS definition,pg_size_pretty(pg_relation_size(i.indexrelid)) AS size
        FROM pg_index i WHERE i.indexrelid=to_regclass(${"public." + name})`;
        const existing = await inspect();
        if (existing.length) {
          if (!existing[0].indisvalid || !existing[0].indisready)
            throw new Error(
              `Incomplete index ${name}; inspect and repair before retrying`
            );
          console.log(
            JSON.stringify({
              index: name,
              status: "existing",
              size: existing[0].size,
            })
          );
          continue;
        }
        const sql = comparisonIndexSql(country, excludeIntern, true);
        if (!apply) {
          console.log(sql + ";");
          continue;
        }
        console.log(JSON.stringify({ index: name, status: "building" }));
        const started = performance.now();
        await db.unsafe(sql);
        const [index] = await inspect();
        if (!index?.indisvalid || !index?.indisready)
          throw new Error(`Index ${name} is not ready`);
        console.log(
          JSON.stringify({
            index: name,
            status: "ready",
            size: index.size,
            ms: performance.now() - started,
          })
        );
      }
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
