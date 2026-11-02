import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readCareerReengagementOpportunities } from "./reengagementOpportunities";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("return context reads real SQL: matching-wide top ten, exclusions, latest assessments and run history", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE company_db(id uuid,name text);
      CREATE TABLE company_workspace(company_workspace_id uuid,company_name text,company_db_id uuid,external_roles_enabled boolean DEFAULT true);
      CREATE TABLE company_roles(role_id uuid,name text,company_workspace_id uuid,source_type text DEFAULT 'external',source_provider text,
        is_expired boolean DEFAULT false,expires_at timestamptz,status text DEFAULT 'active',information jsonb DEFAULT '{}',summary jsonb,
        location_text text,work_mode text,salary_range jsonb,external_jd_url text);
      CREATE TABLE talent_matchings(id uuid,talent_id uuid,title text,criteria jsonb,revision int,archived_at timestamptz);
      CREATE TABLE external_recommendation_runs(id uuid,talent_id uuid,matching_id uuid,variant text DEFAULT 'career_agent',status text,created_at timestamptz,finished_at timestamptz,evaluation_ids uuid[] DEFAULT '{}');
      CREATE TABLE talent_external_evaluations(id uuid,talent_id uuid,role_id uuid,assessment jsonb,evaluated_at timestamptz,input_fingerprint text);
      CREATE VIEW talent_external_evaluation_index AS SELECT e.*,(assessment#>>'{fit,mutualFit}')::float AS mutual_fit_score FROM talent_external_evaluations e;
      CREATE TABLE talent_opportunity_recommendation(talent_id uuid,role_id uuid,opportunity_type text DEFAULT 'external_jd');
      CREATE TABLE talent_external_fit(talent_id uuid,role_id uuid,evaluations jsonb,meta jsonb,created_at timestamptz);
      INSERT INTO company_workspace VALUES('${id(50)}','Allowed',null,true),('${id(51)}','Blocked',null,true);
      INSERT INTO talent_matchings VALUES('${id(7)}','${id(1)}','Backend roles','{"brief":[{"label":"Direction","content":"Backend ownership"}]}',1,null);
      INSERT INTO external_recommendation_runs(id,talent_id,matching_id,status,created_at,finished_at) VALUES
        ('${id(101)}','${id(1)}','${id(7)}','completed','2026-10-30','2026-10-30 01:00Z'),
        ('${id(102)}','${id(1)}','${id(7)}','failed','2026-11-01','2026-11-01 01:00Z'),
        ('${id(103)}','${id(1)}','${id(7)}','running','2026-11-02',null),
        ('${id(104)}','${id(2)}',null,'completed','2026-11-03',null);
      INSERT INTO company_roles(role_id,name,company_workspace_id,summary,location_text)
        SELECT md5(i::text)::uuid,'Role '||i,'${id(50)}','{"ko":"Backend ownership"}','Seoul' FROM generate_series(1,18) g(i);
      INSERT INTO talent_external_evaluations
        SELECT md5(('eval'||i)::text)::uuid,'${id(1)}',md5(i::text)::uuid,jsonb_build_object('fit',jsonb_build_object('mutualFit',100-i)),'2026-10-30',i::text FROM generate_series(1,18) g(i);
      UPDATE company_roles SET is_expired=true WHERE name='Role 1';
      INSERT INTO talent_opportunity_recommendation VALUES('${id(1)}',md5('2')::uuid,'external_jd');
      UPDATE company_roles SET information='{"testOnly":true}' WHERE name='Role 3';
      UPDATE company_roles SET company_workspace_id='${id(51)}' WHERE name='Role 4';
      INSERT INTO talent_external_evaluations VALUES('${id(900)}','${id(1)}',md5('5')::uuid,'{"fit":{"mutualFit":1}}','2026-11-01','new assessment');
      UPDATE external_recommendation_runs SET evaluation_ids=ARRAY(SELECT id FROM talent_external_evaluations) WHERE id='${id(101)}';
    `);
    const admin = {
      rpc: async (name: string, args: any) =>
        name === "career_opportunity_list_revision"
          ? { data: "revision-1", error: null }
          : { data: (await db.query(args.sql_query)).rows, error: null },
      from: (table: string) => ({
        select: () => ({
          in: async (_key: string, ids: string[]) => ({
            data: (
              await db.query(
                `SELECT * FROM ${table} WHERE role_id=ANY($1::uuid[])`,
                [ids]
              )
            ).rows,
            error: null,
          }),
        }),
      }),
    } as any;
    const context = await readCareerReengagementOpportunities({
      admin,
      userId: id(1),
      blockedCompanies: ["Blocked"],
    });
    assert.match(context, /showing 10 of 14/);
    assert.match(context, /Allowed \/ Role 6/);
    assert.doesNotMatch(context, /Allowed \/ Role [1235](?:\n|$)/);
    assert.doesNotMatch(context, /Blocked \/ Role 4/);
    assert.match(
      context,
      new RegExp(`Latest search attempt: ${id(103)}; running`)
    );
    assert.match(
      context,
      new RegExp(`Last completed search: ${id(101)}; completed`)
    );
    assert.doesNotMatch(context, new RegExp(id(104)));
    assert.match(context, /listRevision: revision-1/);
    assert.match(context, /Backend ownership/);
    assert.doesNotMatch(context, /T\d\d:\d\d:\d\d/);
    // No modern matching: reuse the historical source, not an empty modern-only page.
    await db.exec(`DELETE FROM external_recommendation_runs WHERE talent_id='${id(1)}';
      INSERT INTO external_recommendation_runs(id,talent_id,variant,status,created_at,finished_at)
      VALUES('${id(110)}','${id(1)}','v2','completed','2026-10-29','2026-10-29 01:00Z');
      INSERT INTO talent_external_fit VALUES('${id(1)}',md5('6')::uuid,'{"v2":{"mutualFit":81,"evaluatedAt":"2026-10-29T00:00:00Z","evidence":"sufficient"}}','{}','2026-10-29'),
      ('${id(1)}',md5('7')::uuid,'{}','{"score":90,"reason":"Backend ownership"}','2026-10-28');`);
    const historical = await readCareerReengagementOpportunities({
      admin,
      userId: id(1),
      blockedCompanies: [],
    });
    assert.match(historical, /Historical candidates: showing 2 of 2/);
    assert.match(historical, /Allowed \/ Role 6/);
    assert.match(historical, /Allowed \/ Role 7/);
    assert.match(historical, /mutualFit: 81/);
    assert.match(historical, /Backend ownership/);
    assert.match(
      historical,
      /not a new search or a current evaluation reference/
    );
  } finally {
    await db.close();
  }
});
