import { titleBucketIndexSql } from "../externalRecommendationsV2/indexedTitleSearch";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  comparisonIndexSql,
  comparisonIndexName,
} from "./jobSearchComparisonIndexes";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import {
  buildJobSearchComparisonSql,
  buildJobSearchComparisonPlan,
  type ComparisonFixture,
} from "./jobSearchComparisonSql";
import {
  comparisonRequestSchema,
  defaultComparisonToggles,
  type ComparisonOption,
} from "./jobSearchComparison";

// Match the existing service-role RPC's HNSW settings.
const comparisonSearchSettingsSql = `SET LOCAL enable_sort=off;
 SET LOCAL jit=off; SET LOCAL hnsw.ef_search=100;
 SET LOCAL hnsw.iterative_scan='strict_order';
 SET LOCAL hnsw.max_scan_tuples=100000; SET LOCAL hnsw.scan_mem_multiplier=4`;
const helper = readFileSync(
  new URL(
    "../../../supabase/migrations/20261022120257_job_search_country_non_intern_hnsw.sql",
    import.meta.url
  ),
  "utf8"
).split("DO $migration$")[0];
type Payload = {
  rows: { role_id: string; country_code: string }[];
  candidate_count: number;
  filtered_count: number;
};
async function query(
  db: PGlite,
  input: ComparisonFixture,
  options: typeof defaultComparisonToggles
) {
  return db.transaction(async (tx) => {
    await tx.exec(comparisonSearchSettingsSql);
    return (
      await tx.query<Payload>(buildJobSearchComparisonSql(input, options))
    ).rows[0];
  });
}

const fixture: ComparisonFixture = {
  remoteMode: "only",
  id: "synthetic",
  capturedAt: "2026-10-21",
  failure: "db_timeout",
  countries: ["KR"],
  candidateLimit: 3000,
  resultLimit: 500,
  vector: [1, ...Array(1535).fill(0)],
  originalSql: "",
  sourceSha256: "",
  filters: {
    postingRecency: ["cr.posted_at > now() - interval '30 days'"],
    excludeIntern: ["NOT ('intern' = ANY(coalesce(cr.type,ARRAY[]::text[])))"],
    excludeParttime: [
      "NOT ('part_time' = ANY(coalesce(cr.type,ARRAY[]::text[])))",
    ],
    excludeContract: [
      "NOT ('contract' = ANY(coalesce(cr.type,ARRAY[]::text[])))",
    ],
    remote: ["cr.work_mode='remote'"],
    eligibility: ["cw.external_roles_enabled=true"],
  },
  scores: {
    fts: "coalesce(ts_rank(cr.opportunity_search_tsv,to_tsquery('simple','backend')),0)",
    salary: "cr.salary_min / 100.0",
    seniority: "CASE WHEN cr.seniority_level='senior' THEN 0.4 ELSE 0 END",
    postingRecency:
      "CASE WHEN cr.posted_at > now()-interval '1 day' THEN 1 ELSE 0 END",
  },
};

