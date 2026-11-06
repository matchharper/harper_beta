import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  resetHarperTestRoleRecommendation,
  HARPER_TEST_ROLE_ID as role,
} from "./devHarperRoleReset";

const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const otherRole = "10000000-0000-4000-8000-000000000003";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text,information jsonb);
    create table talent_opportunity_recommendation(
      id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,
      kind text,opportunity_type text,model_version text,feedback text,feedback_reason text,feedback_at timestamptz,
      saved_stage text,processed_stage text,viewed_at timestamptz,clicked_at timestamptz,dismissed_at timestamptz,
      recommended_at timestamptz default now(),created_at timestamptz default now(),
      email_acceptance_confirmation jsonb default '{}',shared_material_id uuid,rank int,
      fit_summary text,fit_reasons jsonb default '[]',tradeoffs jsonb default '[]',evidence jsonb default '[]',preference_fit jsonb default '{}');
    create table company_talent_requests(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,recommendation_id uuid references talent_opportunity_recommendation on delete cascade);
    create table company_talent_relays(id uuid primary key default gen_random_uuid(),company_talent_request_id uuid references company_talent_requests on delete set null,recommendation_id uuid references talent_opportunity_recommendation on delete restrict);
    create table company_intro_candidates(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,recommendation_id uuid references talent_opportunity_recommendation on delete restrict);
    create table company_talent_followups(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid);
    create table talent_progress(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,recommendation_id uuid references talent_opportunity_recommendation on delete set null);
    create table talent_opportunity_tag(talent_id uuid,opportunity_id uuid,tag text);
    create table talent_opportunity_matching_review(talent_id uuid,opportunity_id uuid,recommendation_id uuid references talent_opportunity_recommendation on delete set null);
    create table contact_queue(id uuid primary key default gen_random_uuid(),user_id uuid,role_id uuid,recommendation_id uuid references talent_opportunity_recommendation on delete cascade,locked_at timestamptz);
    create table meeting_schedules(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,recommendation_id uuid references talent_opportunity_recommendation on delete restrict);
    create table talent_opportunity_memberships(talent_id uuid,recommendation_id uuid references talent_opportunity_recommendation on delete cascade,role_id uuid,explanation text,rank int,archived_at timestamptz);
    create table talent_role_activity(recommendation_id uuid references talent_opportunity_recommendation on delete cascade);
    create table talent_opportunity_chat_preview(recommendation_id uuid references talent_opportunity_recommendation on delete cascade);
  `);
  await db.exec(`
    create table talent_conversations(id uuid primary key default gen_random_uuid(),user_id uuid);
    create table talent_agent_runtime(conversation_id uuid,user_id uuid,state jsonb);
    create table talent_messages(id bigint generated always as identity primary key,user_id uuid,conversation_id uuid,payload jsonb);
    create table talent_conversation_summaries(conversation_id uuid);
    create table talent_external_operations(id uuid primary key default gen_random_uuid(),user_id uuid,conversation_id uuid,kind text,parent_id uuid references talent_external_operations,status text,request jsonb,provider_refs jsonb);
    create table talent_agent_schedules(talent_id uuid,last_operation_id uuid references talent_external_operations,target_refs jsonb);
    create table talent_role_materials(id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid);
    create table talent_simulate_application(id uuid primary key default gen_random_uuid(),user_id uuid,role_ref text,payload jsonb default '{}',message_id bigint,start_offer_message_id bigint);
    create table talent_referral_application(referred_user_id uuid,role_id uuid);
    create table agent_contact_messages(talent_id uuid,role_id uuid);
    create table talent_external_fit(talent_id uuid,role_id uuid);
    create table talent_external_evaluations(talent_id uuid,role_id uuid);
    create table talent_opportunity_fit(talent_id uuid,opportunity_id uuid);
  `);
  // Exercise the real list-membership trigger used by the Career reader.
  const migration = readFileSync(
    "supabase/migrations/20261029183004_career_matching_workspaces.sql",
    "utf8"
  );
  await db.exec(
    migration.slice(
      migration.indexOf(
        "create function public.ensure_career_opportunity_membership()"
      ),
      migration.indexOf(
        "insert into public.talent_opportunity_memberships(talent_id,recommendation_id,role_id,explanation,rank,archived_at)\nselect"
      )
    )
  );
  await db.query(
    `insert into company_roles values($1,$2,'external','active','{"testOnly":true,"testFixture":"harper-founding-engineer-ai-agent-v1","testTalentIds":[]}')`,
    [role, otherRole]
  );
  for (const [talent, targetRole] of [
    [owner, role],
    [other, role],
    [owner, otherRole],
  ]) {
    const {
      rows: [rec],
    } = await db.query<{ id: string }>(
      `insert into talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,feedback,saved_stage,fit_summary,fit_reasons)
       values($1,$2,'recommendation','internal_recommendation','like','accepted','Existing fit explanation','["Existing evidence"]') returning id`,
      [talent, targetRole]
    );
    for (const table of [
      "company_talent_requests",
      "company_intro_candidates",
      "talent_progress",
    ]) {
      await db.query(
        `insert into ${table}(talent_id,role_id,recommendation_id) values($1,$2,$3)`,
        [talent, targetRole, rec.id]
      );
    }
    await db.query(
      "insert into company_talent_relays(recommendation_id) values($1)",
      [rec.id]
    );
    await db.query(
      "insert into company_talent_followups(talent_id,role_id) values($1,$2)",
      [talent, targetRole]
    );
    await db.query(
      "insert into talent_opportunity_tag values($1,$2,'내부:연결대기')",
      [talent, targetRole]
    );
    await db.query(
      "insert into talent_opportunity_matching_review values($1,$2,$3)",
      [talent, targetRole, rec.id]
    );
    await db.query(
      "insert into contact_queue(user_id,role_id,recommendation_id) values($1,$2,$3)",
      [talent, targetRole, rec.id]
    );
    for (const table of [
      "talent_role_activity",
      "talent_opportunity_chat_preview",
    ]) {
      await db.query(`insert into ${table} values($1)`, [rec.id]);
    }
  }
  let stopped = 0;
  const reset = () =>
    db.transaction((tx) =>
      resetHarperTestRoleRecommendation(
        async (sql, parameters) =>
          (await tx.query<Record<string, any>>(sql, parameters)).rows,
        owner,
        async () => {
          stopped++;
        }
      )
    );
  return { db, reset, stopped: () => stopped };
}

test("reset clears only this account's fixture history, closes its browser and creates one fresh external opportunity repeatedly", async () => {
  const { db, reset, stopped } = await fixture();
  try {
    const untouched = (
      await db.query(
        `select * from talent_opportunity_recommendation where talent_id<>$1 or role_id<>$2 order by id`,
        [owner, role]
      )
    ).rows;
    const {
      rows: [conversation],
    } = await db.query<any>(
      `insert into talent_conversations(user_id) values($1) returning id`,
      [owner]
    );
    const {
      rows: [browser],
    } = await db.query<any>(
      `insert into talent_external_operations(user_id,conversation_id,kind,status,request,provider_refs)
      values($1,$2,'browser_session','idle',$3,'{}') returning id`,
      [
        owner,
        conversation.id,
        JSON.stringify({ role_refs: [`external:${role}`] }),
      ]
    );
    await db.query(
      `insert into talent_external_operations(user_id,conversation_id,kind,parent_id,status,request,provider_refs)
      values($1,$2,'browser_run',$3,'completed','{}','{}')`,
      [owner, conversation.id, browser.id]
    );
    await db.query(
      `insert into talent_messages(user_id,conversation_id,payload) values($1,$2,$3),($1,$2,'{"text":"unrelated"}')`,
      [owner, conversation.id, JSON.stringify({ sessionId: browser.id })]
    );
    for (const table of [
      "talent_role_materials",
      "talent_external_fit",
      "talent_external_evaluations",
      "agent_contact_messages",
    ])
      for (const talent of [owner, other])
        await db.query(
          `insert into ${table}(talent_id,role_id) values($1,$2)`,
          [talent, role]
        );
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await reset();
      const { rows } = await db.query<any>(
        `select * from talent_opportunity_recommendation where talent_id=$1 and role_id=$2`,
        [owner, role]
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, result.recommendationId);
      assert.equal(rows[0].opportunity_type, "external_jd");
      for (const field of [
        "feedback",
        "saved_stage",
        "processed_stage",
        "viewed_at",
        "clicked_at",
        "dismissed_at",
        "shared_material_id",
        "fit_summary",
      ])
        assert.equal(rows[0][field], null);
      assert.equal(
        (
          await db.query(
            `select * from talent_opportunity_memberships where talent_id=$1 and role_id=$2 and archived_at is null`,
            [owner, role]
          )
        ).rows.length,
        1
      );
      for (const table of [
        "talent_role_materials",
        "talent_external_fit",
        "talent_external_evaluations",
        "agent_contact_messages",
      ])
        assert.deepEqual(
          (await db.query(`select talent_id from ${table}`)).rows,
          [{ talent_id: other }]
        );
      assert.equal(
        (await db.query(`select * from talent_external_operations`)).rows
          .length,
        0
      );
      assert.deepEqual(
        (await db.query(`select payload from talent_messages`)).rows,
        [{ payload: { text: "unrelated" } }]
      );
      assert.deepEqual(
        (
          await db.query(
            `select * from talent_opportunity_recommendation where talent_id<>$1 or role_id<>$2 order by id`,
            [owner, role]
          )
        ).rows,
        untouched
      );
    }
    assert.equal(stopped(), 1);
    assert.deepEqual(
      (
        await db.query<any>(
          `select information->'testTalentIds' as ids from company_roles where role_id=$1`,
          [role]
        )
      ).rows[0].ids,
      [owner]
    );
  } finally {
    await db.close();
  }
});

test("nonfixture roles, running work and failed replacement preserve prior data", async () => {
  const { db, reset } = await fixture();
  try {
    const snapshot = (
      await db.query(
        `select * from talent_opportunity_recommendation order by id`
      )
    ).rows;
    await db.query(
      `update company_roles set information=information||'{"testOnly":false}' where role_id=$1`,
      [role]
    );
    await assert.rejects(reset(), /테스트 공고/);
    await db.query(
      `update company_roles set information=information||'{"testOnly":true}' where role_id=$1`,
      [role]
    );
    await db.query(
      `insert into talent_external_operations(user_id,kind,status,request) values($1,'delegated_work','running',$2)`,
      [owner, JSON.stringify({ target: role })]
    );
    await assert.rejects(reset(), /실행 중/);
    await db.exec(`delete from talent_external_operations;
      create function fail_insert() returns trigger language plpgsql as $$ begin raise exception 'insertion failed'; end $$;
      create trigger fail_insert before insert on talent_opportunity_recommendation for each row execute function fail_insert();`);
    await assert.rejects(reset(), /insertion failed/);
    assert.deepEqual(
      (
        await db.query(
          `select * from talent_opportunity_recommendation order by id`
        )
      ).rows,
      snapshot
    );
    assert.equal(
      (await db.query(`select * from talent_progress`)).rows.length,
      3
    );
  } finally {
    await db.close();
  }
});
