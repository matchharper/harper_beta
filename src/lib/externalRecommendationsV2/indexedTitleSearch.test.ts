import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import {
  indexedTitleCandidatesSql,
  titleBucketIndexSql,
  titleBucketPredicate,
} from "./indexedTitleSearch";

test("country budgets are applied before merging and employment/remote conditions restrict HNSW graphs", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(
      `CREATE EXTENSION vector; CREATE TABLE company_roles(role_id int primary key,name text default 'Role',title_embedding_text text default 'Role',title_embedding vector(1536),country_code text,source_type text default 'external',source_provider text,is_expired boolean default false,status text default 'active',information jsonb default '{}',type text[],work_mode text);`
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261022120257_job_search_country_non_intern_hnsw.sql",
        "utf8"
      ).split("DO $migration$")[0]
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261022132418_job_search_employment_remote_hnsw.sql",
        "utf8"
      ).split("DO $migration$")[0]
    );
    const q = [1, ...Array(1535).fill(0)];
    await db.query(`INSERT INTO company_roles(role_id,country_code,type,work_mode,title_embedding)
   SELECT n,CASE WHEN n<=700 THEN 'KR' ELSE 'US' END,
   CASE n%7 WHEN 0 THEN ARRAY['intern'] WHEN 1 THEN ARRAY['PART-TIME'] WHEN 2 THEN ARRAY['contractor'] ELSE ARRAY['full_time'] END,
   CASE WHEN n%2=0 THEN 'remote' ELSE 'onsite' END,
   ('[1,'||((n%700)::float/1000)::text||','||repeat('0,',1533)||'0]')::vector
   FROM generate_series(1,1400)n`);
    // Enough eligible rows in each country, but very different distances.
    await db.exec(`UPDATE company_roles SET type=ARRAY['full_time'],work_mode='remote' WHERE role_id%700>=100;
   UPDATE company_roles SET title_embedding=('[1,2,'||repeat('0,',1533)||'0]')::vector WHERE country_code='US';`);
    for (const country of ["KR", "US"])
      for (const bucket of [0, 8])
        await db.exec(titleBucketIndexSql(country, bucket));
    await db.exec(
      `SET enable_sort=off;SET jit=off;SET hnsw.ef_search=100;SET hnsw.iterative_scan='strict_order';SET hnsw.max_scan_tuples=100000;SET hnsw.scan_mem_multiplier=4`
    );
    const args = {
      countries: ["KR", "US"],
      countryWeights: [
        { countryCode: "KR", weight: 0.8, remoteOnly: false },
        { countryCode: "US", weight: 0.2, remoteOnly: true },
      ],
      excludeIntern: true,
      excludeParttime: true,
      excludeContract: true,
      remoteMode: "any" as const,
      remoteOnlyCountries: ["US"],
      vector: q,
      candidateLimit: 500,
    };
    const sql = indexedTitleCandidatesSql(args);
    const result = await db.query<{ country_code: string; count: number }>(
      `WITH nearest AS MATERIALIZED (${sql}) SELECT country_code,count(*)::int FROM nearest JOIN company_roles USING(role_id) GROUP BY country_code ORDER BY country_code`
    );
    assert.deepEqual(result.rows, [
      { country_code: "KR", count: 400 },
      { country_code: "US", count: 100 },
    ]);
    const explain = JSON.stringify(
      (await db.query("EXPLAIN (FORMAT JSON) " + sql)).rows
    );
    for (const name of ["kr_b0", "kr_b8", "us_b8"])
      assert.ok(
        explain.includes("company_roles_search_" + name + "_hnsw_idx"),
        name
      );
    assert.ok(!explain.includes("us_b0_hnsw_idx"));
    // Empty country/remote graphs must not fall back to a broader global graph.
    await db.exec(titleBucketIndexSql(null, 8));
    await db.exec(titleBucketIndexSql("HK", 8));
    const emptySql = indexedTitleCandidatesSql({
      ...args,
      countries: ["HK"],
      countryWeights: [{ countryCode: "HK", weight: 1, remoteOnly: true }],
      remoteOnlyCountries: ["HK"],
    });
    const emptyPlan = JSON.stringify(
      (await db.query("EXPLAIN (FORMAT JSON) " + emptySql)).rows
    );
    assert.ok(emptyPlan.includes("company_roles_search_hk_b8_hnsw_idx"));
    assert.ok(!emptyPlan.includes("company_roles_search_all_b8_hnsw_idx"));
    assert.equal((await db.query(emptySql)).rows.length, 0);
    const invalid = await db.query(
      `WITH nearest AS MATERIALIZED (${sql}) SELECT role_id FROM nearest JOIN company_roles USING(role_id) WHERE NOT (${titleBucketPredicate(0)} OR ${titleBucketPredicate(8)}) OR (country_code='US' AND work_mode<>'remote')`
    );
    assert.equal(invalid.rows.length, 0);
    // Exhaustion does not refill from the other country's index.
    await db.exec(
      `UPDATE company_roles SET is_expired=true WHERE country_code='US' AND role_id>710`
    );
    const short = await db.query<{ country_code: string; count: number }>(
      `WITH nearest AS MATERIALIZED (${sql}) SELECT country_code,count(*)::int FROM nearest JOIN company_roles USING(role_id) GROUP BY country_code ORDER BY country_code`
    );
    assert.equal(short.rows.find((r) => r.country_code === "KR")?.count, 400);
    assert.ok(
      (short.rows.find((r) => r.country_code === "US")?.count ?? 0) < 100
    );
    // Unknown product country still filters all static conditions before exact ranking.
    await db.exec(
      `UPDATE company_roles SET country_code='DE' WHERE role_id=105`
    );
    const exact = indexedTitleCandidatesSql({
      ...args,
      countries: ["DE"],
      countryWeights: [{ countryCode: "DE", weight: 1, remoteOnly: false }],
    });
    assert.deepEqual(
      (await db.query<{ role_id: number }>(exact)).rows.map((r) => r.role_id),
      [105]
    );
    assert.ok(
      !JSON.stringify(
        (await db.query("EXPLAIN (FORMAT JSON) " + exact)).rows
      ).includes("hnsw_idx")
    );
  } finally {
    await db.close();
  }
});

test("fresh migration installs the same scoped graphs and can be replayed without replacing them", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(
      `CREATE EXTENSION vector;CREATE TABLE company_roles(role_id int,name text,title_embedding_text text,title_embedding vector(1536),country_code text,source_type text,source_provider text,is_expired boolean,status text,information jsonb,type text[],work_mode text)`
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261022120257_job_search_country_non_intern_hnsw.sql",
        "utf8"
      ).split("DO $migration$")[0]
    );
    const migration = readFileSync(
      "supabase/migrations/20261022132418_job_search_employment_remote_hnsw.sql",
      "utf8"
    );
    await db.exec(migration);
    const before = (
      await db.query<{ oid: number }>(
        "SELECT indexrelid::int AS oid FROM pg_index WHERE indexrelid::regclass::text LIKE 'company_roles_search_%_b%_hnsw_idx' ORDER BY indexrelid"
      )
    ).rows;
    assert.equal(before.length, 160);
    await db.exec(migration);
    const after = (
      await db.query<{ oid: number }>(
        "SELECT indexrelid::int AS oid FROM pg_index WHERE indexrelid::regclass::text LIKE 'company_roles_search_%_b%_hnsw_idx' ORDER BY indexrelid"
      )
    ).rows;
    assert.deepEqual(after, before);
  } finally {
    await db.close();
  }
});
