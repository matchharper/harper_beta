import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pythonTimestamp, type Database, type Query } from "@/lib/career/matching/internalScoring/database";
import { resolveCompanyCapabilities } from "@/lib/org/agent/capabilities/resolver";
import { OrgAgentToolInputError } from "@/lib/org/agent/toolAvailability";
import { executeCompanyCorrespondence, type CompanyContactTransport } from "./companyTools";
import {
  scheduleReplyDestination,
  scheduleRunMessages,
  scheduleRunText,
  scheduleRunTools,
  scheduleThreadRecentText,
} from "./scheduleRun";

// A run woken by one of Harper's own schedules: its tools, its text, and where
// it may message the company. Slack is a fake here; nothing is sent.

test("a scheduled run may message the company where the work was asked unless the flag turns it off", () => {
  assert.equal(scheduleRunMessages({}), "origin");
  assert.equal(scheduleRunMessages({ ORG_AGENT_SCHEDULE_MESSAGES: " " }), "origin");
  assert.equal(scheduleRunMessages({ ORG_AGENT_SCHEDULE_MESSAGES: "on" }), "origin");
  assert.equal(scheduleRunMessages({ ORG_AGENT_SCHEDULE_MESSAGES: "origin" }), "origin");
  assert.equal(scheduleRunMessages({ ORG_AGENT_SCHEDULE_MESSAGES: " Chat " }), "chat");
  assert.equal(scheduleRunMessages({ ORG_AGENT_SCHEDULE_MESSAGES: "off" }), "off");
  // A typo turns it off rather than on.
  assert.equal(scheduleRunMessages({ ORG_AGENT_SCHEDULE_MESSAGES: "of" }), "off");
});

test("each tier is offered exactly the tools a scheduled run can complete", () => {
  // As the receiver runs it: Harper's own service principal, in full mode.
  const offered = (tools: ReadonlySet<string>) =>
    resolveCompanyCapabilities({ surface: "chat", mode: "full", loaded: new Set(), allowedToolNames: tools, agentService: true, harperInitiated: true }).offeredToolNames;
  for (const messages of ["off", "chat", "origin"] as const)
    for (const tier of [0, 1, 2]) {
      const tools = scheduleRunTools(tier, messages);
      // The run's surface is chat: everything allowed is really offered.
      assert.deepEqual([...offered(tools)].sort(), [...tools].sort(), `tier ${tier}, ${messages}`);
      assert.equal(tools.has("contact_user"), messages !== "off");
      // No member permission: no search, no scheduled selection, no Slack batch tool.
      for (const name of ["request_matching_search", "recommend_talents", "send_company_message"])
        assert.equal(tools.has(name), false, name);
      assert.equal(tools.has("contact_talent"), tier >= 2);
      assert.equal(tools.has("publish_role_recommendations"), tier >= 2);
      // Tier 2 reads this Role's existing correspondence first (read-only).
      assert.equal(tools.has("read_agent_messages"), tier >= 2);
      // Tier 1 proposes: a suggestion on the Role's To-do.
      assert.equal(tools.has("manage_todo_suggestions"), tier >= 1);
    }
  assert.deepEqual([...scheduleRunTools(1)].sort(), [...scheduleRunTools(0), "manage_todo_suggestions"].sort());
});

test("the run text keeps today's wording when off and names the destination when on", () => {
  const own = { effect_tier: 0, created_by: "agent" };
  assert.equal(
    scheduleRunText(own, null),
    "Effect tier 0 (Harper's own): look again and message the company only if useful; do not search, contact or publish."
  );
  const asked = { effect_tier: 2, created_by: "user" };
  assert.match(scheduleRunText(asked, null), /cannot start a new search/);
  assert.match(scheduleRunText(asked, null), /read this Role's existing correspondence with candidates' agents \(read_agent_messages\)/);
  assert.doesNotMatch(scheduleRunText(own, null), /read_agent_messages/);
  assert.doesNotMatch(scheduleRunText(asked, null), /you may search/);
  assert.match(scheduleRunText(own, { kind: "chat" }), /contact_user, one per run\) goes to this Role's web chat/);
  const thread = { kind: "slack", conversationId: "c", threadId: "t", threadRoleId: null, channelDbId: "d", slackChannelId: "C1" } as const;
  assert.match(scheduleRunText(asked, thread), /goes to the Slack thread where this was asked/);
  assert.match(scheduleRunText(asked, thread), /if one would help, ask the company/);
  assert.match(scheduleRunText({ effect_tier: 1, created_by: "agent" }, thread), /a suggestion on the Role's To-do, manage_todo_suggestions\) waits for the company's answer/);
  assert.match(scheduleRunText({ effect_tier: 1, created_by: "agent" }, null), /manage_todo_suggestions\) waits for the company's answer; do not search, contact or publish\.$/);
});