test("comparison defaults execute only basic eligibility; independent filters and scores change the expected rows", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create extension vector;
      create table company_db(id int,name text);
      create table company_workspace(company_workspace_id int,company_db_id int,company_name text,external_roles_enabled boolean default true);
      create table company_roles(role_id int primary key,company_workspace_id int default 1,name text default 'Backend',title_embedding_text text default 'Backend',title_embedding vector(1536),country_code text default 'KR',
      source_type text default 'external',source_provider text,is_expired boolean default false,expires_at timestamptz,status text default 'active',information jsonb default '{}',
      type text[],work_mode text default 'remote',posted_at timestamptz default now()-interval '2 days',seniority_level text,
      salary_min numeric default 50,salary_max numeric,salary_currency text,salary_period text,opportunity_search_tsv tsvector);
      insert into company_workspace values(1,null,'Synthetic',true),(2,null,'Disabled',false);`);
    for (let n = 1; n <= 22; n++)
      await db.query(
        "insert into company_roles(role_id,title_embedding) values($1,$2)",
        [n, JSON.stringify([1, n / 100, ...Array(1534).fill(0)])]
      );
    await db.exec(`update company_roles set source_type='internal' where role_id=10;
      update company_roles set is_expired=true where role_id=11;
      update company_roles set expires_at=now()-interval '1 day' where role_id=12;
      update company_roles set status='archived' where role_id=13;
      update company_roles set source_provider='user_submitted' where role_id=14;
      update company_roles set information='{"testOnly":true,"testFixture":"local-sql-comparison"}' where role_id=15;
      update company_roles set title_embedding=null where role_id=16;
      update company_roles set title_embedding_text='Stale' where role_id=17;
      update company_roles set type=ARRAY['intern'] where role_id=2;
      update company_roles set type=ARRAY['part_time'] where role_id=3;
      update company_roles set type=ARRAY['contract'] where role_id=4;
      update company_roles set work_mode='onsite' where role_id=5;
      update company_roles set country_code='US' where role_id=6;
      update company_roles set company_workspace_id=2 where role_id=7;
      update company_roles set posted_at=now()-interval '100 days' where role_id=8;
      update company_roles set posted_at=now() where role_id=9;
      update company_roles set seniority_level='senior' where role_id=18;
      update company_roles set opportunity_search_tsv=to_tsvector('simple','backend backend') where role_id=19;
      update company_roles set salary_min=100 where role_id=20;`);
    await db.exec(helper);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261022132418_job_search_employment_remote_hnsw.sql",
        "utf8"
      ).split("DO $migration$")[0]
    );
    for (const country of [null, "KR", "US", "JP", "DE"])
      for (const noIntern of [false, true])
        await db.exec(comparisonIndexSql(country, noIntern));
    const run = async (...keys: ComparisonOption[]) => {
      const options = { ...defaultComparisonToggles };
      for (const key of keys) options[key] = true;
      return query(db, fixture, options);
    };
    const base = await run();
    assert.deepEqual(
      base.rows.map((row) => Number(row.role_id)),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 18, 19, 20, 21, 22]
    );
    assert.equal(base.candidate_count, 15); // expires_at is time-dependent, checked after ANN.
    assert.equal(base.filtered_count, 14);
    for (const [key, removed] of [
      ["excludeIntern", 2],
      ["excludeParttime", 3],
      ["excludeContract", 4],
      ["remote", 5],
      ["countries", 6],
      ["eligibility", 7],
      ["postingRecency", 8],
    ] as const) {
      const result = await run(key);
      assert.equal(result.filtered_count, 13, key);
      assert.equal(
        result.candidate_count,
        [
          "countries",
          "excludeIntern",
          "excludeParttime",
          "excludeContract",
          "remote",
        ].includes(key)
          ? 14
          : 15,
        key
      );
      assert.ok(
        !result.rows.some((row) => Number(row.role_id) === removed),
        key
      );
    }
    for (const [key, first] of [
      ["seniority", 18],
      ["fts", 19],
      ["salary", 20],
      ["postingRecency", 9],
    ] as const)
      assert.equal((await run(key)).rows[0].role_id, String(first), key);
    assert.equal((await run("companyCap")).rows.length, 4);
    const combined = await run(
      "countries",
      "excludeIntern",
      "excludeParttime",
      "excludeContract",
      "remote",
      "eligibility",
      "postingRecency",
      "seniority",
      "fts",
      "salary",
      "companyCap"
    );
    assert.equal(combined.rows.length, 3);
    assert.ok(combined.rows.every((row) => row.country_code === "KR"));
    const bounded = await query(
      db,
      { ...fixture, candidateLimit: 6, resultLimit: 6 },
      {
        ...defaultComparisonToggles,
        excludeIntern: true,
        excludeParttime: true,
        excludeContract: true,
      }
    );
    assert.equal(bounded.candidate_count, 6);
    assert.equal(bounded.filtered_count, 6); // Employment exclusions already restrict the ANN graphs.
    assert.deepEqual(
      bounded.rows.map((row) => row.role_id),
      ["1", "5", "6", "7", "8", "9"]
    );
    assert.doesNotMatch(
      buildJobSearchComparisonSql(fixture, defaultComparisonToggles),
      /CREATE|country_quota|cr\.posted_at|cr\.opportunity_search_tsv|cr\.salary_min/
    );
  } finally {
    await db.close();
  }
});

test("permanent country/intern indexes restrict the graph and multi-country search has one global limit", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create extension vector;
      create table company_workspace(company_workspace_id int primary key,company_name text);
      insert into company_workspace values(1,'Synthetic');
      create table company_roles(role_id int primary key,company_workspace_id int default 1,
        name text default 'Backend',title_embedding_text text default 'Backend',title_embedding vector(1536),
        country_code text default 'KR',type text[],work_mode text,source_type text default 'external',source_provider text,
        is_expired boolean default false,expires_at timestamptz,status text default 'active',information jsonb default '{}');
      insert into company_roles(role_id,title_embedding)
        select n,('[1,'||(n::float/100)||','||repeat('0,',1533)||'0]')::vector from generate_series(1,200) n;
      update company_roles set type=ARRAY[' INTERN '] where role_id in (1,2);
      update company_roles set country_code='US' where role_id in (3,200);`);
    await db.exec(helper);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261022132418_job_search_employment_remote_hnsw.sql",
        "utf8"
      ).split("DO $migration$")[0]
    );
    for (const country of [null, "KR", "US"])
      for (const noIntern of [false, true])
        await db.exec(comparisonIndexSql(country, noIntern));
    for (const country of ["US", "KR"])
      for (let bucket = 0; bucket < 16; bucket++)
        await db.exec(titleBucketIndexSql(country, bucket));
    const options = {
      ...defaultComparisonToggles,
      countries: true,
      excludeIntern: true,
    };
    const input = {
      ...fixture,
      countries: ["US"],
      candidateLimit: 2,
      resultLimit: 2,
    };
    assert.deepEqual(
      (await query(db, input, options)).rows.map((r) => r.role_id),
      ["3", "200"]
    );
    const plan = buildJobSearchComparisonPlan(input, options);
    await db.exec(comparisonSearchSettingsSql);
    const explain = await db.query("EXPLAIN (FORMAT JSON) " + plan.nearestSql);
    assert.match(
      JSON.stringify(explain.rows),
      /company_roles_search_us_b0_hnsw_idx/
    );
    assert.deepEqual(
      (
        await query(db, { ...input, countries: ["US", "KR"] }, options)
      ).rows.map((r) => r.role_id),
      ["3", "4"]
    );
    // Index membership follows writes, including normalized type spellings and null arrays.
    await db.exec(
      "update company_roles set country_code='US',type=ARRAY[' Internship '] where role_id=4; update company_roles set type=null where role_id=2; update company_roles set country_code='US' where role_id=2"
    );
    assert.deepEqual(
      (await query(db, input, options)).rows.map((r) => r.role_id),
      ["2", "3"]
    );
    await db.exec(
      "update company_roles set type=ARRAY['인턴'] where role_id=2; update company_roles set status='archived' where role_id=3"
    );
    assert.deepEqual(
      (await query(db, input, options)).rows.map((r) => r.role_id),
      ["200"]
    );
    assert.equal(
      (await query(db, { ...input, countries: ["DE"] }, options)).rows.length,
      0
    );
    await db.exec(
      "update company_roles set country_code='DE' where role_id=200"
    );
    const unindexed = { ...input, countries: ["DE"] };
    assert.deepEqual(
      (await query(db, unindexed, options)).rows.map((r) => r.role_id),
      ["200"]
    );
    const fallbackPlan = await db.query(
      "EXPLAIN (FORMAT JSON) " +
        buildJobSearchComparisonPlan(unindexed, options).nearestSql
    );
    assert.doesNotMatch(
      JSON.stringify(fallbackPlan.rows),
      /title_hnsw_idx/,
      "unindexed countries must not scan a global ANN graph"
    );
    for (const country of [null, "KR", "US"])
      for (const noIntern of [false, true])
        await db.exec(`DROP INDEX ${comparisonIndexName(country, noIntern)}`);
    for (const country of ["us", "kr"])
      for (let bucket = 0; bucket < 16; bucket++)
        await db.exec(
          `DROP INDEX company_roles_search_${country}_b${bucket}_hnsw_idx`
        );
    await db.exec(`TRUNCATE company_roles;
      INSERT INTO company_roles(role_id,title_embedding)
      SELECT n, ARRAY(SELECT CASE WHEN d<=32 THEN sin(n*d*0.1234567)::real ELSE 0::real END FROM generate_series(1,1536) d)::vector
      FROM generate_series(1,3400) n`);
    await db.exec(comparisonIndexSql(null, false));
    const large = await query(db, fixture, defaultComparisonToggles);
    assert.equal(large.candidate_count, 3000);
    assert.equal(large.rows.length, 500);
  } finally {
    await db.close();
  }
});

test("client can select a fixture and toggles, never supply SQL", () => {
  assert.equal(
    comparisonRequestSchema.safeParse({ caseId: "case-01", sql: "select 1" })
      .success,
    false
  );
  assert.deepEqual(
    comparisonRequestSchema.parse({ caseId: "case-01" }).toggles,
    defaultComparisonToggles
  );
});
