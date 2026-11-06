import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Email button decisions point at the mail they were made in: each recipient
// gets their own mail, so another recipient's later mail must not be picked.
// Only the objects the migrations read are created.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    updated_at timestamptz);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text, criteria jsonb,
    team_id uuid, memory text);
  create table company_role_start_sessions(role_id uuid primary key references company_roles, brief jsonb,
    first_candidates jsonb not null default '[]');
  create table talent_users(user_id uuid primary key);
  create table company_role_candidate_evaluations(id uuid primary key, role_id uuid, talent_id uuid, run_id uuid,
    evaluated_at timestamptz);
  create table talent_role_materials(id uuid primary key);
  create table company_intro_candidates(id uuid primary key, company_workspace_id uuid, role_id uuid, talent_id uuid,
    status text, close_reason text, requested_by_company_user_id uuid, requested_at timestamptz, company_appeal text,
    next_stage_id uuid, revision int not null default 0, updated_at timestamptz, selection_run_id uuid,
    selected_at timestamptz, presentation jsonb, shared_material_id uuid, created_at timestamptz default now(),
    delivery_run_id uuid, recommendation_id uuid);
  create table opportunity_discovery_run(id uuid primary key, talent_id uuid, status text, trigger_payload jsonb);
  create table talent_opportunity_recommendation(id uuid primary key, talent_id uuid, evidence jsonb);
  create table company_first_slack_outbox(id uuid primary key, run_id uuid, company_workspace_id uuid, channel_id uuid,
    candidate_ids uuid[], status text, sent_at timestamptz, slack_message_ts text, delivery_kind text);
  create table company_email_outbox(id uuid primary key, recipient_id uuid);
  create table company_email_action_links(id uuid primary key default gen_random_uuid(), email_outbox_id uuid,
    company_workspace_id uuid, company_user_id uuid, intro_candidate_id uuid, action text,
    unique (email_outbox_id, intro_candidate_id, action));
  create table external_candidates(id uuid primary key, run_id uuid, company_workspace_id uuid, role_id uuid,
    headline text, current_company text, verdict jsonb, rank int, delivered boolean not null default false);
  create table company_todo_suggestions(id uuid primary key, company_workspace_id uuid, role_id uuid, kind text,
    title text, plan text, talent_ids uuid[], status text not null default 'pending', source text);
  create table company_messages(id bigint generated always as identity primary key, company_workspace_id uuid, body text);
  create table company_memory_entries(id bigint generated always as identity primary key, company_workspace_id uuid,
    scope text, role_id uuid, team_id uuid, content text, deleted_at timestamptz);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now(), open_to_talent boolean, open_to_company boolean);
  create function company_role_search_brief_snapshot_v1(p_role_id uuid) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object('roleId', r.role_id, 'name', r.name, 'request', ir.request, 'criteria', ir.criteria,
      'location', r.location_text)
    from company_roles r join company_internal_roles ir using(role_id) where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function scheduled_company_memory_fingerprint_v1(p_role uuid) returns text language sql stable set search_path = public as $$
    select md5(coalesce((select i.memory from company_internal_roles i where i.role_id = p_role), '')) $$;
  create function pass_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid)
  returns jsonb language plpgsql security definer set search_path to 'public' as $$
  begin
    update public.company_intro_candidates set status = 'passed', requested_by_company_user_id = p_company_user_id,
      revision = revision + 1 where id = p_intro_candidate_id and status = 'ready';
    if not found then return jsonb_build_object('status', 'already_passed'); end if;
    return jsonb_build_object('status', 'passed', 'introCandidateId', p_intro_candidate_id);
  end $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language plpgsql security definer set search_path to 'public' as $$
  begin
    update public.company_intro_candidates set status = 'awaiting_talent', requested_by_company_user_id = p_company_user_id,
      requested_at = now(), company_appeal = p_company_appeal, revision = revision + 1
    where id = p_intro_candidate_id and status = 'ready';
    if not found then return jsonb_build_object('status', 'already_requested'); end if;
    return jsonb_build_object('status', 'requested', 'introCandidateId', p_intro_candidate_id);
  end $$;
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const memberA = "10000000-0000-4000-8000-00000000000a";
const memberB = "10000000-0000-4000-8000-00000000000b";
const talent = (n: number) => `20000000-0000-4000-8000-00000000000${n}`;
const card = (n: number) => `30000000-0000-4000-8000-00000000000${n}`;
const run = "40000000-0000-4000-8000-000000000001";
const mailA = "60000000-0000-4000-8000-00000000000a";
const mailB = "60000000-0000-4000-8000-00000000000b";
const mailALater = "60000000-0000-4000-8000-00000000000c";