const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text, published_name text,
    is_reviewing boolean);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace,
    source_type text, status text, is_expired boolean, expires_at timestamptz);
  create table company_conversations(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, metadata jsonb, unique(company_workspace_id, role_id));
  create table company_slack_channels(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    slack_channel_id text, is_enabled boolean not null default true);
  create table company_slack_threads(id uuid primary key default gen_random_uuid(), channel_id uuid, role_id uuid,
    slack_thread_ts text);
  create table company_role_notification_channels(role_id uuid, channel_id uuid);
  create table company_messages(id bigint generated always as identity primary key, company_workspace_id uuid,
    conversation_id uuid, role_id uuid, company_user_id uuid, role text, content text, message_type text, status text,
    model text, metadata jsonb, slack_thread_id uuid);
  create table company_agent_web_action_jobs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    conversation_id uuid, role_id uuid, action_name text, action_context jsonb not null default '{}',
    status text not null default 'queued', locked_by text, created_at timestamptz not null default now());
  create table company_decision_events(id bigint generated always as identity primary key, company_workspace_id uuid,
    role_id uuid, subject_kind text, subject_id uuid, action text, detail jsonb, channel text, actor_user_id uuid,
    idempotency_key text, unique(role_id, idempotency_key));
  create table company_agent_schedules(id uuid primary key default gen_random_uuid(), company_workspace_id uuid not null,
    role_id uuid not null, title text not null, instruction text not null, target_refs jsonb not null default '{}',
    timezone text not null default 'Asia/Seoul', next_run_at timestamptz, recurrence text, interval_days numeric,
    status text not null default 'active', revision bigint not null default 1, directive_revision bigint not null default 1,
    source jsonb not null default '{}', operation_key text not null, last_job_id uuid,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now());
