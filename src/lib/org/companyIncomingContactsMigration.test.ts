import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("company jobs start across the conversation backlog, while one job retains one execution lease", async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  try {
    await db.exec(`set timezone='UTC'; create role anon; create role authenticated; create role service_role;
      create table company_agent_web_action_jobs (
        id uuid primary key, conversation_id uuid, action_name text, status text,
        attempt_count integer default 0, next_attempt_at timestamptz default now(),
        locked_at timestamptz, locked_by text, last_error text,
        created_at timestamptz default now(), updated_at timestamptz default now()
      );`);
    const original = readFileSync(new URL("../../../supabase/migrations/20260922082129_company_agent_web_action_turns.sql", import.meta.url), "utf8");
    const start = original.indexOf("create or replace function public.claim_company_agent_web_action_v1(");
    await db.exec(original.slice(start, original.indexOf("revoke all on function public.enqueue_company_agent_web_action_v1(", start)));
    await db.exec(`revoke all on function claim_company_agent_web_action_v1(uuid,text,integer,integer) from public, anon, authenticated;
      grant execute on function claim_company_agent_web_action_v1(uuid,text,integer,integer) to service_role;`);
    await db.exec(readFileSync(new URL("../../../supabase/migrations/20261109063047_immediate_incoming_company_contacts.sql", import.meta.url), "utf8"));
    const insert = async (n: number, action: string, status: string, secondsAgo: number) => db.query(
      `insert into company_agent_web_action_jobs(id,conversation_id,action_name,status,created_at,locked_at,next_attempt_at)
       values($1,$2,$3,$4,now()-make_interval(secs=>$5),case when $4='processing' then now() end,now()-interval '1 minute')`,
      [id(n), id(99), action, status, secondsAgo]);
    const claim = async (n: number, worker: string) => (await db.query<any>(
      "select * from claim_company_agent_web_action_v1($1,$2,5,1860)", [id(n), worker])).rows;
    await insert(1, "company_update", "queued", 120);
    await insert(2, "scheduled_matching_review", "processing", 100);
    await insert(3, "agent_contact_received", "queued", 60);
    await insert(4, "agent_contact_received", "queued", 50);
    await insert(5, "company_update", "queued", 40);
    assert.equal((await claim(3, "contact-a"))[0].locked_by, "contact-a");
    assert.equal((await claim(4, "contact-b"))[0].locked_by, "contact-b");
    assert.equal((await claim(3, "duplicate")).length, 0);
    assert.equal((await claim(5, "ordinary"))[0].locked_by, "ordinary");
    assert.equal((await claim(1, "earlier"))[0].locked_by, "earlier");
    assert.equal((await claim(2, "active-duplicate")).length, 0);
    await db.query("update company_agent_web_action_jobs set status='retry',locked_at=null,next_attempt_at=now() where id=$1", [id(3)]);
    const retried = (await claim(3, "retry"))[0];
    assert.equal(retried.attempt_count, 2);
    assert.equal(retried.locked_by, "retry");
    const access = (await db.query<any>(`select
      has_function_privilege('service_role','claim_company_agent_web_action_v1(uuid,text,integer,integer)','execute') service,
      has_function_privilege('authenticated','claim_company_agent_web_action_v1(uuid,text,integer,integer)','execute') member`)).rows[0];
    assert.equal(access.service, true);
    assert.equal(access.member, false);
  } finally { await db.close(); }
});
