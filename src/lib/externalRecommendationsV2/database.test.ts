import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { buildHybridSql, fetchTitleNeighbors } from "./retrieval";
import { countryQuotas, countriesSchema, type V2SearchPlan } from "./countries";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const migration = new URL(
  "../../../supabase/migrations/20261013164046_external_recommendations_v2.sql",
  import.meta.url
);
const plan: V2SearchPlan = {
  searchIntentSummary: "Synthetic backend work",
  ftsKeywords: [{ terms: ["backend"], weight: 1 }],
  roleTitles: ["Backend Engineer"],
  includeContract: false,
  includeIntern: false,
  includeParttime: false,
  includeRemote: true,
  remoteOnly: false,
  isPreferEntry: 0,
  countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
  postingRecency: null,
};
const v = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
async function setup() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`create schema extensions; create role anon; create role authenticated; create role service_role;
    create table company_db(id bigint primary key,name text,description text,short_description text,location text,founded_year int,employee_count_range jsonb);
    create table company_workspace(company_workspace_id uuid primary key,company_db_id bigint,company_name text,company_description text,test_score numeric,external_roles_enabled boolean default true);
    create table talent_users(user_id uuid primary key,deleted_at timestamptz);
    create table talent_setting(user_id uuid primary key,get_external_recommendation boolean default true,is_onboarding_done boolean default true,status text default 'active',blocked_companies text[] default '{}');
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,name text,description text,source_type text default 'external',source_provider text,is_expired boolean default false,expires_at timestamptz,status text default 'active',information jsonb default '{}',summary jsonb,
      external_jd_url text,country_code text default 'KR',location_text text,work_mode text,type text[],posted_at timestamptz default now(),salary_min numeric,salary_max numeric,salary_currency text,salary_period text,salary_range text,seniority_level text,opportunity_search_tsv tsvector);
    create table talent_external_fit(talent_id uuid,role_id uuid,meta jsonb default '{}',created_at timestamptz default now(),primary key(talent_id,role_id));
    create table talent_opportunity_recommendation(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,kind text,opportunity_type text,rank int,score real,fit_summary text,fit_reasons jsonb,tradeoffs jsonb,evidence jsonb,created_at timestamptz default now());`);
  await db.exec(await readFile(migration, "utf8"));
  await db.exec(
    await readFile(
      new URL(
        "../../../supabase/migrations/20261013182559_external_title_embedding_dictionary.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  for (const filename of [
    "20261013183206_prepare_external_title_embedding_bulk_load.sql",
    "20261014020053_restore_external_title_embedding_index.sql",
    "20261014024436_external_live_title_index.sql",
    "20261014030809_retire_full_external_title_index.sql",
    "20261014033449_remove_unused_opportunity_quality_metadata.sql",
    "20261014190827_external_role_predicted_salary.sql",
    "20261014191352_external_role_salary_runtime.sql",
    "20261014193537_external_salary_retrieval_utility.sql",
    "20261014194720_preserve_salary_predictions_on_empty_ingest.sql",
    "20261014230152_external_salary_partial_bounds.sql",
    "20261015051422_daily_external_visit_eligibility.sql",
  ])
    await db.exec(
      await readFile(
        new URL(`../../../supabase/migrations/${filename}`, import.meta.url),
        "utf8"
      )
    );
  await db.query("insert into talent_users(user_id) values($1);", [uuid(1)]);
  await db.query("insert into talent_setting(user_id) values($1)", [uuid(1)]);
  await db.query(
    "insert into company_workspace(company_workspace_id,company_name) values($1,'Synthetic Labs'),($2,'Blocked Labs')",
    [uuid(2), uuid(3)]
  );
  for (let i = 10; i < 19; i++)
    await db.query(
      `insert into company_roles(role_id,company_workspace_id,name,description,opportunity_search_tsv,information)
    values($1,$2,$3,'Synthetic backend evidence',to_tsvector('simple','backend'),$4)`,
      [
        uuid(i),
        i === 14 ? uuid(3) : uuid(2),
        `Backend Engineer ${i}`,
        JSON.stringify(
          i === 13
            ? { testOnly: true, testFixture: "external-v2-local-isolation" }
            : {}
        ),
      ]
    );
  await db.query("update company_roles set is_expired=true where role_id=$1", [
    uuid(12),
  ]);
  await db.query(
    "update company_roles set source_type='internal',information='{" +
      '"testOnly":true,"testFixture":"external-v2-local-internal"' +
      "}' where role_id=$1",
    [uuid(15)]
  );
  await db.query(
    "update company_roles set source_provider='user_submitted' where role_id=$1",
    [uuid(16)]
  );
  await db.query("update company_roles set status='closed' where role_id=$1", [
    uuid(17),
  ]);
  await db.query("update company_roles set status='ended' where role_id=$1", [
    uuid(18),
  ]);
  await db.query("select save_role_title_embeddings($1::jsonb)", [
    JSON.stringify(
      [10, 12, 13, 14, 15, 16, 17, 18].map((n) => ({
        roleId: uuid(n),
        title: `Backend Engineer ${n}`,
        embedding: v,
      }))
    ),
  ]);
  await db.query(
    "update external_role_title_embeddings set embedding=$1::vector where title<>'Backend Engineer 11'",
    [JSON.stringify(v)]
  );
  return db;
}
test("real pgvector filter-first SQL excludes missing embeddings and enforces all eligibility filters", async () => {
  const db = await setup();
  try {
    const sql = buildHybridSql({
      plan,
      vectors: [v],
      userId: uuid(1),
      blockedCompanies: ["Blocked"],
      limit: 200,
    });
    const rows = await db.query<{
      search_external_roles_v2: { role_id: string };
    }>("select search_external_roles_v2($1)", [sql]);
    assert.deepEqual(
      rows.rows.map((r) => r.search_external_roles_v2.role_id),
      [uuid(10)]
    );
    const preview = await db.query<{
      search_external_roles_v2: Record<string, unknown>;
    }>("select search_external_roles_v2($1)", [
      buildHybridSql({
        plan,
        vectors: [v],
        userId: uuid(1),
        blockedCompanies: ["Blocked"],
        limit: 200,
        listOnly: true,
      }),
    ]);
    assert.deepEqual(
      preview.rows.map((r) => r.search_external_roles_v2.role_id),
      [uuid(10)]
    );
    assert.ok(
      preview.rows.every((r) => !("description" in r.search_external_roles_v2))
    );
    const hostile = buildHybridSql({
      plan: {
        ...plan,
        ftsKeywords: [
          { terms: ["backend'; DROP TABLE company_roles; --"], weight: 1 },
        ],
      },
      vectors: [v],
      userId: uuid(1),
      blockedCompanies: [],
      limit: 500,
    });
    await db.query("select search_external_roles_v2($1)", [hostile]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from company_roles"
        )
      ).rows[0].n,
      9
    );
    await assert.rejects(
      db.exec(
        `set role authenticated; select search_external_roles_v2('select 1');`
      ),
      /permission denied/
    );
  } finally {
    await db.close();
  }
});
test("shared retrieval preserves countries, history cutoff, extra exclusions and full salary fields", async () => {
  const { buildFilterFirstRoleSql } = await import("./filterFirstSql");
  const db = await setup();
  try {
    await db.exec(`update company_roles set location_text='Seoul',salary_min=80000000,salary_currency='KRW',salary_period='year';
      update company_workspace set test_score=7;`);
    const input = { plan, vector: v, userId: uuid(1), blockedCompanies: ["Blocked"] };
    const rows = (await db.query<any>(buildFilterFirstRoleSql(input))).rows;
    assert.deepEqual(rows.map(r => r.role_id), [uuid(10)]);
    assert.equal(Number(rows[0].salary_min), 80000000);
    assert.equal(Number(rows[0].company_test_score), 7);
    assert.equal(rows[0].description, "Synthetic backend evidence");
    assert.deepEqual((await db.query(buildFilterFirstRoleSql({ ...input, excludeRoleIds: [uuid(10)] }))).rows, []);
    await db.query("insert into talent_opportunity_recommendation(talent_id,role_id,opportunity_type,created_at) values($1,$2,'external_jd',now())", [uuid(1), uuid(10)]);
    assert.deepEqual((await db.query(buildFilterFirstRoleSql(input))).rows, []);
    assert.equal((await db.query(buildFilterFirstRoleSql({ ...input, asOf: "2020-01-01" }))).rows.length, 1);
    await db.query("delete from talent_opportunity_recommendation");
    await db.query("update company_roles set posted_at=now()-interval '361 days' where role_id=$1", [uuid(10)]);
    assert.equal((await db.query(buildFilterFirstRoleSql(input))).rows.length, 1);
  } finally { await db.close(); }
});
test("equal title and keyword evidence keeps equal relevance and salary can rescue a role beyond the old UUID cutoff", async () => {
  const db = await setup();
  try {
    await db.exec("delete from company_roles");
    await db.query(
      `insert into company_roles(role_id,company_workspace_id,name,description,opportunity_search_tsv,salary_min,salary_max,salary_currency,salary_period,posted_at)
      select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,'Shared Backend Title','Synthetic backend work',to_tsvector('simple','backend'),
      case when n>=2300 then 120000000 when n=1000 then 30000000 else null end,
      case when n>=2300 then 120000000 when n=1000 then 30000000 else null end,'KRW','year','2026-10-15'::timestamptz
      from generate_series(1000,2301) n`,
      [uuid(2)]
    );
    // Keep these ranking/country fixtures independent of the per-company cap.
    await db.exec(`insert into company_workspace(company_workspace_id,company_name)
      select role_id,'Synthetic' from company_roles;
      update company_roles set company_workspace_id=role_id;`);
    await db.query(
      "update company_roles set title_embedding=$1::vector,title_embedding_text=name where name='Shared Backend Title'",
      [JSON.stringify(v)]
    );
    const rows = (
      await db.query<any>(
        buildHybridSql({
          plan,
          vectors: [v],
          userId: uuid(1),
          blockedCompanies: [],
          limit: 200,
          targetSalaryKrw: 100e6,
        })
      )
    ).rows;
    assert.equal(rows.length, 200);
    assert.deepEqual(
      rows.slice(0, 2).map((r) => r.role_id),
      [uuid(2300), uuid(2301)]
    );
    assert.equal(Number(rows[0].search_rank), Number(rows[1].search_rank));
    assert.equal(Number(rows[2].search_rank), Number(rows[199].search_rank));
    assert.ok(rows.slice(2).every((r) => r.salary_min === null));
    assert.ok(!rows.some((r) => r.role_id === uuid(1000)));
  } finally {
    await db.close();
  }
});