/** The Career request exactly as the 11/6 release defines it (the rest of that file is candidate-side). */
async function careerRequestFunction() {
  const sql = await readFile(
    new URL("../../../supabase/migrations/20261106084304_career_company_intro_agent.sql", import.meta.url), "utf8");
  const start = sql.indexOf("create function public.request_company_intro_for_career_v1(");
  assert.ok(start >= 0, "the Career request is defined in the 11/6 release");
  return sql.slice(start, sql.indexOf("end $$;", start) + "end $$;".length);
}

test("a Pass or request from a mail button points at that recipient's mail", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    for (const name of [
      "20261105020000_company_decision_events.sql",
      "20261105080000_company_role_brief_revisions.sql",
      "20261105110000_company_presentations.sql",
    ]) await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    await db.exec(await careerRequestFunction());
    await db.exec(await readFile(
      new URL("../../../supabase/migrations/20261107050000_company_email_decision_presentation.sql", import.meta.url), "utf8"));

    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name, source_type) values ('${role}', '${workspace}', 'Engineer', 'internal');
      insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief', '[]');
      insert into talent_users values ${[1, 2, 3, 4, 5].map((n) => `('${talent(n)}')`).join(", ")};
      insert into company_intro_candidates(id, company_workspace_id, role_id, talent_id, status, selection_run_id, presentation) values
        ${[1, 2, 3, 4, 5].map((n) => `('${card(n)}', '${workspace}', '${role}', '${talent(n)}', 'ready', '${run}', '{"name":"T${n}"}')`).join(", ")};
      insert into company_email_outbox values ('${mailA}', '${memberA}'), ('${mailB}', '${memberB}'), ('${mailALater}', '${memberA}');
    `);
    // Each recipient's mail holds the buttons for cards 1, 2, 4 and 5; B's mail
    // goes out later, and A gets card 1 again in a later mail.
    for (const [mail, member, cards] of [[mailA, memberA, [1, 2, 4, 5]], [mailB, memberB, [1, 2, 4, 5]], [mailALater, memberA, [1]]] as const) {
      await db.exec(`insert into company_email_action_links(email_outbox_id, company_workspace_id, company_user_id, intro_candidate_id, action) values
        ${cards.flatMap((n) => ["pass", "request_intro"].map((action) =>
          `('${mail}', '${workspace}', '${member}', '${card(n)}', '${action}')`)).join(", ")};`);
    }
    await db.exec(`
      update company_presentations set presented_at = now() - interval '3 minutes' where surface = 'inbox_card';
      update company_presentations set presented_at = now() - interval '2 minutes' where delivery_ref->>'emailOutboxId' = '${mailA}';
      update company_presentations set presented_at = now() - interval '1 minute' where delivery_ref->>'emailOutboxId' = '${mailB}';
      update company_presentations set presented_at = now() - interval '30 seconds' where delivery_ref->>'emailOutboxId' = '${mailALater}';
    `);
    const linkPresentation = async (mail: string, n: number) => (await db.query<any>(
      `select distinct presentation_id from company_email_action_links where email_outbox_id = $1 and intro_candidate_id = $2`,
      [mail, card(n)])).rows.map((row) => row.presentation_id);
    const [a1] = await linkPresentation(mailA, 1);
    const [b2] = await linkPresentation(mailB, 2);
    const [a4] = await linkPresentation(mailA, 4);
    const [a5] = await linkPresentation(mailA, 5);
    const [b5] = await linkPresentation(mailB, 5);
    assert.ok(a1 && b2 && a4 && a5 && b5);
    const pointer = async (where: string) =>
      (await db.query<any>(`select presentation_id from company_decision_events where ${where}`)).rows.map((row) => row.presentation_id);

    // Named arguments exactly as passOrgCompanyIntro / requestOrgCompanyIntro send them.
    const passed = (await db.query<any>(`select pass_company_intro_with_presentation_v1(
      p_channel => 'email', p_company_user_id => $1, p_company_workspace_id => $2, p_intro_candidate_id => $3,
      p_reason_text => null, p_source_message_id => null, p_presentation_id => $4) as result`,
      [memberA, workspace, card(1), a1])).rows[0].result;
    assert.equal(passed.status, "passed");
    assert.ok(passed.decisionId);
    // The mail the button was in, although B's mail and A's next mail with the
    // same candidate are later.
    assert.deepEqual(await pointer(`intro_candidate_id = '${card(1)}'`), [a1]);

    // A request goes through the Career request (the candidate's queued run is
    // handed to the Career agent) and still records the mail it was made in.
    const careerRun = (n: number) => `70000000-0000-4000-8000-00000000000${n}`;
    const recommendation = (n: number) => `80000000-0000-4000-8000-00000000000${n}`;
    for (const n of [2, 3]) await db.exec(`
      insert into opportunity_discovery_run values ('${careerRun(n)}', '${talent(n)}', 'queued', '{}');
      insert into talent_opportunity_recommendation values ('${recommendation(n)}', '${talent(n)}', '{"preFinalDelivery": true}');
      update company_intro_candidates set delivery_run_id = '${careerRun(n)}', recommendation_id = '${recommendation(n)}'
        where id = '${card(n)}';`);
    const requested = (await db.query<any>(`select request_company_intro_for_career_with_presentation_v1(
      p_channel => 'email', p_company_appeal => 'Payments', p_company_user_id => $1, p_company_workspace_id => $2,
      p_intro_candidate_id => $3, p_intro_recipient_emails => array['b@example.com'], p_next_stage_id => null,
      p_source_message_id => null, p_presentation_id => $4) as result`,
      [memberB, workspace, card(2), b2])).rows[0].result;
    assert.equal(requested.status, "requested");
    const requestRow = (await db.query<any>(`select action, reason_text, channel, actor_user_id, presentation_id
      from company_decision_events where intro_candidate_id = '${card(2)}'`)).rows;
    assert.deepEqual(requestRow, [{ action: "request_intro", reason_text: "Payments", channel: "email",
      actor_user_id: memberB, presentation_id: b2 }]);
    const handoff = async (n: number) => (await db.query<any>(`select run.trigger_payload->>'runContract' as contract,
      rec.evidence ? 'preFinalDelivery' as pre_final from opportunity_discovery_run run, talent_opportunity_recommendation rec
      where run.id = $1 and rec.id = $2`, [careerRun(n), recommendation(n)])).rows[0];
    assert.deepEqual(await handoff(2), { contract: "career_agent_v1", pre_final: false });
    // Another person's mail as the hint is not kept: the request falls back to its own.
    await db.query(`select request_company_intro_for_career_with_presentation_v1(p_channel => 'email',
      p_company_appeal => 'Payments', p_company_user_id => $1, p_company_workspace_id => $2, p_intro_candidate_id => $3,
      p_intro_recipient_emails => array['a@example.com'], p_next_stage_id => null, p_presentation_id => $4)`,
      [memberA, workspace, card(3), a1]);
    const [ownFallback] = await pointer(`intro_candidate_id = '${card(3)}'`);
    assert.equal((await db.query<any>("select subject_id from company_presentations where id = $1", [ownFallback])).rows[0]
      .subject_id, talent(3));
    assert.deepEqual(await handoff(3), { contract: "career_agent_v1", pre_final: false });

    // A second call changes nothing.
    const again = (await db.query<any>(`select pass_company_intro_with_presentation_v1(p_channel => 'email',
      p_company_user_id => $1, p_company_workspace_id => $2, p_intro_candidate_id => $3, p_presentation_id => $4) as result`,
      [memberA, workspace, card(1), a1])).rows[0].result;
    assert.equal(again.status, "already_passed");
    assert.equal((await pointer(`intro_candidate_id = '${card(1)}'`)).length, 1);

    // Without one (v2, or the stage path of the connection buttons), an email
    // decision takes the decider's own mail; other channels are unchanged.
    await db.query("select pass_company_intro_v2($1, $2, $3, 'email')", [card(4), workspace, memberA]);
    assert.deepEqual(await pointer(`intro_candidate_id = '${card(4)}'`), [a4]);
    for (const [key, member, channel] of [["stage-a", memberA, "email"], ["stage-b", memberB, "email"], ["stage-web", memberB, "web"]]) {
      await db.query(`select record_company_decision_v1($1, $2, 'member_candidate', $3, 'stage_change', $4, $5, $6)`,
        [workspace, role, talent(5), channel, member, key]);
    }
    const stages = (await db.query<any>(`select event.idempotency_key, event.presentation_id, presentation.surface
      from company_decision_events event join company_presentations presentation on presentation.id = event.presentation_id
      where event.subject_id = '${talent(5)}' order by event.idempotency_key`)).rows;
    assert.deepEqual(stages.map((row) => [row.idempotency_key, row.surface]),
      [["stage-a", "email"], ["stage-b", "email"], ["stage-web", "inbox_card"]]);
    assert.equal(stages[0].presentation_id, a5);
    assert.equal(stages[1].presentation_id, b5);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    const pass = "pass_company_intro_with_presentation_v1(uuid,uuid,uuid,text,text,bigint,uuid)";
    const request = "request_company_intro_for_career_with_presentation_v1(uuid,uuid,uuid,uuid,text[],text,text,bigint,uuid)";
    for (const signature of [pass, request]) {
      assert.equal(await can(`has_function_privilege('service_role', '${signature}', 'EXECUTE')`), true);
      for (const user of ["anon", "authenticated"])
        assert.equal(await can(`has_function_privilege('${user}', '${signature}', 'EXECUTE')`), false);
    }
    // v2 is unchanged for its other callers.
    assert.equal(await can("has_function_privilege('service_role', 'pass_company_intro_v2(uuid,uuid,uuid,text,text,bigint)', 'EXECUTE')"), true);
  } finally { await db.close(); }
});
