import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  resetWonderfulRoleRecommendation,
  WONDERFUL_KOREA_FDE_ROLE_ID as role,
} from "./devWonderfulRoleReset";

const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const otherRole = "10000000-0000-4000-8000-000000000003";

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,source_type text,status text);
    create table talent_opportunity_recommendation(
      id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,
      kind text,opportunity_type text,feedback text,feedback_reason text,feedback_at timestamptz,
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
    "insert into company_roles values($1,$2,'internal','active')",
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
  const reset = () =>
    db.transaction((tx) =>
      resetWonderfulRoleRecommendation(
        async (sql, parameters) =>
          (await tx.query<Record<string, any>>(sql, parameters)).rows,
        owner
      )
    );
  return { db, reset };
}

test("reset replaces accepted history with one fresh Harper proposal, repeatedly and only for this pair", async () => {
  const { db, reset } = await fixture();
  try {
    await db.query(
      `insert into talent_opportunity_recommendation(talent_id,role_id,kind,opportunity_type,feedback,saved_stage)
       values($1,$2,'recommendation','intro_request','dislike','hidden')`,
      [owner, role]
    );
    const untouched = (
      await db.query(
        "select * from talent_opportunity_recommendation where talent_id<>$1 or role_id<>$2 order by id",
        [owner, role]
      )
    ).rows;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await reset();
      const { rows } = await db.query<any>(
        "select * from talent_opportunity_recommendation where talent_id=$1 and role_id=$2",
        [owner, role]
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, result.recommendationId);
      assert.equal(rows[0].opportunity_type, "internal_recommendation");
      for (const field of [
        "feedback",
        "feedback_reason",
        "feedback_at",
        "saved_stage",
        "processed_stage",
        "viewed_at",
        "clicked_at",
        "dismissed_at",
        "shared_material_id",
      ])
        assert.equal(rows[0][field], null);
      assert.deepEqual(rows[0].email_acceptance_confirmation, {});
      assert.equal(rows[0].fit_summary, "Existing fit explanation");
      assert.deepEqual(rows[0].fit_reasons, ["Existing evidence"]);
      const memberships = await db.query<any>(
        "select * from talent_opportunity_memberships where talent_id=$1 and role_id=$2",
        [owner, role]
      );
      assert.equal(memberships.rows.length, 1);
      assert.equal(memberships.rows[0].archived_at, null);
      for (const table of [
        "talent_progress",
        "company_intro_candidates",
        "company_talent_requests",
        "company_talent_followups",
      ]) {
        assert.equal(
          (
            await db.query(
              `select * from ${table} where talent_id=$1 and role_id=$2`,
              [owner, role]
            )
          ).rows.length,
          0
        );
        assert.equal((await db.query(`select * from ${table}`)).rows.length, 2);
      }
      for (const table of [
        "talent_opportunity_tag",
        "talent_opportunity_matching_review",
        "company_talent_relays",
        "contact_queue",
        "talent_role_activity",
        "talent_opportunity_chat_preview",
      ])
        assert.equal((await db.query(`select * from ${table}`)).rows.length, 2);
      assert.deepEqual(
        (
          await db.query(
            "select * from talent_opportunity_recommendation where talent_id<>$1 or role_id<>$2 order by id",
            [owner, role]
          )
        ).rows,
        untouched
      );
    }
  } finally {
    await db.close();
  }
});

test("failed reinsertion rolls back all deletions; meetings and in-flight delivery block before reset", async () => {
  const { db, reset } = await fixture();
  try {
    await db.exec(`create function fail_insert() returns trigger language plpgsql as $$ begin raise exception 'insertion failed'; end $$;
      create trigger fail_insert before insert on talent_opportunity_recommendation for each row execute function fail_insert();`);
    const snapshot = (
      await db.query(
        "select * from talent_opportunity_recommendation order by id"
      )
    ).rows;
    await assert.rejects(reset(), /insertion failed/);
    assert.deepEqual(
      (
        await db.query(
          "select * from talent_opportunity_recommendation order by id"
        )
      ).rows,
      snapshot
    );
    assert.equal(
      (await db.query("select * from talent_progress")).rows.length,
      3
    );
    await db.query(
      "insert into meeting_schedules(talent_id,role_id) values($1,$2)",
      [owner, role]
    );
    await assert.rejects(reset(), /미팅 기록/);
    await db.exec("delete from meeting_schedules");
    await db.query(
      "update contact_queue set locked_at=now() where user_id=$1 and role_id=$2",
      [owner, role]
    );
    await assert.rejects(reset(), /연락을 처리 중/);
    assert.deepEqual(
      (
        await db.query(
          "select * from talent_opportunity_recommendation order by id"
        )
      ).rows,
      snapshot
    );
  } finally {
    await db.close();
  }
});

test("first recommendation can be created without any earlier recommendation", async () => {
  const { db, reset } = await fixture();
  try {
    await reset();
    await db.query(
      "delete from talent_opportunity_recommendation where talent_id=$1 and role_id=$2",
      [owner, role]
    );
    await reset();
    const {
      rows: [rec],
    } = await db.query<any>(
      "select * from talent_opportunity_recommendation where talent_id=$1 and role_id=$2",
      [owner, role]
    );
    assert.equal(rec.fit_summary, null);
    assert.deepEqual(rec.fit_reasons, []);
    assert.deepEqual(rec.preference_fit, {});
  } finally {
    await db.close();
  }
});
