import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync(new URL("../../../../supabase/migrations/20261109030000_external_intro_connection_hold.sql", import.meta.url), "utf8")
  .replace("set local lock_timeout = '5s';", "");
const WS = "10000000-0000-4000-8000-000000000001";
const person = (i: number) => `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const OPEN = "30000000-0000-4000-8000-000000000001";
const ENDED = "30000000-0000-4000-8000-000000000002";
const CURRENT = "30000000-0000-4000-8000-000000000003";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.company_workspace(company_workspace_id uuid primary key,billing_started_at timestamptz,billing_model text);
    create table public.company_workspace_credit_periods(id uuid primary key,company_workspace_id uuid,slot_id uuid,starts_at timestamptz,ends_at timestamptz,confirmed_at timestamptz default now()-interval '40 days',allowance int,remaining int check(remaining>=0 and remaining<=allowance));
    create table public.company_workspace_credit_events(id uuid primary key default gen_random_uuid(),company_workspace_id uuid,period_id uuid,action_code text,business_key text,delta int,created_at timestamptz default now());
    create table public.external_candidates(id uuid primary key,company_decision text);
    create table public.external_intro_requests(id uuid primary key default gen_random_uuid(),external_candidate_id uuid unique,company_workspace_id uuid,status text,invited_at timestamptz,created_at timestamptz default now(),error_code text,updated_at timestamptz);
    create function public.workspace_billing_free_period_v1(p_workspace uuid,p_at timestamptz) returns uuid language sql as $$ select '${CURRENT}'::uuid $$;
    insert into public.company_workspace values('${WS}',now(),'standard');
    insert into public.company_workspace_credit_periods(id,company_workspace_id,starts_at,ends_at,allowance,remaining) values
      ('${OPEN}','${WS}',now()-interval '1 day',now()+interval '20 days',50,10),
      ('${ENDED}','${WS}',now()-interval '60 days',now()-interval '30 days',3,0);
    insert into public.company_workspace_credit_periods(id,company_workspace_id,starts_at,ends_at,allowance,remaining) values
      ('${CURRENT}','${WS}',now()-interval '1 day',now()+interval '20 days',3,1);
  `);
  await db.exec(sql);
  return db;
}

async function hold(db: PGlite, i: number, period: string, status: string | null, extra = "null", decision = "undecided", createdAgo = "1 minute") {
  await db.exec(`insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,delta,created_at)
    values('${WS}','${period}','intro_request','external:${person(i)}',-1,now()-interval '${createdAgo}');`);
  if (!status) return;
  await db.exec(`insert into public.external_candidates values('${person(i)}','${decision}');
    insert into public.external_intro_requests(external_candidate_id,company_workspace_id,status,invited_at,created_at)
    values('${person(i)}','${WS}','${status}',${extra},now()-interval '${createdAgo}');`);
}
const sweep = async (db: PGlite) => ((await db.query<{ n: number }>("select public.return_closed_external_intro_holds_v1('30 days') as n")).rows[0].n);
const remaining = async (db: PGlite, id: string) => ((await db.query<{ remaining: number }>(`select remaining from public.company_workspace_credit_periods where id='${id}'`)).rows[0].remaining);
const delta = async (db: PGlite, i: number) => ((await db.query<{ delta: number }>(`select delta from public.company_workspace_credit_events where business_key='external:${person(i)}'`)).rows[0].delta);

test("a held connection comes back once the request can no longer end in an introduction, and only once", async () => {
  const db = await setup();
  try {
    const old = "now()-interval '31 days'", recent = "now()-interval '2 days'";
    const closed: Array<Parameters<typeof hold>> = [
      [db, 1, OPEN, "declined", recent], [db, 2, OPEN, "bounced", recent], [db, 3, OPEN, "unsubscribed", recent],
      [db, 4, OPEN, "not_sendable"], [db, 5, OPEN, "failed", recent], [db, 6, OPEN, "cancelled"],
      [db, 7, OPEN, "invited", recent, "passed"], [db, 8, OPEN, "invited", old], [db, 9, OPEN, "replied", old],
    ];
    for (const args of closed) await hold(...args);
    assert.equal(await sweep(db), closed.length);
    assert.equal(await remaining(db, OPEN), 10 + closed.length);
    for (const [, i] of closed) assert.equal(await delta(db, i), 0);
    assert.equal(await sweep(db), 0);
    assert.equal(await remaining(db, OPEN), 10 + closed.length);
  } finally { await db.close(); }
});

test("a connection stays held while the person can still connect or the introduction is under way", async () => {
  const db = await setup();
  try {
    const recent = "now()-interval '2 days'", old = "now()-interval '31 days'";
    await hold(db, 1, OPEN, "invited", recent);
    await hold(db, 2, OPEN, "replied", recent);
    await hold(db, 3, OPEN, "requested");
    await hold(db, 4, OPEN, "sending");
    await hold(db, 5, OPEN, "accepted", old);
    await hold(db, 6, OPEN, "connecting", old, "passed");
    await hold(db, 7, OPEN, "connected", old);
    await hold(db, 8, OPEN, null); // the request row is still being saved
    assert.equal(await sweep(db), 0);
    assert.equal(await remaining(db, OPEN), 10);
  } finally { await db.close(); }
});

test("after the month ended the connection returns to the pool's current month, never above its allowance", async () => {
  const db = await setup();
  try {
    await hold(db, 1, ENDED, "invited", "now()-interval '31 days'");
    await hold(db, 2, ENDED, "invited", "now()-interval '31 days'");
    await hold(db, 3, ENDED, "invited", "now()-interval '31 days'");
    assert.equal(await sweep(db), 3);
    assert.equal(await remaining(db, CURRENT), 3);
    assert.equal(await remaining(db, ENDED), 0);
  } finally { await db.close(); }
});

test("a request never sent for 30 days is closed with its connection, and one never saved is returned after an hour", async () => {
  const db = await setup();
  try {
    await hold(db, 1, OPEN, "requested", "null", "undecided", "31 days");
    await hold(db, 2, OPEN, null, "null", "undecided", "2 hours");
    assert.equal(await sweep(db), 2);
    const row = (await db.query<{ status: string; error_code: string }>("select status,error_code from public.external_intro_requests")).rows[0];
    assert.deepEqual({ ...row }, { status: "not_sendable", error_code: "request_expired" });
    assert.equal(await remaining(db, OPEN), 12);
  } finally { await db.close(); }
});
