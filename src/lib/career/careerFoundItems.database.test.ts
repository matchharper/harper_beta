import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20261105070000_career_found_items.sql",
    import.meta.url
  ),
  "utf8"
);
const ownListFix = readFileSync(
  new URL(
    "../../../supabase/migrations/20261105090000_career_found_items_own_list.sql",
    import.meta.url
  ),
  "utf8"
);
const signupKind = readFileSync(
  new URL(
    "../../../supabase/migrations/20261105120000_career_content_signup_kind.sql",
    import.meta.url
  ),
  "utf8"
);
const dailyProcessing = readFileSync(
  new URL(
    "../../../supabase/migrations/20261104153622_career_daily_processing.sql",
    import.meta.url
  ),
  "utf8"
);
const openedCheckIn = readFileSync(
  new URL(
    "../../../supabase/migrations/20261105130000_career_content_opened_check_in.sql",
    import.meta.url
  ),
  "utf8"
);
/** The daily sources table and its writer, as the daily batch migration creates them. */
function dailySourcesSql() {
  const table = dailyProcessing.indexOf("create table public.career_daily_sources");
  const writer = dailyProcessing.indexOf("create function public.record_career_daily_source");
  return [
    dailyProcessing.slice(table, dailyProcessing.indexOf("\n);", table) + 3),
    dailyProcessing.slice(writer, dailyProcessing.indexOf("$$;", writer) + 3),
  ].join("\n");
}
// The guard as it runs in production before ownListFix (not in this repo's migrations).
const productionIsolationGuard = `
  create function enforce_user_submitted_role_recommendation_isolation_v1() returns trigger
  language plpgsql security definer set search_path to 'public' as $function$
  begin
    if coalesce(new.kind, '') <> 'user_link_import'
       and exists (select 1 from public.company_roles role
         where role.role_id = new.role_id and role.source_provider = 'user_submitted') then
      raise exception using errcode = '23514',
        message = 'user-submitted roles can only be added through an explicit user link import';
    end if;
    return new;
  end;
  $function$;
  create trigger enforce_user_submitted_role_recommendation_isolation_v1
    before insert or update on talent_opportunity_recommendation
    for each row execute function enforce_user_submitted_role_recommendation_isolation_v1();
`;
const talent = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const conversation = "00000000-0000-4000-8000-000000000003";
const role = (url: string, extra: Record<string, unknown> = {}) => ({
  canonicalUrl: url,
  roleUrlVariants: [url],
  userSubmittedSourceJobId: `url:${url}`,
  title: "GTM Lead",
  companyName: "Fixture Company",
  provider: "other",
  ...extra,
});