test("both providers and every scored pair persist without erasing legacy fit or being dropped at selection", async () => {
  const db = await setup();
  try {
    await db.query(
      "insert into talent_external_fit(talent_id,role_id,meta) values($1,$2,'{\"score\":88}')",
      [uuid(1), uuid(10)]
    );
    for (const provider of ["openai", "jev"])
      await db.query("select save_external_fit_v2($1,$2,$3::jsonb)", [
        uuid(1),
        provider,
        JSON.stringify(
          [10, 11, 12, 13, 14, 15, 16, 17].map((n) => ({
            roleId: uuid(n),
            mutualFit: n,
            raw: { answer: n },
          }))
        ),
      ]);
    const rows = await db.query<any>(
      "select * from talent_external_fit order by role_id"
    );
    assert.equal(rows.rows.length, 8);
    assert.equal(rows.rows[0].meta.score, 88);
    assert.equal(rows.rows[0].evaluations.jev.mutualFit, 10);
    assert.equal(rows.rows[0].evaluations.openai.raw.answer, 10);
  } finally {
    await db.close();
  }
});
test("daily claims and recommendation commit are idempotent and recheck live settings", async () => {
  const db = await setup();
  try {
    const insert = () =>
      db.query(
        "insert into external_recommendation_runs(id,talent_id,experiment,variant,surface,day_key,time_zone) values($1,$2,'test','v2','daily',(now() at time zone 'Asia/Seoul')::date,'Asia/Seoul')",
        [uuid(100), uuid(1)]
      );
    await insert();
    await assert.rejects(insert(), /duplicate key/);
    const claim = await db.query<any>(
      "select claim_daily_external_run($1,$2) value",
      [uuid(100), uuid(101)]
    );
    assert.equal(claim.rows[0].value.attempts, 1);
    assert.equal(
      (
        await db.query<any>("select claim_daily_external_run($1,$2) value", [
          uuid(100),
          uuid(102),
        ])
      ).rows[0].value,
      null
    );
    const rows = JSON.stringify(
      [10, 12, 13, 14, 15, 16, 17, 18].map((n, i) => ({
        role_id: uuid(n),
        rank: i + 1,
        score: 0.6,
        tradeoffs: ["Synthetic recommendation note."],
      }))
    );
    await assert.rejects(
      db.query("select complete_external_recommendation_run($1,$2::jsonb,$3)", [
        uuid(100),
        rows,
        uuid(102),
      ]),
      /lease lost/
    );
    await db.exec(
      "update talent_setting set blocked_companies=array['Blocked'];"
    );
    const first = await db.query<any>(
      "select complete_external_recommendation_run($1,$2::jsonb,$3) value",
      [uuid(100), rows, uuid(101)]
    );
    assert.equal(first.rows[0].value.length, 1);
    assert.equal(first.rows[0].value[0].role_id, uuid(10));
    const second = await db.query<any>(
      "select complete_external_recommendation_run($1,$2::jsonb,$3) value",
      [uuid(100), rows, uuid(101)]
    );
    assert.deepEqual(first.rows, second.rows);
    await db.query(
      "insert into external_recommendation_runs(id,talent_id,experiment,variant,surface) values($1,$2,'test','v2','web')",
      [uuid(103), uuid(1)]
    );
    await db.exec(
      "update talent_setting set get_external_recommendation=false"
    );
    const disabled = await db.query<any>(
      "select complete_external_recommendation_run($1,$2::jsonb) value",
      [uuid(103), JSON.stringify([{ role_id: uuid(11), rank: 1, score: 0.6 }])]
    );
    assert.deepEqual(disabled.rows[0].value, []);
  } finally {
    await db.close();
  }
});
test("title changes clear derived state and a delayed embedding cannot write the old title", async () => {
  const db = await setup();
  try {
    await db.query(
      "update company_roles set name='Changed title' where role_id=$1",
      [uuid(10)]
    );
    const result = await db.query<any>(
      "select title_embedding,salary_is_predicted from company_roles where role_id=$1",
      [uuid(10)]
    );
    assert.equal(result.rows[0].title_embedding, null);
    assert.equal(result.rows[0].salary_is_predicted, false);
    const write = await db.query<any>(
      "select save_role_title_embeddings($1::jsonb) n",
      [
        JSON.stringify([
          { roleId: uuid(10), title: "Backend Engineer 10", embedding: v },
        ]),
      ]
    );
    assert.equal(write.rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test("summary writes preserve other locales and the winning text, and reject changed source", async () => {
  const db = await setup();
  try {
    const qualityColumns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='public' and table_name='company_roles' and column_name like 'opportunity_quality_%' order by column_name"
    );
    assert.deepEqual(qualityColumns.rows, []);
    const rpcAccess = await db.query<{
      old_rpc: string | null;
      anonymous: boolean;
      authenticated: boolean;
      service: boolean;
    }>(`select to_regprocedure('public.save_external_role_summaries_v2(text,jsonb,text)')::text old_rpc,
      has_function_privilege('anon','public.save_external_role_summaries_v2(text,jsonb)','execute') anonymous,
      has_function_privilege('authenticated','public.save_external_role_summaries_v2(text,jsonb)','execute') authenticated,
      has_function_privilege('service_role','public.save_external_role_summaries_v2(text,jsonb)','execute') service`);
    assert.deepEqual(rpcAccess.rows[0], {
      old_rpc: null,
      anonymous: false,
      authenticated: false,
      service: true,
    });
    const entry = {
      roleId: uuid(10),
      roleName: "Backend Engineer 10",
      description: "Synthetic backend evidence",
      companyWorkspaceId: uuid(2),
    };
    const save = (locale: string, content: string, overrides = {}) =>
      db.query<any>(
        "select * from save_external_role_summaries_v2($1,$2::jsonb)",
        [
          locale,
          JSON.stringify([{ ...entry, payload: { content }, ...overrides }]),
        ]
      );
    await save("ko", "한국어 요약");
    const bilingual = await save("en", "English summary");
    assert.equal(bilingual.rows[0].summary.ko.content, "한국어 요약");
    assert.equal(bilingual.rows[0].summary.en.content, "English summary");
    const repeat = await save("en", "Losing concurrent summary", {});
    assert.equal(repeat.rows[0].summary.en.content, "English summary");
    await db.query(
      "update company_roles set description='Updated evidence' where role_id=$1",
      [uuid(10)]
    );
    assert.deepEqual((await save("en", "Stale summary")).rows, []);
  } finally {
    await db.close();
  }
});

test("daily completion crossing local midnight saves no stale recommendations", async () => {
  const db = await setup();
  try {
    await db.query(
      "insert into external_recommendation_runs(id,talent_id,experiment,variant,surface,day_key,time_zone) values($1,$2,'test','v2','daily',(now() at time zone 'Asia/Seoul')::date-1,'Asia/Seoul')",
      [uuid(100), uuid(1)]
    );
    await db.query("select claim_daily_external_run($1,$2)", [
      uuid(100),
      uuid(101),
    ]);
    const result = await db.query<any>(
      "select complete_external_recommendation_run($1,$2::jsonb,$3) value",
      [
        uuid(100),
        JSON.stringify([{ role_id: uuid(10), rank: 1, score: 0.6 }]),
        uuid(101),
      ]
    );
    assert.deepEqual(result.rows[0].value, []);
    assert.equal(
      (
        await db.query<any>(
          "select status from external_recommendation_runs where id=$1",
          [uuid(100)]
        )
      ).rows[0].status,
      "skipped"
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from talent_opportunity_recommendation"
        )
      ).rows[0].n,
      0
    );
  } finally {
    await db.close();
  }
});

test("derived-only summary updates preserve the VC ingestion guard for source changes", async () => {
  const db = await setup();
  try {
    await db.exec(`create function public.lock_company_role_ingest(uuid) returns void language sql as 'select';
      create function public.vc_identity_is_operational(uuid) returns boolean language sql as 'select true';
      create trigger vc_guard before update of name, summary on company_roles for each row execute function guard_linkedin_role_write_for_vc_primary();`);
    await db.query(
      "update company_roles set source_provider='linkedin' where role_id=$1",
      [uuid(10)]
    );
    await db.query(
      'update company_roles set summary=\'{"ko":{"content":"Derived summary"}}\' where role_id=$1',
      [uuid(10)]
    );
    let row = (
      await db.query<any>(
        "select name,summary from company_roles where role_id=$1",
        [uuid(10)]
      )
    ).rows[0];
    assert.equal(row.summary.ko.content, "Derived summary");
    await db.query(
      "update company_roles set name='Competing source change' where role_id=$1",
      [uuid(10)]
    );
    row = (
      await db.query<any>("select name from company_roles where role_id=$1", [
        uuid(10),
      ])
    ).rows[0];
    assert.equal(row.name, "Backend Engineer 10");
  } finally {
    await db.close();
  }
});

test("identical role titles share one vector and a rename queues only the new title", async () => {
  const db = await setup();
  try {
    await db.query(
      "insert into company_roles(role_id,company_workspace_id,name) values($1,$2,'Backend Engineer 10')",
      [uuid(50), uuid(2)]
    );
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int n from external_role_title_embeddings where title='Backend Engineer 10'"
        )
      ).rows[0].n,
      1
    );
    await db.query(
      "update company_roles set name='New precise title' where role_id=$1",
      [uuid(50)]
    );
    const pending = await db.query<any>(
      "select * from pending_external_title_embeddings(1000)"
    );
    assert.ok(pending.rows.some((r) => r.title === "New precise title"));
    const wrong = await db.query<any>(
      "select save_external_title_embeddings($1::jsonb) n",
      [
        JSON.stringify([
          {
            titleKey: pending.rows.find((r) => r.title === "New precise title")
              .title_key,
            title: "Changed stale title",
            embedding: v,
          },
        ]),
      ]
    );
    assert.equal(wrong.rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test("live title counts follow duplicate roles, rename, expiry, reactivation and deletion", async () => {
  const db = await setup();
  try {
    const count = async (title: string) =>
      (
        await db.query<any>(
          "select live_role_count from external_role_title_embeddings where title=$1",
          [title]
        )
      ).rows[0]?.live_role_count;
    await db.query(
      "insert into company_roles(role_id,company_workspace_id,name) values($1,$3,'Lifecycle A'),($2,$3,'Lifecycle A')",
      [uuid(51), uuid(52), uuid(2)]
    );
    assert.equal(await count("Lifecycle A"), 2);
    await db.query(
      "update company_roles set name='Lifecycle B' where role_id=$1",
      [uuid(51)]
    );
    assert.equal(await count("Lifecycle A"), 1);
    assert.equal(await count("Lifecycle B"), 1);
    await db.query("update company_roles set status='ended' where role_id=$1", [
      uuid(52),
    ]);
    assert.equal(await count("Lifecycle A"), 0);
    await db.query(
      "update company_roles set status='active',is_expired=true where role_id=$1",
      [uuid(52)]
    );
    assert.equal(await count("Lifecycle A"), 0);
    await db.query(
      "update company_roles set is_expired=false where role_id=$1",
      [uuid(52)]
    );
    assert.equal(await count("Lifecycle A"), 1);
    await db.query(
      "update company_roles set source_type='internal' where role_id=$1",
      [uuid(52)]
    );
    assert.equal(await count("Lifecycle A"), 0);
    await db.query("delete from company_roles where role_id=$1", [uuid(51)]);
    assert.equal(await count("Lifecycle B"), 0);
  } finally {
    await db.close();
  }
});

test("country weights are unique ISO codes and quotas sum to the exact budget", () => {
  const countries = [
    { countryCode: "KR", weight: 0.8, remoteOnly: false },
    { countryCode: "US", weight: 0.2, remoteOnly: true },
  ];
  assert.deepEqual(
    countryQuotas(countries, 200).map((c) => c.quota),
    [160, 40]
  );
  assert.deepEqual(
    countryQuotas(countries, 500).map((c) => c.quota),
    [400, 100]
  );
  assert.deepEqual(
    countryQuotas(
      countries.map((c) => ({ ...c, weight: c.weight * 100 })),
      200
    ).map((c) => c.quota),
    [160, 40]
  );
  assert.equal(
    countryQuotas(
      [...countries, { countryCode: "JP", weight: 0.013, remoteOnly: false }],
      200
    ).reduce((n, c) => n + c.quota, 0),
    200
  );
  assert.equal(
    countriesSchema.safeParse([{ ...countries[0], countryCode: "KO" }]).success,
    false
  );
  assert.equal(
    countriesSchema.safeParse([countries[0], countries[0]]).success,
    false
  );
});
test("real SQL allocates weighted country quotas after ANN and keeps exact codes and conditional remote", async () => {
  const db = await setup();
  try {
    await db.exec("delete from company_roles");
    await db.query(
      `insert into company_roles(role_id,company_workspace_id,name,country_code,location_text,work_mode,opportunity_search_tsv)
      select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,'Shared Backend Title',
      case when n<=1300 then 'US' when n<=1900 then 'KR' when n<=1950 then 'JP' else null end,
      'Seoul, Korea',case when n%2=0 then 'remote' else 'onsite' end,to_tsvector('simple','backend')
      from generate_series(1000,2000) n`,
      [uuid(2)]
    );
    // Keep these ranking/country fixtures independent of the per-company cap.
    await db.exec(`insert into company_workspace(company_workspace_id,company_name)
      select role_id,'Synthetic' from company_roles;
      update company_roles set company_workspace_id=role_id;`);
    await db.query(
      "update company_roles set title_embedding=$1::vector,title_embedding_text=name where name='Shared Backend Title'",
      [JSON.stringify(v)]
    );
    const mixed = {
      ...plan,
      countries: [
        { countryCode: "KR", weight: 0.8, remoteOnly: false },
        { countryCode: "US", weight: 0.2, remoteOnly: true },
      ],
    };
    const retrieve = async (limit: 200 | 500) =>
      (
        await db.query<any>(
          buildHybridSql({
            plan: mixed,
            vectors: [v],
            userId: uuid(1),
            blockedCompanies: [],
            limit,
          })
        )
      ).rows;
    for (const limit of [200, 500] as const) {
      const rows = await retrieve(limit);
      assert.equal(rows.length, limit);
      assert.equal(new Set(rows.map((r) => r.role_id)).size, limit);
      assert.ok(rows.every((r) => ["KR", "US"].includes(r.country_code)));
      assert.equal(rows.filter((r) => r.country_code === "US").length, limit * 0.2);
      assert.ok(
        rows
          .filter((r) => r.country_code === "US")
          .every((r) => r.work_mode === "remote")
      );
    }
    // Leave only 15 eligible US roles; fill remaining 25 slots from KR, never JP/NULL.
    await db.exec(
      "update company_roles set is_expired=true where country_code='US' and role_id > '00000000-0000-4000-8000-000000001029'"
    );
    const sparse = await retrieve(200);
    assert.equal(sparse.filter((r) => r.country_code === "US").length, 15);
    assert.equal(sparse.filter((r) => r.country_code === "KR").length, 185);
    assert.equal(sparse.length, 200);
  } finally {
    await db.close();
  }
});

test("salary persistence is conditional, preserves actual pay, excludes test fixtures and invalidates stale estimates", async () => {
  const db = await setup();
  try {
    const hash = async (id: string) =>
      (
        await db.query<any>(
          "select md5(jsonb_build_array(name,description,company_workspace_id,location_text,country_code,type)::text) hash from company_roles where role_id=$1",
          [id]
        )
      ).rows[0].hash;
    const save = async (id: string, sourceHash: string) =>
      (
        await db.query<any>(
          "select * from save_external_role_salary_predictions($1::jsonb)",
          [
            JSON.stringify([
              { roleId: id, sourceHash, min: 60000000, max: 90000000 },
            ]),
          ]
        )
      ).rows;
    const sourceHash = await hash(uuid(10));
    assert.equal((await save(uuid(10), sourceHash)).length, 1);
    let row = (
      await db.query<any>(
        "select salary_min,salary_max,salary_currency,salary_period,salary_range,salary_is_predicted,title_embedding from company_roles where role_id=$1",
        [uuid(10)]
      )
    ).rows[0];
    assert.equal(row.salary_is_predicted, true);
    assert.equal(row.salary_currency, "KRW");
    assert.equal(row.salary_period, "year");
    assert.equal(row.salary_range, null);
    assert.ok(row.title_embedding);
    assert.equal((await save(uuid(10), sourceHash)).length, 0);
    await db.query(
      "update company_roles set salary_min=null,salary_max=null,salary_currency='USD',salary_period='year' where role_id=$1",
      [uuid(10)]
    );
    row = (
      await db.query<any>(
        "select salary_min,salary_is_predicted,salary_currency from company_roles where role_id=$1",
        [uuid(10)]
      )
    ).rows[0];
    assert.equal(row.salary_is_predicted, true);
    assert.equal(Number(row.salary_min), 60000000);
    assert.equal(row.salary_currency, "KRW");

    await db.query(
      "update company_roles set salary_min=100000000,salary_max=120000000 where role_id=$1",
      [uuid(10)]
    );
    row = (
      await db.query<any>(
        "select salary_is_predicted,salary_min from company_roles where role_id=$1",
        [uuid(10)]
      )
    ).rows[0];
    assert.equal(row.salary_is_predicted, false);
    assert.equal(Number(row.salary_min), 100000000);
    assert.equal((await save(uuid(10), sourceHash)).length, 0);
    await db.query(
      "update company_roles set salary_range='salary negotiable' where role_id=$1",
      [uuid(11)]
    );
    assert.equal((await save(uuid(11), await hash(uuid(11)))).length, 0);
    assert.equal((await save(uuid(13), await hash(uuid(13)))).length, 0); // canonical testOnly
    await db.query(
      "update company_roles set source_provider='linkedin' where role_id=$1",
      [uuid(12)]
    );
    const staleHash = await hash(uuid(12));
    assert.equal((await save(uuid(12), staleHash)).length, 1);
    await db.query(
      "update company_roles set salary_currency='USD' where role_id=$1",
      [uuid(12)]
    );
    row = (
      await db.query<any>(
        "select salary_min,salary_is_predicted from company_roles where role_id=$1",
        [uuid(12)]
      )
    ).rows[0];
    assert.equal(row.salary_min, null);
    assert.equal(row.salary_is_predicted, false);
    assert.equal((await save(uuid(12), staleHash)).length, 1);

    await db.query(
      "update company_roles set description='New duties' where role_id=$1",
      [uuid(12)]
    );
    row = (
      await db.query<any>(
        "select salary_is_predicted,salary_min from company_roles where role_id=$1",
        [uuid(12)]
      )
    ).rows[0];
    assert.equal(row.salary_is_predicted, false);
    assert.equal(row.salary_min, null);
    assert.equal((await save(uuid(12), staleHash)).length, 0);
    const acl = (
      await db.query<any>(
        "select has_function_privilege('anon','save_external_role_salary_predictions(jsonb)','execute') anon,has_function_privilege('authenticated','save_external_role_salary_predictions(jsonb)','execute') authenticated,has_function_privilege('service_role','save_external_role_salary_predictions(jsonb)','execute') service"
      )
    ).rows[0];
    assert.deepEqual(acl, { anon: false, authenticated: false, service: true });
  } finally {
    await db.close();
  }
});


test("original SQL debugging lab still supports the legacy combined-title SQL", async () => {
  const { buildRoleSearchSql } = await import("../talentOnboarding/jobPostingRecommendations");
  const db = await setup();
  try {
    await db.exec("alter table company_roles add column updated_at timestamptz default now();");
    const sql = buildRoleSearchSql({
      plan: { ...plan, locations: [], roleTitles: ["인공지능 엔지니어", "AI Engineer"] },
      titleVector: v, userId: uuid(1), blockedCompanies: ["Blocked"], searchMode: "strict",
    });
    assert.equal((sql.match(/nearest_titles AS MATERIALIZED/g) ?? []).length, 1);
    assert.doesNotMatch(sql, /ILIKE '%(?:인공지능 엔지니어|AI Engineer)%'/);
    const rows = await db.query<{ search_external_roles_v2: { role_id: string } }>("select search_external_roles_v2($1)", [sql + " LIMIT 150"]);
    assert.deepEqual(rows.rows.map(r => r.search_external_roles_v2.role_id), [uuid(10)]);
    const titleNeighbors = await fetchTitleNeighbors(
      {
        rpc: async (_name: string, params: { p_sql: string }) => ({
          data: (
            await db.query<{ search_external_roles_v2: unknown }>(
              "select search_external_roles_v2($1)",
              [params.p_sql]
            )
          ).rows.map((r) => r.search_external_roles_v2),
          error: null,
        }),
      } as any,
      v
    );
    const split = buildRoleSearchSql({
      plan: { ...plan, locations: [] },
      titleNeighbors,
      userId: uuid(1),
      blockedCompanies: ["Blocked"],
      searchMode: "strict",
    });
    assert.doesNotMatch(split, /ts_rank_cd/);
    assert.deepEqual(
      (
        await db.query("select search_external_roles_v2($1)", [
          split + " LIMIT 150",
        ])
      ).rows,
      rows.rows
    );
  } finally { await db.close(); }
});


test("daily visits ignore scheduled preferences but still require onboarding", async () => {
  const db = await setup();
  try {
    for (const [external, status, onboarded, expected] of [
      [false, "active", true, 1],
      [true, "stopped", true, 1],
      [false, "stopped", true, 1],
      [false, "stopped", false, 0],
    ] as const) {
      await db.exec("delete from talent_opportunity_recommendation; delete from external_recommendation_runs;");
      await db.query("update talent_setting set get_external_recommendation=$1,status=$2,is_onboarding_done=$3", [external, status, onboarded]);
      await db.query(
        "insert into external_recommendation_runs(id,talent_id,experiment,variant,surface,day_key,time_zone) values($1,$2,'test','v2','daily',current_date,'UTC')",
        [uuid(200), uuid(1)]
      );
      await db.query("select claim_daily_external_run($1,$2)", [uuid(200), uuid(201)]);
      const result = await db.query<any>(
        "select complete_external_recommendation_run($1,$2::jsonb,$3) value",
        [uuid(200), JSON.stringify([{ role_id: uuid(10), rank: 1, score: 0.6 }]), uuid(201)]
      );
      assert.equal(result.rows[0].value.length, expected, JSON.stringify({ external, status, onboarded }));
    }
  } finally {
    await db.close();
  }
});
