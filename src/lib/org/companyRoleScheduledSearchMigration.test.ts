import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { nextScheduledSearchAt } from "./introSearchSchedule";

// company_role_scheduled_search_v1 uses the worker's rule for the scheduled
// company search. The slot-type and email helpers are stubbed from a table so
// each case can set them; the Slack checks use real tables.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table public.company_roles(role_id uuid primary key, company_workspace_id uuid, source_type text,
    status text, is_expired boolean, expires_at timestamptz, information jsonb default '{}');
  create table public.company_internal_roles(role_id uuid primary key, request text, is_company_first_search boolean,
    intro_search_date text[], intro_search_time smallint);
  create table public.company_slack_integrations(company_workspace_id uuid, slack_team_id text, status text,
    bot_token_ciphertext text);
  create table public.company_slack_channels(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    slack_team_id text, is_enabled boolean);
  create table public.company_role_notification_channels(role_id uuid, channel_id uuid);
  create table public.test_role_facts(role_id uuid primary key, slot_type text, email_enabled boolean, recipients int);
  create function public.role_matching_slot_type_v1(p_role_id uuid, p_at timestamptz default now())
  returns text language sql stable as $$
    select coalesce((select slot_type from public.test_role_facts where role_id = p_role_id), 'unavailable') $$;
  create function public.company_role_candidate_email_enabled_v1(p_role_id uuid)
  returns boolean language sql stable as $$
    select coalesce((select email_enabled from public.test_role_facts where role_id = p_role_id), false) $$;
  create function public.company_role_email_recipients_v1(p_role_id uuid)
  returns table(user_id uuid) language sql stable as $$
    select gen_random_uuid() from public.test_role_facts, generate_series(1, recipients) where role_id = p_role_id $$;
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const otherWorkspace = "10000000-0000-4000-8000-000000000002";
const roleId = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Case = {
  name: string;
  role?: Partial<{ status: string; is_expired: boolean; expires_at: string | null; information: object; workspace: string }>;
  internal?: Partial<{ request: string | null; is_company_first_search: boolean; intro_search_date: string[] | null;
    intro_search_time: number | null }>;
  facts?: Partial<{ slot_type: string; email_enabled: boolean; recipients: number }>;
  eligible: boolean;
};

const CASES: Case[] = [
  { name: "free slot with a Slack channel", eligible: true },
  { name: "paid slot", facts: { slot_type: "paid" }, eligible: true },
  { name: "no slot", facts: { slot_type: "unavailable" }, eligible: false },
  { name: "no delivery channel", role: { workspace: otherWorkspace }, eligible: false },
  { name: "email instead of Slack", role: { workspace: otherWorkspace },
    facts: { email_enabled: true, recipients: 1 }, eligible: true },
  { name: "email on, nobody to send to", role: { workspace: otherWorkspace },
    facts: { email_enabled: true, recipients: 0 }, eligible: false },
  { name: "paused", role: { status: "paused" }, eligible: false },
  // The web used to accept these two; the worker does not schedule them.
  { name: "top_priority", role: { status: "top_priority" }, eligible: false },
  { name: "open", role: { status: "open" }, eligible: false },
  { name: "expired flag", role: { is_expired: true }, eligible: false },
  { name: "past expiry", role: { expires_at: "2000-01-01T00:00:00Z" }, eligible: false },
  { name: "test-only", role: { information: { testOnly: "true" } }, eligible: false },
  { name: "empty request", internal: { request: "  " }, eligible: false },
  { name: "automatic search off", internal: { is_company_first_search: false }, eligible: false },
];

