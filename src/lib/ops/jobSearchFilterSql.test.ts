import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { buildJobSearchFilterSql } from "./jobSearchFilterSql";
import { buildFilterFirstRoleSql } from "../externalRecommendationsV2/filterFirstSql";
import type { PreviewQuery } from "./externalSearchPreview";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const v = (x: number) => JSON.stringify([1, x, ...Array(1534).fill(0)]);
const query: PreviewQuery = {
  plan: {
    searchIntentSummary: "Synthetic",
    roleTitles: ["Backend"],
    ftsKeywords: [{ terms: ["backend"], weight: 1 }],
    countries: [
      { countryCode: "KR", weight: 100, remoteOnly: false },
      { countryCode: "US", weight: 1, remoteOnly: true },
    ],
    includeContract: false,
    includeIntern: false,
    includeParttime: false,
    includeRemote: true,
    remoteOnly: false,
    isPreferEntry: 0,
    postingRecency: null,
  },
  targetSalaryKrw: 100,
};
test("filter-first SQL executes hard filters inside the ANN-compatible top N, allocates country weights after the company cap, ranks only that N and reports stages", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create extension vector;
      create table company_db(id bigint primary key,name text);
      create table company_workspace(company_workspace_id uuid primary key,company_db_id bigint,company_name text,external_roles_enabled boolean default true);
      create table company_roles(role_id uuid primary key,company_workspace_id uuid,name text,source_type text default 'external',source_provider text,is_expired boolean default false,expires_at timestamptz,status text default 'active',information jsonb default '{}',
        external_jd_url text,country_code text default 'KR',location_text text,seniority_level text,work_mode text,type text[],posted_at timestamptz default now(),salary_min numeric default 50,salary_max numeric,salary_currency text,salary_period text,salary_range text,salary_is_predicted boolean default false,opportunity_search_tsv tsvector,title_embedding vector(1536),title_embedding_text text);
      create table talent_opportunity_recommendation(talent_id uuid,role_id uuid,opportunity_type text);
      -- Controlled salary utility isolates the final ranking contract in this test.
      create function external_role_salary_satisfaction(numeric,numeric,text,text,numeric) returns double precision language sql immutable as 'select $1/$5';
      insert into company_workspace values ('${uuid(9000)}',null,'Synthetic',true),('${uuid(9001)}',null,'Blocked',true),('${uuid(9002)}',null,'Disabled',false);`);
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;"
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261016090334_job_search_filter_hnsw_rpc.sql",
        "utf8"
      )
    );
    const settingsBefore = await db.query(
      "SELECT current_setting('enable_sort') AS sort, current_setting('hnsw.ef_search') AS ef"
    );
    const privileges = await db.query<{
      anon: boolean;
      authenticated: boolean;
      service: boolean;
    }>(
      "SELECT has_function_privilege('anon','search_external_roles_filter_first(text)','EXECUTE') AS anon, has_function_privilege('authenticated','search_external_roles_filter_first(text)','EXECUTE') AS authenticated, has_function_privilege('service_role','search_external_roles_filter_first(text)','EXECUTE') AS service"
    );
    assert.deepEqual(privileges.rows[0], {
      anon: false,
      authenticated: false,
      service: true,
    });
    for (let i = 1; i <= 516; i++) {
      await db.query(
        "insert into company_workspace(company_workspace_id,company_name) values($1,'Synthetic')",
        [uuid(10000 + i)]
      );
      await db.query(
        `insert into company_roles(role_id,company_workspace_id,name,title_embedding_text,title_embedding,opportunity_search_tsv,country_code,work_mode)
        values ($1,$2,'Backend','Backend',$3,to_tsvector('simple',$4),$5,'remote')`,
        [
          uuid(i),
          uuid(10000 + i),
          v(i / 1000),
          i === 501 ? "backend backend backend backend backend" : "backend",
          i % 2 ? "KR" : "US",
        ]
      );
    }
    await db.exec(`update company_roles set title_embedding=null where role_id='${uuid(502)}';
      update company_roles set title_embedding_text='Old title' where role_id='${uuid(503)}';
      update company_roles set country_code='JP' where role_id='${uuid(504)}';
      update company_roles set country_code='US',work_mode='onsite' where role_id='${uuid(505)}';
      update company_roles set information='{"testOnly":true,"testFixture":"local-filter-first"}' where role_id='${uuid(506)}';
      update company_roles set is_expired=true where role_id='${uuid(507)}';
      update company_roles set expires_at=now()-interval '1 day' where role_id='${uuid(508)}';
      update company_roles set status='closed' where role_id='${uuid(509)}';
      update company_roles set source_provider='user_submitted' where role_id='${uuid(510)}';
      update company_roles set source_type='internal' where role_id='${uuid(511)}';
      update company_roles set company_workspace_id='${uuid(9001)}' where role_id='${uuid(512)}';
      update company_roles set company_workspace_id='${uuid(9002)}' where role_id='${uuid(513)}';
      update company_roles set type=ARRAY['contract'] where role_id='${uuid(514)}';
      insert into talent_opportunity_recommendation values('${uuid(1)}','${uuid(515)}','external_jd');
      update company_roles set salary_min=100 where role_id='${uuid(400)}';`);
    const execute = async (
      candidateLimit: number,
      salaryWeight: number,
      q = query
    ) => {
      const sql = buildJobSearchFilterSql({
        query: q,
        candidateLimit,
        salaryWeight,
        vector: JSON.parse(v(0)),
        userId: uuid(1),
        blockedCompanies: ["Blocked"],
      });
      return (
        await db.query<any>(
          "SELECT public.search_external_roles_filter_first($1) AS result",
          [sql]
        )
      ).rows[0].result;
    };
    const limited = await execute(500, 0);
    assert.equal(limited.rows.length, 500);
    assert.equal(limited.rows[0].role_id, uuid(1));
    assert.ok(
      !limited.rows.some((r: any) => r.role_id === uuid(501)),
      "FTS must not pull a role outside title N"
    );
    assert.equal(limited.counts.candidates, 500);
    assert.ok(
      Object.values(limited.timings).every(
        (ms) => typeof ms === "number" && ms >= 0
      )
    );
    const expanded = await execute(501, 0);
    assert.equal(expanded.rows.length, 500);
    assert.equal(expanded.rows[0].role_id, uuid(501));
    const salary = await execute(500, 1);
    assert.equal(salary.rows[0].role_id, uuid(400));
    const noKeywords = await execute(500, 1, {
      ...query,
      plan: { ...query.plan, ftsKeywords: [] },
    });
    assert.equal(
      noKeywords.rows[0].role_id,
      uuid(400),
      "salary still ranks when FTS is empty"
    );
    assert.equal(noKeywords.rows[0].fts_score, 0);
    const noSalary = await execute(500, 1, { ...query, targetSalaryKrw: null });
    assert.deepEqual(
      noSalary.rows.map((r: any) => r.role_id),
      limited.rows.map((r: any) => r.role_id)
    );
    assert.ok(
      limited.rows.every(
        (r: any) =>
          Number.isFinite(r.title_similarity) &&
          Number.isFinite(r.fts_score) &&
          Number.isFinite(r.salary_utility)
      )
    );
    const swapped = await execute(500, 0, {
      ...query,
      plan: {
        ...query.plan,
        countries: query.plan.countries.map((c) => ({
          ...c,
          weight: c.weight === 100 ? 1 : 100,
        })),
      },
    });
    assert.deepEqual(
      swapped.rows,
      limited.rows,
      "when all candidates fit, weights do not change scores or ordering"
    );
    // One company spans both countries. Cap by final score before the global
    // LIMIT, so other companies can fill the freed slots from the same ANN pool.
    const sameCompany = [1, 2, 3, 400, 501].map(uuid);
    await db.query(
      "update company_roles set company_workspace_id=$1 where role_id=ANY($2::uuid[])",
      [uuid(9000), sameCompany]
    );
    const capped = await execute(3000, 1);
    assert.equal(capped.counts.candidates, 502);
    assert.equal(capped.rows.length, 500);
    assert.deepEqual(
      capped.rows.filter((r: any) => sameCompany.includes(r.role_id)).map((r: any) => r.role_id),
      [uuid(400), uuid(501), uuid(1)]
    );
    assert.ok(capped.rows.some((r: any) => r.role_id === uuid(516)), "fill from remaining candidates before LIMIT");
    const immediate = (await db.query<any>(buildFilterFirstRoleSql({
      ...query, vector: JSON.parse(v(0)), userId: uuid(1),
      blockedCompanies: ["Blocked"], salaryWeight: 1, limit: 200, listOnly: true,
    }))).rows;
    assert.equal(immediate.length, 200);
    assert.equal(immediate.filter(r => Number(r.role_id.slice(-12)) % 2 === 1).length, 198);
    assert.deepEqual(immediate.filter(r => sameCompany.includes(r.role_id)).map(r => r.role_id),
      [uuid(400), uuid(501), uuid(1)], "country allocation preserves the global company cap");
    const sparseCompanies = await execute(500, 1);
    assert.equal(sparseCompanies.rows.length, 499, "do not exceed the company cap to fill the result limit");
    await db.query(
      "update company_roles set company_workspace_id=('00000000-0000-4000-8000-'||lpad((right(role_id::text,12)::int+10000)::text,12,'0'))::uuid where role_id=ANY($1::uuid[])",
      [sameCompany]
    );
    await db.exec(`update company_roles set seniority_level='junior' where role_id='${uuid(399)}';
      update company_roles set seniority_level='senior' where role_id='${uuid(398)}';
      update company_roles set posted_at=now()-interval '500 days' where role_id='${uuid(2)}';
      update company_roles set posted_at=null where role_id='${uuid(3)}';`);
    const unrestricted = await execute(500, 0);
    assert.ok(unrestricted.rows.some((r: any) => r.role_id === uuid(2)));
    assert.ok(unrestricted.rows.some((r: any) => r.role_id === uuid(3)));
    for (const [preference, expected] of [[1, 399], [-1, 398]] as const) {
      const result = await execute(500, 0, { ...query, plan: { ...query.plan, isPreferEntry: preference } });
      assert.equal(result.rows[0].role_id, uuid(expected));
      assert.equal(result.counts.candidates, unrestricted.counts.candidates);
    }
    for (const [recentWeight, olderWeight, expected] of [[0, 2, 2], [2, 0, 1]]) {
      const result = await execute(500, 0, { ...query, plan: { ...query.plan,
        postingRecency: { maxAgeDays: null, recentDays: 7, recentWeight, olderWeight },
      } });
      assert.equal(result.rows[0].role_id, uuid(expected));
    }
    const explicitWindow = await execute(500, 0, { ...query, plan: { ...query.plan,
      postingRecency: { maxAgeDays: 30, recentDays: null, recentWeight: null, olderWeight: null },
    } });
    assert.ok(!explicitWindow.rows.some((r: any) => [uuid(2), uuid(3)].includes(r.role_id)));
    await assert.rejects(execute(500, 0, {
      ...query, plan: { ...query.plan, countries: [...query.plan.countries, query.plan.countries[0]] },
    }), /Countries must be unique/);
    assert.deepEqual(
      (
        await db.query(
          "SELECT current_setting('enable_sort') AS sort, current_setting('hnsw.ef_search') AS ef"
        )
      ).rows,
      settingsBefore.rows
    );
    await assert.rejects(
      db.query(
        "SELECT public.search_external_roles_filter_first('SELECT * FROM missing_test_table')"
      )
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT current_setting('enable_sort') AS sort, current_setting('hnsw.ef_search') AS ef"
        )
      ).rows,
      settingsBefore.rows
    );
  } finally {
    await db.close();
  }
});