async function database(immediate = false) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql
      as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table talent_users (user_id uuid primary key);
    create table talent_conversations (id uuid primary key, user_id uuid);
    create table company_workspace (
      company_workspace_id uuid primary key default gen_random_uuid(), company_name text,
      published_name text, company_db_id integer, career_url text, logo_url text,
      company_description text, external_roles_enabled boolean, has_career_page boolean,
      is_internal boolean, is_scrape_original boolean, created_at timestamptz, updated_at timestamptz
    );
    create table company_roles (
      role_id uuid primary key default gen_random_uuid(), company_workspace_id uuid, name text,
      description text, external_jd_url text, information jsonb, is_expired boolean,
      expires_at timestamptz, location_text text, salary_range text, source_job_id text,
      source_provider text, source_type text, status text, summary jsonb, type text[],
      work_mode text, created_at timestamptz, updated_at timestamptz
    );
    create table talent_opportunity_recommendation (
      id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid, kind text,
      opportunity_type text, saved_stage text, feedback text, feedback_at timestamptz,
      feedback_reason text, dismissed_at timestamptz, evidence jsonb, fit_reasons jsonb,
      fit_summary text, preference_fit jsonb, tradeoffs jsonb, recommended_at timestamptz,
      created_at timestamptz, updated_at timestamptz
    );
    -- Only referenced by the list writer this migration also replaces.
    create table talent_matching_operations (talent_id uuid, operation_id text, command jsonb, result jsonb, created_at timestamptz);
    insert into talent_users values ('${talent}'), ('${other}');
    insert into talent_conversations values ('${conversation}', '${talent}');
  `);
  await db.exec(migration);
  await db.exec(signupKind);
  if (immediate) {
    const matchingMigration = readFileSync(new URL(
      "../../../supabase/migrations/20261029183004_career_matching_workspaces.sql", import.meta.url), "utf8");
    await db.exec(`
      create table talent_setting(user_id uuid, blocked_companies text[]);
      alter table talent_opportunity_recommendation add column score numeric,
        add column external_experiment_run_id uuid, add column rank integer;
      create table external_recommendation_runs(
        id uuid primary key default gen_random_uuid(),talent_id uuid,experiment text,variant text,
        surface text,status text,operation_id text,locale text,request jsonb,
        lease_token uuid,evaluation_ids uuid[] default '{}',input_snapshot jsonb,
        context_ready_at timestamptz,unique(talent_id,operation_id)
      );
      create table talent_external_evaluations(
        id uuid primary key default gen_random_uuid(),talent_id uuid,role_id uuid,assessment jsonb
      );
      create table talent_opportunity_memberships(
        id uuid primary key default gen_random_uuid(),talent_id uuid,recommendation_id uuid,
        role_id uuid,archived_at timestamptz,matching_id uuid,explanation text,rank integer
      );
      create unique index membership_identity on talent_opportunity_memberships
        (talent_id,coalesce(matching_id,'00000000-0000-0000-0000-000000000000'::uuid),recommendation_id);
    `);
    await db.exec(matchingMigration.slice(
      matchingMigration.indexOf("create function public.ensure_career_opportunity_membership()"),
      matchingMigration.indexOf("\ninsert into public.talent_opportunity_memberships", matchingMigration.indexOf("create trigger career_opportunity_membership_after_insert"))));
    await db.exec(productionIsolationGuard);
    await db.exec(ownListFix);
    await db.exec(readFileSync(new URL(
      "../../../supabase/migrations/20261111082523_career_suggest_immediate_recommendation.sql", import.meta.url), "utf8"));
  }
  return db;
}

async function importLink(
  db: PGlite,
  args: { talentId?: string; stage: string | null; role: Record<string, unknown> }
) {
  const { rows } = await db.query<Record<string, any>>(
    "select * from import_talent_job_link($1,$2,null,null,$3,'{}'::jsonb,true)",
    [args.talentId ?? talent, args.stage, JSON.stringify(args.role)]
  );
  return rows[0];
}

async function content(
  db: PGlite,
  operation: string,
  options: { id?: string; item?: unknown; origin?: string; owner?: string } = {}
) {
  const { rows } = await db.query<{ result: any }>(
    "select manage_career_content_suggestion($1,$2,$3,$4,$5,$6,null) as result",
    [
      options.owner ?? talent,
      operation,
      options.id ?? null,
      options.item === undefined ? null : JSON.stringify(options.item),
      options.origin ?? null,
      options.owner && options.owner !== talent ? null : conversation,
    ]
  );
  return rows[0].result;
}

test("a web posting Harper found is copied for this talent only, without a card", async () => {
  const db = await database();
  try {
    const url = "https://example.com/jobs/gtm";
    const first = await importLink(db, { stage: null, role: role(url) });
    assert.equal(first.recommendation_id, null);
    assert.equal(first.created_recommendation, false);
    assert.equal(first.saved_stage, null);
    const cards = await db.query("select * from talent_opportunity_recommendation");
    assert.equal(cards.rows.length, 0);

    const copied = await db.query<{ information: any; expires_at: string | null; source_provider: string }>(
      "select information, expires_at, source_provider from company_roles where role_id=$1",
      [first.role_id]
    );
    assert.equal(copied.rows[0].source_provider, "user_submitted");
    assert.deepEqual(copied.rows[0].information.submittedTalentIds, [talent]);
    assert.equal(copied.rows[0].expires_at, null, "a checkable job page has no date rule");

    const again = await importLink(db, { talentId: other, stage: null, role: role(url) });
    assert.equal(again.role_id, first.role_id, "the same link reuses one copy");
    const shared = await db.query<{ information: any }>(
      "select information from company_roles where role_id=$1",
      [first.role_id]
    );
    assert.deepEqual(shared.rows[0].information.submittedTalentIds, [talent, other]);

    // "저장해 줘" still creates the card in Saved right away.
    const saved = await importLink(db, { stage: "saved", role: role(url) });
    assert.ok(saved.recommendation_id);
    assert.equal(saved.saved_stage, "saved");
    const repeat = await importLink(db, { stage: null, role: role(url) });
    assert.equal(repeat.recommendation_id, saved.recommendation_id, "an existing card is reported, not duplicated");
  } finally {
    await db.close();
  }
});

test("a found posting can be published only to the New opportunities of the talent who found it", async () => {
  const db = await database();
  try {
    await db.exec(productionIsolationGuard);
    const found = await importLink(db, { stage: null, role: role("https://example.com/jobs/ml") });
    const publish = (talentId: string, kind = "career_agent") =>
      db.query(
        "insert into talent_opportunity_recommendation(talent_id, role_id, kind, opportunity_type) values ($1, $2, $3, 'external_jd')",
        [talentId, found.role_id, kind]
      );
    await assert.rejects(publish(talent), /explicit user link import/, "the production guard blocks Harper's own card");

    await db.exec(ownListFix);
    await publish(talent);
    await assert.rejects(publish(other), /explicit user link import/, "a talent who did not find it stays blocked");
    await assert.rejects(publish(talent, "external_recommendation"), /explicit user link import/, "ordinary recommendation paths stay blocked");
    const cards = await db.query<{ talent_id: string; kind: string }>(
      "select talent_id, kind from talent_opportunity_recommendation"
    );
    assert.deepEqual(cards.rows, [{ talent_id: talent, kind: "career_agent" }]);
  } finally {
    await db.close();
  }
});

test("hiring posts and LinkedIn finds end 30 days after posting", async () => {
  const db = await database();
  try {
    const postedAt = "2026-11-01T00:00:00.000Z";
    const post = await importLink(db, {
      stage: null,
      role: role("https://www.linkedin.com/posts/founder_hiring-gtm", {
        provider: "linkedin",
        hiringPost: { contactMethod: "message", posterName: "Founder", postedAt },
      }),
    });
    const row = await db.query<{ information: any; expires_at: Date }>(
      "select information, expires_at from company_roles where role_id=$1",
      [post.role_id]
    );
    assert.equal(row.rows[0].information.hiringPost.contactMethod, "message");
    assert.equal(
      new Date(row.rows[0].expires_at).toISOString(),
      "2026-12-01T00:00:00.000Z"
    );

    const linkedinJob = await importLink(db, {
      stage: null,
      role: role("https://www.linkedin.com/jobs/view/123", { provider: "linkedin" }),
    });
    const job = await db.query<{ days: number }>(
      "select round(extract(epoch from expires_at - now()) / 86400) as days from company_roles where role_id=$1",
      [linkedinJob.role_id]
    );
    assert.equal(Number(job.rows[0].days), 30);

    // A deadline the post states ends it sooner than 30 days.
    const early = await importLink(db, {
      stage: null,
      role: role("https://www.linkedin.com/posts/founder_hiring-sales", {
        provider: "linkedin",
        hiringPost: { contactMethod: "email", postedAt },
        deadline: "2026-11-10T14:59:59.000Z",
      }),
    });
    const earlyRow = await db.query<{ expires_at: Date }>(
      "select expires_at from company_roles where role_id=$1",
      [early.role_id]
    );
    assert.equal(new Date(earlyRow.rows[0].expires_at).toISOString(), "2026-11-10T14:59:59.000Z");
    // A stated deadline also applies to an ordinary posting the user saves.
    const saved = await importLink(db, {
      stage: "saved",
      role: role("https://example.com/jobs/deadline", { deadline: "2026-12-24T14:59:59.000Z" }),
    });
    const savedRow = await db.query<{ expires_at: Date }>(
      "select expires_at from company_roles where role_id=$1",
      [saved.role_id]
    );
    assert.equal(new Date(savedRow.rows[0].expires_at).toISOString(), "2026-12-24T14:59:59.000Z");

    await assert.rejects(
      importLink(db, { stage: "saved", role: role("https://example.com/x", { hiringPost: "text" }) }),
      /invalid_import_payload/
    );
  } finally {
    await db.close();
  }
});

test("content suggestions keep one entry per link and move forward only", async () => {
  const db = await database();
  try {
    const start = new Date(Date.now() + 3 * 86400_000).toISOString();
    const event = {
      kind: "event",
      url: "https://lu.ma/ai-forum",
      title: "AI 포럼",
      reason: "AI GTM 관심과 맞아요",
      startsAt: start,
    };
    await assert.rejects(
      content(db, "add", { item: { ...event, startsAt: undefined }, origin: "user_request" }),
      /Event date required/
    );
    await assert.rejects(
      content(db, "add", {
        item: { ...event, startsAt: "2020-01-01T00:00:00Z" },
        origin: "user_request",
      }),
      /Event already ended/
    );
    await assert.rejects(
      content(db, "add", { item: event, origin: "made_up" }),
      /Invalid content suggestion/
    );
    const saved = await content(db, "add", { item: event, origin: "user_request" });
    assert.equal(saved.status, "saved");
    assert.equal(
      new Date(saved.item.expires_at).getTime(),
      new Date(start).getTime() + 86400_000,
      "an event without an end time ends a day after it starts"
    );
    const duplicate = await content(db, "add", { item: event, origin: "harper_offer" });
    assert.equal(duplicate.status, "already_saved");
    assert.equal(duplicate.id, saved.id);

    const article = await content(db, "add", {
      item: { kind: "article", url: "https://example.com/post", title: "글", reason: "이유" },
      origin: "harper_background",
    });
    const days = (new Date(article.item.expires_at).getTime() - Date.now()) / 86400_000;
    assert.ok(days > 29.9 && days <= 30, String(days));

    const soon = new Date(Date.now() + 5 * 86400_000).toISOString();
    const program = await content(db, "add", {
      item: { kind: "post", url: "https://example.com/fellowship", title: "펠로십 모집", reason: "이유", deadline: soon },
      origin: "user_request",
    });
    assert.equal(new Date(program.item.expires_at).toISOString(), soon, "a stated deadline before 30 days wins");
    const later = await content(db, "add", {
      item: { kind: "article", url: "https://example.com/later", title: "글", reason: "이유",
        deadline: new Date(Date.now() + 90 * 86400_000).toISOString() },
      origin: "user_request",
    });
    const laterDays = (new Date(later.item.expires_at).getTime() - Date.now()) / 86400_000;
    assert.ok(laterDays <= 30, "30 days still applies when the stated deadline is later");
    await assert.rejects(
      content(db, "add", {
        item: { kind: "post", url: "https://example.com/closed", title: "글", reason: "이유", deadline: "2020-01-01T00:00:00Z" },
        origin: "user_request",
      }),
      /Deadline passed/
    );

    const react = (reaction: string) =>
      content(db, "react", { id: saved.id, item: { reaction } });
    assert.equal((await react("opened")).status, "opened");
    assert.equal((await react("seen")).status, "opened", "seen never moves back from opened");
    assert.equal((await react("dismissed")).status, "dismissed");
    assert.equal((await react("opened")).status, "dismissed", "dismissed is final");
    const again = await content(db, "add", { item: event, origin: "user_request" });
    assert.equal(again.status, "already_saved", "a dismissed link is not shown again");
    assert.equal(again.item.status, "dismissed");

    assert.equal((await content(db, "remove", { id: article.id })).status, "removed");
    assert.equal(
      (await content(db, "react", { id: saved.id, owner: other, item: { reaction: "seen" } })).status,
      "not_found",
      "another talent cannot touch the item"
    );
    await assert.rejects(
      content(db, "expire", { id: saved.id }),
      /Unknown operation/
    );
  } finally {
    await db.close();
  }
});

test("a sign-up ends at the deadline it states, and signing up is not a status", async () => {
  const db = await database();
  try {
    // A coffee chat or program is a sign-up: it ends at the deadline it states.
    const deadline = new Date(Date.now() + 9 * 86400_000).toISOString();
    const chat = await content(db, "add", {
      item: { kind: "signup", url: "https://example.com/coffee-chat", title: "PM 커피챗", reason: "이유", deadline },
      origin: "harper_offer",
    });
    assert.equal(chat.status, "saved");
    assert.equal(new Date(chat.item.deadline).toISOString(), deadline);
    assert.equal(new Date(chat.item.expires_at).toISOString(), deadline);
    await assert.rejects(
      content(db, "add", { item: { kind: "webinar", url: "https://example.com/w", title: "t", reason: "r" }, origin: "user_request" }),
      /Invalid content suggestion/
    );
    // A sign-up moves to the user's schedule; this list only keeps or drops it.
    await assert.rejects(
      content(db, "react", { id: chat.id, item: { reaction: "registered" } }),
      /Unknown reaction/
    );
    await assert.rejects(
      db.query("update career_content_suggestions set status = 'registered' where id = $1", [chat.id]),
      /career_content_suggestions_status_check/
    );
    assert.equal((await content(db, "remove", { id: chat.id })).status, "removed");
  } finally {
    await db.close();
  }
});

test("talents read only their own suggestions and cannot call the writer", async () => {
  const db = await database();
  try {
    await content(db, "add", {
      item: { kind: "post", url: "https://www.linkedin.com/posts/a", title: "글", reason: "이유" },
      origin: "user_request",
    });
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${other}', false);`);
    const visible = await db.query("select * from career_content_suggestions");
    assert.equal(visible.rows.length, 0);
    await db.exec(`select set_config('request.jwt.claim.sub', '${talent}', false);`);
    const own = await db.query("select * from career_content_suggestions");
    assert.equal(own.rows.length, 1);
    await assert.rejects(
      db.query("select manage_career_content_suggestion($1,'remove',$2)", [talent, (own.rows[0] as any).id]),
      /permission denied/
    );
  } finally {
    await db.close();
  }
});