`;

const workspace = "20000000-0000-4000-8000-000000000001";
const role = "20000000-0000-4000-8000-000000000002";
const otherRole = "20000000-0000-4000-8000-000000000003";
const member = "20000000-0000-4000-8000-000000000004";

async function fixture(t: TestContext, mode?: string) {
  const previous = process.env.ORG_AGENT_SCHEDULE_MESSAGES;
  if (mode === undefined) delete process.env.ORG_AGENT_SCHEDULE_MESSAGES;
  else process.env.ORG_AGENT_SCHEDULE_MESSAGES = mode;
  t.after(() => {
    if (previous === undefined) delete process.env.ORG_AGENT_SCHEDULE_MESSAGES;
    else process.env.ORG_AGENT_SCHEDULE_MESSAGES = previous;
  });
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec("SET TIME ZONE 'UTC'");
  await pg.exec(SETUP);
  await pg.exec(
    await readFile(new URL("../../../supabase/migrations/20261105210000_company_agent_schedule_tiers.sql", import.meta.url), "utf8")
  );
  await pg.exec(`insert into company_workspace values ('${workspace}', 'Company', null, false);
    insert into company_roles values ('${role}', '${workspace}', 'internal', 'active', false, null),
      ('${otherRole}', '${workspace}', 'internal', 'active', false, null);`);
  const adapter = (connection: any): Query => async (sql, params = []) =>
    (await connection.query(sql, params, { parsers: { 1184: pythonTimestamp, 1700: Number, 20: Number } })).rows;
  const db: Database = { query: adapter(pg), transaction: (work) => pg.transaction((tx) => work(adapter(tx))) };
  const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params))[0];

  const [channel] = await db.query(
    "insert into company_slack_channels(company_workspace_id, slack_channel_id) values ($1, 'C1') returning id", [workspace]);
  const thread = async (roleId: string | null = null) =>
    one("insert into company_slack_threads(channel_id, role_id, slack_thread_ts) values ($1, $2, '1.0') returning id",
      [channel.id, roleId]);
  const [general] = await db.query(
    "insert into company_conversations(company_workspace_id, role_id, metadata) values ($1, null, '{}') returning id", [workspace]);
  /** A company member's message, in a Slack thread or in web chat. */
  const said = async (threadId: string | null) =>
    one(`insert into company_messages(company_workspace_id, conversation_id, company_user_id, role, content, message_type,
      status, metadata, slack_thread_id) values ($1, $2, $3, 'user', 'Check this again tomorrow', $4, 'completed', '{}', $5)
      returning id`, [workspace, general.id, member, threadId ? "slack" : "chat", threadId]);
  let seed = 0;
  const schedule = async (originMessageId?: number, tier = 0) =>
    one(`insert into company_agent_schedules(company_workspace_id, role_id, title, instruction, operation_key, created_by,
      effect_tier, target_refs) values ($1, $2, 'Check again', 'Look at the result', $3, 'user', $4, $5) returning *`,
      [workspace, role, `seed-${seed++}`, tier, JSON.stringify(originMessageId ? { originMessageId } : {})]);
  /** The schedule's running job. */
  const wake = async (row: Record<string, any>) => {
    const job = await one(`insert into company_agent_web_action_jobs(company_workspace_id, role_id, action_name, action_context,
      status, locked_by) values ($1, $2, 'agent_schedule_due', $3, 'processing', 'lease') returning id`,
      [workspace, role, JSON.stringify({ scheduleId: row.id, scheduleRevision: row.directive_revision })]);
    return { kind: "company_event", workspaceId: workspace, roleId: role, jobId: job.id, leaseOwner: "lease" } as const;
  };
  const checks: unknown[] = [];
  const deliveries: Array<{ batchId: string }> = [];
  let allowed = true;
  const transport: CompanyContactTransport = {
    audienceAllowed: async (args) => {
      checks.push(args);
      return allowed;
    },
    deliverBatch: async (args) => {
      // The real delivery checks the run is still current before the first send.
      await args.assertCanStart();
      deliveries.push({ batchId: args.batchId });
    },
  };
  const contact = (source: Awaited<ReturnType<typeof wake>>, input: Record<string, unknown>) =>
    executeCompanyCorrespondence(
      { source, name: "contact_user", input: { body: "Checked again: nothing new yet.", channel: "chat", ...input },
        sourceMessageId: 1, conversationId: general.id },
      db,
      transport
    ) as Promise<{ status: string; modelOutput: string }>;
  const messagesOf = (jobId: string) =>
    db.query("select * from company_messages where metadata->>'webActionJobId' = $1 order by id", [jobId]);
  return {
    db, channel, general, thread, said, schedule, wake, contact, messagesOf, checks, deliveries,
    deny: () => { allowed = false; },
  };
}

test("the reply destination is the Slack thread the work was asked in, while it can take this Role", async (t) => {
  const f = await fixture(t);
  const where = async (originMessageId?: number) =>
    scheduleReplyDestination(f.db.query, workspace, { role_id: role, target_refs: originMessageId ? { originMessageId } : {} });
  const workspaceThread = await f.thread();
  const fromSlack = await f.said(workspaceThread.id);
  assert.deepEqual(await where(fromSlack.id), { kind: "slack", conversationId: f.general.id, threadId: workspaceThread.id,
    threadRoleId: null, channelDbId: f.channel.id, slackChannelId: "C1" });
  // Older rows without the stored origin use their source message.
  assert.equal((await scheduleReplyDestination(f.db.query, workspace,
    { role_id: role, target_refs: {}, source: { kind: "company", messageId: fromSlack.id } })).kind, "slack");

  // Web chat, no origin, another Role's thread, a Role that turned this channel off,
  // a disabled channel: the Role's web chat.
  assert.deepEqual(await where((await f.said(null)).id), { kind: "chat" });
  assert.deepEqual(await where(), { kind: "chat" });
  assert.equal((await where((await f.said((await f.thread(otherRole)).id)).id)).kind, "chat");
  await f.db.query("insert into company_role_notification_channels values ($1, $2)", [role, f.channel.id]);
  assert.equal((await where(fromSlack.id)).kind, "chat");
  await f.db.query("delete from company_role_notification_channels");
  await f.db.query("update company_slack_channels set is_enabled = false");
  assert.equal((await where(fromSlack.id)).kind, "chat");
});

test("with messaging off a scheduled run cannot message the company", async (t) => {
  const f = await fixture(t, "off");
  const run = await f.wake(await f.schedule((await f.said((await f.thread()).id)).id));
  await assert.rejects(f.contact(run, {}), (error) => error instanceof OrgAgentToolInputError);
  assert.equal((await f.messagesOf(run.jobId)).length, 0);
  assert.equal(f.checks.length + f.deliveries.length, 0);
});

test("origin mode replies once in the Slack thread the work was asked in", async (t) => {
  const f = await fixture(t, "origin");
  const threadRow = await f.thread();
  const run = await f.wake(await f.schedule((await f.said(threadRow.id)).id));
  // The model's channel does not choose the place; email is refused.
  await assert.rejects(f.contact(run, { channel: "email" }), (error) => error instanceof OrgAgentToolInputError);
  const sent = await f.contact(run, { channel: "chat" });
  assert.equal(sent.status, "sent");
  assert.match(sent.modelOutput, /Slack thread where this schedule was asked; the company can answer there/);
  assert.deepEqual(f.checks, [{ workspaceId: workspace, roleId: role, channelId: "C1" }]);
  const [message] = await f.messagesOf(run.jobId);
  // In the thread's own conversation, so the thread history has it; checked for this Role.
  assert.equal(message.conversation_id, f.general.id);
  assert.equal(message.message_type, "slack");
  assert.equal(message.role_id, null);
  assert.equal(message.metadata.companyMessageBatch.threadRef, threadRow.id);
  assert.equal(message.metadata.companyMessageBatch.audienceRoleId, role);
  assert.equal(message.metadata.companyMessageBatch.channelDbId, f.channel.id);
  assert.deepEqual(f.deliveries, [{ batchId: message.metadata.companyMessageBatch.batchId }]);

  // A second message in the same run sends nothing new and says so.
  const again = await f.contact(run, { channel: "slack", body: "Another note" });
  assert.match(again.modelOutput, /already sent this message; nothing new was sent:\nChecked again: nothing new yet\./);
  assert.equal((await f.messagesOf(run.jobId)).length, 1);
});

test("origin mode falls back to the Role's web chat when the thread cannot take this Role", async (t) => {
  const f = await fixture(t, "origin");
  f.deny();
  const run = await f.wake(await f.schedule((await f.said((await f.thread()).id)).id));
  const saved = await f.contact(run, { channel: "slack" });
  assert.equal(saved.status, "saved");
  assert.match(saved.modelOutput, /saved in the company's Role chat\. The Slack thread where this schedule was asked can no longer take/);
  const [message] = await f.messagesOf(run.jobId);
  const roleChat = (await f.db.query("select id from company_conversations where role_id = $1", [role]))[0];
  assert.equal(message.conversation_id, roleChat.id);
  assert.equal(message.message_type, "chat");
  assert.equal(message.role_id, role);
  assert.equal(message.metadata.companyMessageBatch, undefined);
  assert.equal(f.deliveries.length, 0);
});

test("chat mode and web-chat schedules save the message in the Role's web chat", async (t) => {
  for (const [mode, fromSlack] of [["chat", true], ["origin", false]] as const) {
    const f = await fixture(t, mode);
    const origin = await f.said(fromSlack ? (await f.thread()).id : null);
    const run = await f.wake(await f.schedule(origin.id));
    const saved = await f.contact(run, { channel: "slack" });
    assert.equal(saved.modelOutput.includes("can no longer take"), false);
    assert.match(saved.modelOutput, /saved in the company's Role chat\. The company can answer there\./);
    const [message] = await f.messagesOf(run.jobId);
    assert.equal(message.message_type, "chat");
    assert.equal(message.role_id, role);
    assert.equal(f.checks.length + f.deliveries.length, 0, mode);
  }
});

test("the next run reads the latest messages of the Slack thread it replies in", async (t) => {
  const f = await fixture(t, "origin");
  const threadRow = await f.thread();
  const origin = await f.said(threadRow.id);
  const destination = await scheduleReplyDestination(f.db.query, workspace, await f.schedule(origin.id));
  // An earlier run's delivered message and the company's answer, both in the general thread.
  await f.db.query(`insert into company_messages(company_workspace_id, conversation_id, role, content, message_type, status,
    metadata, slack_thread_id) values ($1, $2, 'assistant', 'Checked again: nothing new yet.', 'slack', 'completed', '{}', $3),
    ($1, $2, 'user', 'Thanks, look again Friday', 'slack', 'completed', '{}', $3),
    ($1, $2, 'user', 'Another thread', 'slack', 'completed', '{}', null)`, [workspace, f.general.id, threadRow.id]);
  const text = await scheduleThreadRecentText(f.db.query, workspace, destination);
  assert.equal(text, "\nLatest messages in that Slack thread (oldest first):\nCompany: Check this again tomorrow\n"
    + "Harper: Checked again: nothing new yet.\nCompany: Thanks, look again Friday");
  assert.equal(await scheduleThreadRecentText(f.db.query, workspace, { kind: "chat" }), "");
  assert.equal(await scheduleThreadRecentText(f.db.query, workspace, null), "");
});
