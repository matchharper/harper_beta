import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Incident #107: two letters of one introduction must not run at once, while
// every other company job keeps claiming immediately (20261109063047).
const migration = new URL(
  "../../../supabase/migrations/20261116071000_serialize_introduction_letter_runs.sql",
  import.meta.url
);
const conversation = "00000000-0000-4000-8000-0000000000c1";
const otherConversation = "00000000-0000-4000-8000-0000000000c2";
const root = "00000000-0000-4000-8000-0000000000a1";
const otherRoot = "00000000-0000-4000-8000-0000000000a2";
let db: PGlite;
let sequence = 0;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.company_agent_web_action_jobs (
      id uuid primary key,
      conversation_id uuid not null,
      action_name text not null,
      action_context jsonb not null default '{}'::jsonb,
      status text not null default 'queued',
      attempt_count integer not null default 0,
      next_attempt_at timestamptz not null default timezone('utc', now()),
      locked_at timestamptz,
      locked_by text,
      last_error text,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
  `);
  await db.exec(await readFile(migration, "utf8"));
});

after(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec("delete from public.company_agent_web_action_jobs;");
});

async function job(args: {
  action?: string;
  rootId?: string | null;
  conversationId?: string;
  status?: string;
  lockedSecondsAgo?: number;
  createdSecondsAgo?: number;
  attempts?: number;
}) {
  sequence += 1;
  const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  const context = args.rootId === null ? {} : { introductionRootId: args.rootId ?? root };
  await db.query(
    `insert into public.company_agent_web_action_jobs
      (id, conversation_id, action_name, action_context, status, attempt_count, locked_at, locked_by, created_at)
    values ($1::uuid, $2::uuid, $3, $4::jsonb, $5, $6,
      case when $7::integer is null then null else timezone('utc', now()) - make_interval(secs => $7::integer) end,
      case when $7::integer is null then null else 'earlier-worker' end,
      timezone('utc', now()) - make_interval(secs => $8::integer))`,
    [
      id,
      args.conversationId ?? conversation,
      args.action ?? "agent_contact_received",
      context,
      args.status ?? "queued",
      args.attempts ?? 0,
      args.lockedSecondsAgo ?? null,
      args.createdSecondsAgo ?? 0,
    ]
  );
  return id;
}

async function claim(id: string) {
  const { rows } = await db.query(
    "select id, status, attempt_count, locked_by from public.claim_company_agent_web_action_v1($1::uuid, $2, 5, 1860)",
    [id, "worker-2"]
  );
  return rows as Array<{ id: string; status: string; attempt_count: number; locked_by: string }>;
}

test("a letter waits while an earlier letter of the same introduction is running", async () => {
  await job({ status: "processing", lockedSecondsAgo: 60, createdSecondsAgo: 120, attempts: 1 });
  const later = await job({ createdSecondsAgo: 30 });

  assert.deepEqual(await claim(later), []);
});

test("a letter waits for an earlier unfinished letter of the same introduction, then runs after it", async () => {
  const earlier = await job({ status: "retry", createdSecondsAgo: 120, attempts: 1 });
  const later = await job({ createdSecondsAgo: 30 });

  assert.deepEqual(await claim(later), []);
  assert.equal((await claim(earlier))[0]?.status, "processing");
  assert.deepEqual(await claim(later), []);

  await db.exec(`update public.company_agent_web_action_jobs set status = 'completed_message', locked_at = null, locked_by = null where id = '${earlier}';`);
  const [claimed] = await claim(later);
  assert.equal(claimed.status, "processing");
  assert.equal(claimed.attempt_count, 1);
  assert.equal(claimed.locked_by, "worker-2");
});

test("an earlier letter is not held back by a later letter that is only queued", async () => {
  const earlier = await job({ createdSecondsAgo: 120 });
  await job({ createdSecondsAgo: 30 });

  assert.equal((await claim(earlier))[0]?.status, "processing");
});

test("letters of other introductions and other company jobs still claim at once", async () => {
  await job({ status: "processing", lockedSecondsAgo: 60, createdSecondsAgo: 120, attempts: 1 });
  await job({ createdSecondsAgo: 90 });
  const otherIntroduction = await job({ rootId: otherRoot, createdSecondsAgo: 30 });
  const roleRun = await job({ action: "scheduled_matching_review", rootId: null, createdSecondsAgo: 30 });
  const schedule = await job({ action: "agent_schedule_due", createdSecondsAgo: 30 });
  const otherConversationLetter = await job({ conversationId: otherConversation, createdSecondsAgo: 30 });

  for (const id of [otherIntroduction, roleRun, schedule, otherConversationLetter]) {
    assert.equal((await claim(id))[0]?.status, "processing", id);
  }
});

test("a long Role run in the same conversation does not hold back a letter", async () => {
  await job({ action: "scheduled_matching_review", rootId: null, status: "processing", lockedSecondsAgo: 60, createdSecondsAgo: 300, attempts: 1 });
  await job({ action: "company_update", rootId: null, createdSecondsAgo: 200 });
  const letter = await job({ createdSecondsAgo: 30 });

  assert.equal((await claim(letter))[0]?.status, "processing");
});

test("an expired lease is claimed again and does not hold back later letters", async () => {
  const expired = await job({ status: "processing", lockedSecondsAgo: 1900, createdSecondsAgo: 2000, attempts: 1 });
  const later = await job({ createdSecondsAgo: 30 });

  const [reclaimed] = await claim(expired);
  assert.equal(reclaimed.status, "processing");
  assert.equal(reclaimed.attempt_count, 2);
  assert.equal(reclaimed.locked_by, "worker-2");
  // The reclaimed run holds a live lease again, so the later letter waits for it.
  assert.deepEqual(await claim(later), []);

  await db.exec(`update public.company_agent_web_action_jobs set locked_at = timezone('utc', now()) - interval '1900 seconds' where id = '${expired}';`);
  assert.equal((await claim(later))[0]?.status, "processing");
});

test("an earlier letter with no attempts left does not hold back later letters", async () => {
  const exhausted = await job({ status: "retry", createdSecondsAgo: 120, attempts: 5 });
  const later = await job({ createdSecondsAgo: 30 });

  assert.deepEqual(await claim(exhausted), []);
  assert.equal((await claim(later))[0]?.status, "processing");
});

test("an earlier letter that ended, including as failed by lease recovery, does not hold back later letters", async () => {
  await job({ status: "failed", createdSecondsAgo: 300, attempts: 5 });
  await job({ status: "completed_message", createdSecondsAgo: 200, attempts: 1 });
  await job({ status: "superseded", createdSecondsAgo: 100, attempts: 1 });
  const later = await job({ createdSecondsAgo: 30 });

  assert.equal((await claim(later))[0]?.status, "processing");
});

test("lease rules are unchanged for the job itself", async () => {
  const running = await job({ status: "processing", lockedSecondsAgo: 60, attempts: 1 });
  const exhausted = await job({ rootId: otherRoot, status: "retry", attempts: 5 });
  const notDue = await job({ rootId: otherRoot, conversationId: otherConversation });
  await db.exec(`update public.company_agent_web_action_jobs set next_attempt_at = timezone('utc', now()) + interval '60 seconds' where id = '${notDue}';`);

  assert.deepEqual(await claim(running), []);
  assert.deepEqual(await claim(exhausted), []);
  assert.deepEqual(await claim(notDue), []);
});
