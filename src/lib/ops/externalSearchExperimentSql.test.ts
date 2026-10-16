import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { buildFilterFirstSql } from "./externalSearchExperimentSql";
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
test("filter-first SQL executes hard filters before exact N, ignores country weights, ranks only that N and reports stages", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`create extension vector;
      create table company_db(id bigint primary key,name text);
      create table company_workspace(company_workspace_id uuid primary key,company_db_id bigint,company_name text,external_roles_enabled boolean default true);
      create table company_roles(role_id uuid primary key,company_workspace_id uuid,name text,source_type text default 'external',source_provider text,is_expired boolean default false,expires_at timestamptz,status text default 'active',information jsonb default '{}',
        external_jd_url text,country_code text default 'KR',location_text text,work_mode text,type text[],posted_at timestamptz default now(),salary_min numeric default 50,salary_max numeric,salary_currency text,salary_period text,salary_range text,salary_is_predicted boolean default false,opportunity_search_tsv tsvector,title_embedding vector(1536),title_embedding_text text);
      create table talent_opportunity_recommendation(talent_id uuid,role_id uuid,opportunity_type text);
      -- Controlled salary utility isolates the final ranking contract in this test.
      create function external_role_salary_satisfaction(numeric,numeric,text,text,numeric) returns double precision language sql immutable as 'select $1/$5';
      insert into company_workspace values ('${uuid(9000)}',null,'Synthetic',true),('${uuid(9001)}',null,'Blocked',true),('${uuid(9002)}',null,'Disabled',false);`);
    for (let i = 1; i <= 516; i++) {
      await db.query(
        `insert into company_roles(role_id,company_workspace_id,name,title_embedding_text,title_embedding,opportunity_search_tsv,country_code,work_mode)
        values ($1,$2,'Backend','Backend',$3,to_tsvector('simple',$4),$5,'remote')`,
        [
          uuid(i),
          uuid(9000),
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
      const sql = buildFilterFirstSql({
        query: q,
        candidateLimit,
        salaryWeight,
        vector: JSON.parse(v(0)),
        userId: uuid(1),
        blockedCompanies: ["Blocked"],
      });
      return (await db.query<any>(sql)).rows[0];
    };
    const limited = await execute(500, 0);
    assert.equal(limited.rows.length, 500);
    assert.equal(limited.rows[0].role_id, uuid(1));
    assert.ok(
      !limited.rows.some((r: any) => r.role_id === uuid(501)),
      "FTS must not pull a role outside title N"
    );
    assert.equal(limited.counts.eligible, 504);
    assert.equal(limited.counts.embedded, 502);
    assert.equal(limited.counts.missingEmbedding, 2);
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
      "country weights must not affect the experimental ranking"
    );
  } finally {
    await db.close();
  }
});
