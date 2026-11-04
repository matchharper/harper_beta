import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  careerOpportunityIndexSql,
  historyCountsSql,
  historySelectionSql,
} from "./opportunityHistorySql";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table talent_opportunity_recommendation(id uuid primary key,talent_id uuid,role_id uuid,opportunity_type text,created_at timestamptz,feedback text,feedback_at timestamptz,saved_stage text,viewed_at timestamptz);
    create table company_intro_candidates(talent_id uuid,role_id uuid,recommendation_id uuid);
    create table talent_opportunity_memberships(id uuid,talent_id uuid,matching_id uuid,recommendation_id uuid,explanation text,archived_at timestamptz,updated_at timestamptz);
    create table talent_opportunity_tag(talent_id uuid,opportunity_id uuid,tag text,updated_at timestamptz);
    create table company_roles(role_id uuid,company_workspace_id uuid,source_type text,status text);
    create table company_workspace(company_workspace_id uuid);
    insert into company_workspace values('${id(2)}');
  `);
  for (let n = 10; n < 36; n++) {
    await db.query(`insert into company_roles values($1,$2,$3,'active')`, [
      id(n),
      id(2),
      n < 33 ? "external" : "internal",
    ]);
    await db.query(
      `insert into talent_opportunity_recommendation values($1,$2,$1,$3,$4,null,null,null,null)`,
      [
        id(n),
        id(1),
        n < 33 ? "external_jd" : "internal_recommendation",
        `2026-11-01T00:00:${n}Z`,
      ]
    );
    await db.query(
      `insert into talent_opportunity_memberships values($1,$2,null,$1,'original',null,'2026-11-01')`,
      [id(n), id(1)]
    );
  }
  return db;
}
async function page(
  db: PGlite,
  options: Parameters<typeof historySelectionSql>[0]
) {
  return (
    await db.query<any>(
      `${careerOpportunityIndexSql(id(1))} ${historySelectionSql(options)}`
    )
  ).rows;
}
test("new pages are ordered before hydration, have no overlap, and summaries count the same collection", async () => {
  const db = await fixture();
  try {
    const a = await page(db, { historyTab: "new", limit: 10 });
    const b = await page(db, { historyTab: "new", limit: 10, offset: 10 });
    assert.deepEqual(
      a.slice(0, 3).map((r) => r.id),
      [id(35), id(34), id(33)]
    );
    assert.equal(new Set([...a, ...b].map((r) => r.id)).size, 20);
    const [{ counts }] = (
      await db.query<any>(
        `${careerOpportunityIndexSql(id(1))} ${historyCountsSql}`
      )
    ).rows;
    assert.equal(counts.new, 26);
    assert.equal(counts.newInternal, 3);
    assert.equal(counts.newExternalUnread, 23);
    assert.equal(
      (
        await db.query<any>(
          `${careerOpportunityIndexSql(id(99))} ${historySelectionSql({})}`
        )
      ).rows.length,
      0
    );
  } finally {
    await db.close();
  }
});
test("an Intro replaces older recommendations, direct membership wins within one list, and another list stays independent", async () => {
  const db = await fixture();
  try {
    await db.exec(`insert into talent_opportunity_recommendation values('${id(40)}','${id(1)}','${id(33)}','intro_request','2026-11-02','like',null,'connected',null);
      insert into company_intro_candidates values('${id(1)}','${id(33)}','${id(40)}');
      insert into talent_opportunity_memberships values('${id(40)}','${id(1)}',null,'${id(40)}','direct','2026-11-02','2026-11-02');`);
    let items = await page(db, { roleIds: [id(33)] });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, id(40));
    assert.equal(items[0].list_position, "previous");
    assert.equal(items[0].list_explanation, "direct");
    await db.exec(
      `insert into talent_opportunity_memberships values('${id(41)}','${id(1)}','${id(50)}','${id(33)}','another list',null,'2026-11-01');`
    );
    items = await page(db, { roleIds: [id(33)] });
    assert.equal(items[0].list_position, "current");
    assert.equal(items[0].list_explanation, "another list");
    assert.equal((await page(db, { ids: [id(33)] })).length, 0);
    assert.equal(
      (
        await db.query<any>(
          `select feedback from talent_opportunity_recommendation where id='${id(33)}'`
        )
      ).rows[0].feedback,
      null
    );
  } finally {
    await db.close();
  }
});
test("reads preserve explicit stages, resolve legacy closure, and hide ended unanswered roles without a write", async () => {
  const db = await fixture();
  try {
    await db.exec(`update company_roles set status='ended' where role_id in ('${id(33)}','${id(34)}');
      update talent_opportunity_recommendation set feedback='like',saved_stage='connected' where id='${id(34)}';
      update talent_opportunity_recommendation set feedback='like' where id='${id(35)}';
      insert into talent_opportunity_tag values('${id(1)}','${id(35)}','내부:프로세스중단',now());`);
    assert.equal((await page(db, { ids: [id(33)] }))[0].saved_stage, "hidden");
    assert.equal(
      (await page(db, { historyTab: "saved", savedStage: "connected" }))[0].id,
      id(34)
    );
    assert.equal(
      (await page(db, { historyTab: "saved", savedStage: "closed" }))[0].id,
      id(35)
    );
    const [{ counts }] = (
      await db.query<any>(
        `${careerOpportunityIndexSql(id(1))} ${historyCountsSql}`
      )
    ).rows;
    assert.equal(counts.savedStages.hidden, 1);
    assert.equal(counts.savedStages.connected, 1);
    assert.equal(counts.savedStages.closed, 1);
    assert.equal(
      (
        await db.query<any>(
          `select saved_stage from talent_opportunity_recommendation where id='${id(33)}'`
        )
      ).rows[0].saved_stage,
      null
    );
  } finally {
    await db.close();
  }
});

test("role closure and the deployed archive RPC share one notice per recommendation; new reads emit nothing", async () => {
  const { readFile } = await import("node:fs/promises");
  const db = await fixture();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      alter table company_roles add column name text default 'Engineer';
      alter table company_workspace add column company_name text default 'Example';
      alter table company_workspace add column published_name text;
      create table talent_setting(user_id uuid,preferred_locale text);
      create table talent_activity_events(id uuid primary key default gen_random_uuid(),talent_id uuid,source text,event_type text,summary text,impact_level text,changed_domains text[],created_at timestamptz);
      create function public.current_talent_recommendation_id_v1(uuid) returns uuid language sql as $$ select $1 $$;
      insert into talent_opportunity_recommendation values('${id(81)}','${id(3)}','${id(33)}','internal_recommendation','2026-11-02','like',null,'connected',null);
      insert into talent_opportunity_recommendation values('${id(82)}','${id(4)}','${id(33)}','internal_recommendation','2026-11-02',null,null,'hidden',null);
      alter table talent_opportunity_recommendation add column updated_at timestamptz;
      update company_roles set status='ended' where role_id='${id(34)}';`);
    await db.exec(
      await readFile(
        new URL(
          "../../../supabase/migrations/20261104071842_career_opportunity_read_lifecycle.sql",
          import.meta.url
        ),
        "utf8"
      )
    );
    await page(db, { historyTab: "new", limit: 10 });
    await db.exec(`update company_roles set status='ended' where role_id='${id(10)}';
      update company_roles set status='active' where role_id='${id(33)}';`);
    assert.equal(
      (await db.query("select * from talent_activity_events")).rows.length,
      0
    );
    await db.exec(`update company_roles set status='ended' where role_id='${id(33)}';
      update company_roles set status='ended' where role_id='${id(33)}';`);
    assert.deepEqual(
      (
        await db.query(
          "select talent_id,event_type from talent_activity_events"
        )
      ).rows,
      [{ talent_id: id(1), event_type: "internal_opportunity_filled" }]
    );
    assert.equal(
      (
        await db.query<any>(
          `select saved_stage from talent_opportunity_recommendation where id='${id(33)}'`
        )
      ).rows[0].saved_stage,
      null
    );
    assert.equal((await page(db, { ids: [id(33)] }))[0].saved_stage, "hidden");
    // An unanswered role that reopens is actionable again; explicit user choices remain stored.
    await db.exec(
      `update company_roles set status='active' where role_id='${id(33)}'`
    );
    assert.equal((await page(db, { ids: [id(33)] }))[0].saved_stage, null);
    await db.exec(
      `update company_roles set status='ended' where role_id='${id(33)}'`
    );
    assert.equal(
      (await db.query("select * from talent_activity_events")).rows.length,
      1
    );
    // The old deployed GET still archives both the newly ended role and a role
    // that ended before installation. Only the latter needs another event.
    assert.equal(
      (
        await db.query<{ count: number }>(
          `select archive_ended_internal_opportunities_for_talent('${id(1)}','en') as count`
        )
      ).rows[0].count,
      2
    );
    assert.deepEqual(
      (
        await db.query<{ summary: string }>(
          "select summary from talent_activity_events order by summary"
        )
      ).rows.map((row) => row.summary),
      [
        "The Engineer position at Example has been filled and moved to the archive.",
        "Example의 Engineer 포지션은 채용이 완료되어 보관함으로 이동했습니다.",
      ].sort()
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          `select archive_ended_internal_opportunities_for_talent('${id(1)}','ko') as count`
        )
      ).rows[0].count,
      0
    );
    assert.equal(
      (await db.query("select * from talent_activity_events")).rows.length,
      2
    );
  } finally {
    await db.close();
  }
});