test("scheduled search eligibility follows the worker's rule", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_slack_integrations values ('${workspace}', 'T1', 'active', 'cipher');
      insert into company_slack_channels(company_workspace_id, slack_team_id, is_enabled) values ('${workspace}', 'T1', true);
    `);
    for (const [index, item] of CASES.entries()) {
      const id = roleId(index + 1);
      await db.query(
        `insert into company_roles values ($1, $2, 'internal', $3, $4, $5, $6)`,
        [id, item.role?.workspace ?? workspace, item.role?.status ?? "active", item.role?.is_expired ?? false,
          item.role?.expires_at ?? null, JSON.stringify(item.role?.information ?? {})]
      );
      await db.query(
        `insert into company_internal_roles values ($1, $2, $3, $4, $5)`,
        [id, item.internal && "request" in item.internal ? item.internal.request : "Backend engineer",
          item.internal?.is_company_first_search ?? true, item.internal?.intro_search_date ?? ["Mon", "Wed", "Fri"],
          item.internal?.intro_search_time ?? 9]
      );
      await db.query(`insert into test_role_facts values ($1, $2, $3, $4)`,
        [id, item.facts?.slot_type ?? "free", item.facts?.email_enabled ?? false, item.facts?.recipients ?? 0]);
    }
    await db.exec(await readFile(new URL(
      "../../../supabase/migrations/20261107010000_company_role_scheduled_search.sql", import.meta.url), "utf8"));

    const read = async (ids: string[]) => (await db.query<any>(
      "select * from public.company_role_scheduled_search_v1($1::uuid[]) order by role_id", [ids])).rows;
    const rows = await read(CASES.map((_, index) => roleId(index + 1)));
    assert.deepEqual(
      rows.map((row) => [CASES[Number(row.role_id.slice(-12)) - 1]!.name, row.eligible]),
      CASES.map((item) => [item.name, item.eligible])
    );

    // A Role that opted out of the only Slack channel has no channel left.
    const [channel] = (await db.query<any>("select id from company_slack_channels")).rows;
    await db.query("insert into company_role_notification_channels values ($1, $2)", [roleId(1), channel.id]);
    assert.equal((await read([roleId(1)]))[0].eligible, false);
    // An inactive Slack app does not deliver either.
    await db.exec("delete from company_role_notification_channels; update company_slack_integrations set status = 'revoked'");
    assert.equal((await read([roleId(1)]))[0].eligible, false);
    await db.exec("update company_slack_integrations set status = 'active'");
    assert.equal((await read([roleId(1)]))[0].eligible, true);

    // Days and hour as stored, with the worker's defaults when unset.
    await db.query("update company_internal_roles set intro_search_date = $2, intro_search_time = $3 where role_id = $1",
      [roleId(1), ["Tue"], 14]);
    await db.query("update company_internal_roles set intro_search_date = null, intro_search_time = null where role_id = $1",
      [roleId(2)]);
    const [custom, defaults] = await read([roleId(1), roleId(2)]);
    assert.deepEqual([custom.days, custom.hour], [["Tue"], 14]);
    assert.deepEqual([defaults.days, defaults.hour], [["Mon", "Wed", "Fri"], 9]);
    // Unknown Roles are simply absent.
    assert.deepEqual(await read([roleId(99)]), []);
  } finally {
    await db.close();
  }
});

test("next scheduled search: today's slot already passed, KST midnight, no days", () => {
  const at = (iso: string, days: unknown = ["Mon", "Wed", "Fri"], hour: unknown = 9) =>
    nextScheduledSearchAt({ days, hour, now: new Date(iso) });
  // Wed 2026-11-11 08:59 KST: today's 9:00 is still ahead.
  assert.equal(at("2026-11-10T23:59:00Z"), "2026-11-11T00:00:00.000Z");
  // Wed 09:00 KST exactly: that slot is now, so the next one is Fri.
  assert.equal(at("2026-11-11T00:00:00Z"), "2026-11-13T00:00:00.000Z");
  // Wed 09:30 KST: today's slot passed.
  assert.equal(at("2026-11-11T00:30:00Z"), "2026-11-13T00:00:00.000Z");
  // Tue 23:59 KST is still Tuesday in Korea (Tue 14:59 UTC): next is Wed 9:00.
  assert.equal(at("2026-11-10T14:59:00Z"), "2026-11-11T00:00:00.000Z");
  // Wed 00:00 KST (Tue 15:00 UTC) is already Wednesday in Korea.
  assert.equal(at("2026-11-10T15:00:00Z", ["Wed"], 0), "2026-11-17T15:00:00.000Z");
  assert.equal(at("2026-11-10T14:59:00Z", ["Wed"], 0), "2026-11-10T15:00:00.000Z");
  // A one-day schedule whose slot just passed comes back a week later.
  assert.equal(at("2026-11-11T01:00:00Z", ["Wed"], 9), "2026-11-18T00:00:00.000Z");
  // Unset days and hour fall back to Mon/Wed/Fri 9:00, like the worker.
  assert.equal(at("2026-11-10T23:59:00Z", null, null), "2026-11-11T00:00:00.000Z");
  assert.equal(at("2026-11-10T23:59:00Z", []), null);
});
