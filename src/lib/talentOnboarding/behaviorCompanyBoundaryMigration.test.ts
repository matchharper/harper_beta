import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// The Behavior change queue receives only what the candidate knows (D3, D10).
// try_enqueue_talent_behavior_context_change is stubbed to record its calls.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text, published_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid, name text);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, text text, user_id text, kind text, metadata jsonb, company_user_id uuid,
    created_at timestamptz default now(), open_to_talent boolean, open_to_company boolean);
  create table talent_opportunity_tag(id uuid primary key default gen_random_uuid(), talent_id uuid,
    opportunity_id uuid, tag text, created_at timestamptz default now(), updated_at timestamptz);
  create table talent_opportunity_recommendation(id uuid primary key default gen_random_uuid(), talent_id uuid,
    role_id uuid, feedback text, feedback_reason jsonb, saved_stage text, processed_stage text, viewed_at timestamptz,
    clicked_at timestamptz, dismissed_at timestamptz, recommended_at timestamptz, created_at timestamptz default now());
  create table enqueued(source_type text, source_id text, operation text, fields text[], summary text);
  create function try_enqueue_talent_behavior_context_change(p_talent_id uuid, p_source_type text, p_source_id text,
    p_operation text, p_changed_fields text[], p_occurred_at timestamptz, p_idempotency_key text, p_change_summary text)
  returns void language sql as $$
    insert into public.enqueued values (p_source_type, p_source_id, p_operation, p_changed_fields, p_change_summary) $$;
  create function enqueue_talent_progress_behavior_context_change() returns trigger language plpgsql as $$ begin return new; end $$;
  create function enqueue_opportunity_tag_behavior_context_change() returns trigger language plpgsql as $$ begin return new; end $$;
  create function enqueue_recommendation_behavior_context_change() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger talent_recommendation_behavior_context_change after insert or delete or update on talent_opportunity_recommendation
    for each row execute function enqueue_recommendation_behavior_context_change();
  create trigger talent_progress_behavior_context_change after insert or delete or update on talent_progress
    for each row execute function enqueue_talent_progress_behavior_context_change();
  create trigger talent_opportunity_tag_behavior_context_change after insert or delete or update on talent_opportunity_tag
    for each row execute function enqueue_opportunity_tag_behavior_context_change();
`;
const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const talent = "20000000-0000-4000-8000-000000000001";

test("company records and unknown stages never reach the candidate's Behavior queue", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`insert into company_workspace values ('${workspace}', 'Acme', null);
      insert into company_roles values ('${role}', '${workspace}', 'Engineer');`);
    const sql = await readFile(new URL("../../../supabase/migrations/20261105060000_behavior_company_boundary.sql", import.meta.url), "utf8");
    // read_career_follow_scan reads Career tables this test does not create.
    await db.exec(`set check_function_bodies = off;\n${sql}`);
    const progress = (kind: string, open: boolean, text = "row text", metadata = '{"stopNote":"salary too high"}') =>
      db.query<any>(`insert into talent_progress(talent_id, role_id, kind, text, metadata, open_to_talent)
        values ($1, $2, $3, $4, $5::jsonb, $6) returning id`, [talent, role, kind, text, metadata, open]);
    for (const [kind, open] of [["org_note", false], ["org_company_intro_passed", false], ["manual_note", false],
      ["org_stage_change", false], ["candidate_profile_opened", false]] as const)
      await progress(kind, open);
    assert.equal((await db.query<any>("select count(*)::int n from enqueued")).rows[0].n, 0);

    await progress("internal_followup_sent", true, "follow-up mail", '{"companyName":"Acme","stopNote":"x"}');
    await progress("intro_to_company", false, "pitch to the company", '{"companyPresentation":"pitch","deliveryStatus":"canceled"}');
    await progress("intro_to_company", false, "intro", '{"companyPresentation":"pitch","deliveryStatus":"sent"}');
    await progress("candidate_opportunity_feedback_changed", false, "like", '{"feedback":"like"}');
    const hidden = (await progress("org_stage_change", false, "stopped", '{"stopNote":"bad reference"}')).rows[0].id;
    await db.query("update talent_progress set open_to_talent = true where id = $1", [hidden]);
    const rows = (await db.query<any>("select source_type, operation, fields, summary from enqueued order by summary")).rows;
    assert.deepEqual(rows.map(r => r.summary).sort(), [
      "opportunity progress changed; role=Engineer; kind=org_stage_change; fields=open_to_talent",
      "opportunity progress recorded; role=Engineer; kind=candidate_opportunity_feedback_changed",
      "opportunity progress recorded; role=Engineer; kind=internal_followup_sent",
      "opportunity progress recorded; role=Engineer; kind=intro_to_company",
    ]);
    assert.ok(rows.every(r => !/salary|pitch|bad reference|stopNote|follow-up mail|Acme/.test(r.summary)));

    await db.exec("delete from enqueued");
    const tag = async (value: string) =>
      (await db.query<any>("insert into talent_opportunity_tag(talent_id, opportunity_id, tag) values ($1, $2, $3) returning id",
        [talent, role, value])).rows[0].id;
    for (const value of ["내부:보류", "내부:아카이브", "내부:프로세스중단", "내부단계:abc"]) await tag(value);
    assert.equal((await db.query<any>("select count(*)::int n from enqueued")).rows[0].n, 0);
    const connected = await tag("내부:연결됨");
    await db.query("update talent_opportunity_tag set tag = '내부:보류' where id = $1", [connected]);
    await db.query("update talent_opportunity_tag set tag = '내부:최종오퍼' where id = $1", [connected]);
    await db.query("delete from talent_opportunity_tag where id = $1", [connected]);
    const tags = (await db.query<any>("select operation, summary from enqueued order by operation")).rows;
    assert.deepEqual(tags.map(r => r.operation), ["insert", "update"]);
    assert.ok(tags.every(r => r.summary === "opportunity process stage changed; role=Engineer"));

    // Recommendations: the company pipeline stage is neither queued nor written.
    await db.exec("delete from enqueued");
    const rec = (await db.query<any>(
      "insert into talent_opportunity_recommendation(talent_id, role_id, processed_stage) values ($1, $2, 'archived') returning id",
      [talent, role])).rows[0].id;
    await db.query("update talent_opportunity_recommendation set processed_stage = 'process_stopped' where id = $1", [rec]);
    assert.equal((await db.query<any>("select count(*)::int n from enqueued")).rows[0].n, 0);
    await db.query("update talent_opportunity_recommendation set feedback = 'like' where id = $1", [rec]);
    await db.query("update talent_opportunity_recommendation set processed_stage = 'custom:abc' where id = $1", [rec]);
    const recs = (await db.query<any>("select operation, fields, summary from enqueued")).rows;
    assert.equal(recs.length, 1);
    assert.ok(!recs[0].fields.includes("processed_stage"));
    assert.doesNotMatch(recs[0].summary, /processed_stage|archived|process_stopped|custom|Acme/);
    assert.match(recs[0].summary, /^recommendation recorded; role=Engineer; feedback=like/);

    const scan = (await db.query<any>("select pg_get_functiondef('read_career_follow_scan(integer)'::regprocedure) d")).rows[0].d;
    assert.doesNotMatch(scan, /company_memory_entries|company_memories/);
    const can = (await db.query<any>(
      "select has_function_privilege('anon', 'talent_progress_reaches_behavior_v1(text,boolean,jsonb)', 'EXECUTE') ok")).rows[0].ok;
    assert.equal(can, false);
  } finally { await db.close(); }
});