test("opening an event or sign-up asks once at the next morning's daily batch", async () => {
  const db = await database();
  try {
    // Only what the daily source check reads on this path.
    await db.exec(`
      alter table talent_users add column deleted_at timestamptz;
      create table opportunity_discovery_run (id uuid primary key);
      create table talent_progress (id uuid, recommendation_id uuid, kind text, metadata jsonb);
      create table company_talent_followups (id uuid);
      ${dailySourcesSql()}
    `);
    await db.exec(openedCheckIn);
    const add = (item: Record<string, unknown>) =>
      content(db, "add", { item, origin: "user_request" });
    const react = (id: string, reaction: string) =>
      content(db, "react", { id, item: { reaction } });
    const sourceFor = async (id: string) =>
      (await db.query<Record<string, any>>(
        "select * from career_daily_sources where source_id = $1", [id]
      )).rows;
    const current = async (id: string, at = new Date()) =>
      (await db.query<{ ok: boolean }>(
        "select career_daily_source_current($1, $2, $3) as ok", [id, talent, at.toISOString()]
      )).rows[0].ok;

    const event = await add({
      kind: "event", url: "https://lu.ma/pytorch-seoul", title: "PyTorch 서울 밋업", reason: "이유",
      startsAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
    });
    const article = await add({ kind: "article", url: "https://example.com/read", title: "글", reason: "이유" });
    await react(event.id, "opened");
    await react(event.id, "opened");
    await react(article.id, "opened");
    assert.equal((await sourceFor(article.id)).length, 0, "articles are not asked about");
    const [source, ...again] = await sourceFor(event.id);
    assert.equal(again.length, 0, "opening the link again does not ask twice");
    assert.equal(source.source_kind, "content_opened");
    const tomorrow = new Date(Date.now() + 9 * 3600_000 + 86400_000).toISOString().slice(0, 10);
    assert.equal(
      new Date(source.available_at).toISOString(),
      new Date(`${tomorrow}T09:00:00+09:00`).toISOString(),
      "the question waits for the next morning"
    );
    assert.match(source.event.summary, /PyTorch 서울 밋업/);
    assert.match(source.event.summary, /manage_action_items/);
    assert.equal(await current(source.id), true);
    await react(event.id, "dismissed");
    assert.equal(await current(source.id), false, "closed before then: not asked");

    const chat = await add({ kind: "signup", url: "https://example.com/coffee", title: "PM 커피챗", reason: "이유" });
    await react(chat.id, "opened");
    const [chatSource] = await sourceFor(chat.id);
    assert.equal(await current(chatSource.id), true);
    await content(db, "remove", { id: chat.id });
    assert.equal(await current(chatSource.id), false, "already moved to the schedule: not asked");

    const tonight = await add({
      kind: "event", url: "https://lu.ma/tonight", title: "오늘 밤 밋업", reason: "이유",
      startsAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await react(tonight.id, "opened");
    const [tonightSource] = await sourceFor(tonight.id);
    assert.equal(
      await current(tonightSource.id, new Date(Date.now() + 2 * 3600_000)),
      false,
      "already started by the morning: not asked"
    );
  } finally {
    await db.close();
  }
});


test("suggest publishes the card and durable scoring together, preserving decisions on repeat imports", async () => {
  const db = await database(true);
  try {
    const posting = role("https://example.com/jobs/immediate");
    const first = await importLink(db, { stage: null, role: posting });
    assert.ok(first.recommendation_id);
    assert.equal(first.created_recommendation, true);
    const { rows: cards } = await db.query<any>("select * from talent_opportunity_recommendation");
    assert.equal(cards[0].kind, "career_agent");
    assert.equal(cards[0].saved_stage, null);
    assert.equal(cards[0].feedback, null);
    const { rows: members } = await db.query<any>("select * from talent_opportunity_memberships");
    assert.equal(members.length, 1);
    assert.equal(members[0].archived_at, null);
    const { rows: runs } = await db.query<any>("select * from external_recommendation_runs");
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, "queued");
    assert.equal(runs[0].input_snapshot, null, "context preparation belongs to the consumer");
    assert.deepEqual(runs[0].request.roleIds, [first.role_id]);
    assert.equal(runs[0].request.recommendationId, first.recommendation_id);
    assert.equal(cards[0].external_experiment_run_id, runs[0].id);
    for (const stage of ["saved", "applied", "hidden"]) {
      await db.query("update talent_opportunity_recommendation set saved_stage=$1,feedback='dislike'", [stage]);
      await db.exec("update talent_opportunity_memberships set archived_at=now()");
      const again = await importLink(db, { stage: null, role: posting });
      assert.equal(again.recommendation_id, first.recommendation_id);
      assert.equal(again.saved_stage, stage);
      assert.equal(again.created_recommendation, false);
      const { rows: [row] } = await db.query<any>("select feedback from talent_opportunity_recommendation");
      assert.equal(row.feedback, "dislike");
    }
    assert.equal((await db.query("select * from external_recommendation_runs")).rows.length, 1);
    assert.ok((await db.query<any>("select archived_at from talent_opportunity_memberships")).rows[0].archived_at);
    const saved = await importLink(db, { stage: "saved", role: role("https://example.com/jobs/user-save") });
    assert.equal(saved.saved_stage, "saved");
    assert.equal((await db.query("select * from external_recommendation_runs")).rows.length, 1);
    await assert.rejects(db.query(
      "insert into talent_opportunity_recommendation(talent_id,role_id,kind) values ($1,$2,'career_agent')",
      [other,first.role_id]), /explicit user link import/);
  } finally { await db.close(); }
});

test("scoring enriches the exact published card without changing its later progress or membership", async () => {
  const db = await database(true);
  try {
    const saved = await importLink(db, { stage: null, role: role("https://example.com/jobs/scored") });
    const { rows: [run] } = await db.query<any>("select * from external_recommendation_runs");
    const { rows: [evaluation] } = await db.query<any>(
      "insert into talent_external_evaluations(talent_id,role_id,assessment) values ($1,$2,$3) returning id",
      [talent,saved.role_id,JSON.stringify({fit:{mutualFit:31}})]);
    await db.query("update external_recommendation_runs set evaluation_ids=$1,lease_token=$2,status='completed' where id=$3",
      [[evaluation.id],conversation,run.id]);
    await db.exec("update talent_opportunity_recommendation set saved_stage='applied',feedback='like'; update talent_opportunity_memberships set archived_at=now()");
    await db.query("select attach_career_import_evaluation($1,$2)", [run.id,other]);
    assert.equal((await db.query<any>("select score from talent_opportunity_recommendation")).rows[0].score, null);
    await db.query("select attach_career_import_evaluation($1,$2)", [run.id,conversation]);
    await db.query("select attach_career_import_evaluation($1,$2)", [run.id,conversation]);
    const { rows: [card] } = await db.query<any>("select * from talent_opportunity_recommendation");
    assert.equal(Number(card.score),31, "a low score is evidence, not permission to unpublish");
    assert.equal(card.evidence.evaluationId,evaluation.id);
    assert.equal(card.saved_stage,"applied");
    assert.equal(card.feedback,"like");
    assert.ok((await db.query<any>("select archived_at from talent_opportunity_memberships")).rows[0].archived_at);
  } finally { await db.close(); }
});

test("suggest rejects unavailable roles and rolls back publication if durable scoring cannot be stored", async () => {
  const db = await database(true);
  try {
    const expired = role("https://example.com/jobs/expired", {deadline:"2000-01-01T00:00:00Z"});
    await assert.rejects(importLink(db,{stage:null,role:expired}),/Role is unavailable/);
    assert.equal((await db.query("select * from company_roles")).rows.length,0);
    await db.exec("alter table external_recommendation_runs add constraint simulate_storage_failure check (false)");
    await assert.rejects(importLink(db,{stage:null,role:role("https://example.com/jobs/atomic")}),/simulate_storage_failure/);
    assert.equal((await db.query("select * from talent_opportunity_recommendation")).rows.length,0);
    assert.equal((await db.query("select * from talent_opportunity_memberships")).rows.length,0);
    assert.equal((await db.query("select * from company_roles")).rows.length,0);
  } finally { await db.close(); }
});
