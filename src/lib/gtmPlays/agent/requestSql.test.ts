/**
 * The job-page request's queries on an in-memory Postgres: what the exclusion rules read about a person once a request
 * of theirs was mailed or ended (exclusion.server.ts exclusionFacts, its database and hash stubbed), the rate limits a
 * request is written against and the tick's claim (requestSql.ts). Synthetic people only.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Module from "node:module";
import { PGlite } from "@electric-sql/pglite";
import type { GtmWriteSql } from "../db.server";
import { exclusionReason } from "./people";
import { newRequestRow, type RequestSeed } from "./request";
import { acceptRequestQuery, claimDueRequestQuery } from "./requestSql";
import type { AgentPerson } from "./types";

// A small stand-in for postgres.js's tagged SQL: nested fragments inline, every other value a parameter, sql.json a
// JSON parameter. Only what these queries use.
const FRAGMENT = Symbol("fragment");
const JSON_VALUE = Symbol("json");
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
type Fragment = { [FRAGMENT]: true; strings: readonly string[]; values: unknown[] };

function sqlOf(db: Queryable) {
  const compile = (fragment: Fragment, params: unknown[]): string => fragment.strings.reduce((text, part, index) => {
    if (index === 0) return part;
    const value = fragment.values[index - 1];
    if (value && typeof value === "object" && FRAGMENT in value) return text + compile(value as Fragment, params) + part;
    params.push(value && typeof value === "object" && JSON_VALUE in value ? JSON.stringify((value as unknown as { value: unknown }).value) : value);
    return `${text}$${params.length}${part}`;
  }, "");
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const fragment: Fragment = { [FRAGMENT]: true, strings: [...strings], values };
    return Object.assign(fragment, {
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        const params: unknown[] = [];
        return db.query(compile(fragment, params), params).then((result) => result.rows).then(resolve, reject);
      },
    });
  };
  return Object.assign(sql, { json: (value: unknown) => ({ [JSON_VALUE]: true, value }) });
}

const SCHEMA = `
  create table public.talent_users (email text, deleted_at timestamptz, resume_links text[]);
  create table public.external_contact_suppressions (email_hash text primary key);
  create table public.external_intro_requests (recipient_email text, invited_at timestamptz);
  create table public.gtm_mails (
    id uuid primary key default gen_random_uuid(), audience text default 'candidate', to_email text, status text default 'sent',
    created_at timestamptz default now(), agent_person_id uuid
  );
  create table public.gtm_agent_people (
    id uuid primary key default gen_random_uuid(), run_id uuid, source text, method text, person_key text, profile_url text,
    contact_url text, profile_text text, signal_text text, signal_at timestamptz, email text, email_source text,
    is_test boolean not null default false, language text, status text not null default 'found', skip_reason text,
    events jsonb not null default '[]', request jsonb, retry_at timestamptz, ended_at timestamptz,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
`;

async function database() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  return db;
}

const DAY_MS = 86_400_000;
const hash = (email: string) => createHash("sha256").update(email).digest("hex");
const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

/** A searched (cold) person as the agent holds one before deciding to mail them. */
function coldPerson(patch: Partial<AgentPerson>): Pick<AgentPerson, "id" | "email" | "personKey" | "profileUrl" | "contactUrl"> {
  return { id: "00000000-0000-4000-8000-000000000001", email: null, personKey: "url:linkedin.com/in/jane-doe", profileUrl: null, contactUrl: null, ...patch };
}

async function addRequestRow(db: PGlite, args: { email: string; profileUrl: string | null; status: string; endedAt?: string | null }) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.gtm_agent_people (source, method, person_key, profile_url, email, email_source, status, ended_at, request)
     values ('harper_jobs', 'request', $1, $2, $3, 'self', $4, $5, '{}') returning id::text as id`,
    [`email:${args.email}`, args.profileUrl, args.email, args.status, args.endedAt ?? null],
  );
  return rows[0].id;
}

// exclusionFacts with its database (gtmRead) on the test's Postgres and the opt-out hash as a plain sha256.
let exclusion: typeof import("./exclusion.server");
let current: PGlite | null = null;
const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = loader._load;
before(async () => {
  loader._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "../db.server") return { gtmRead: (run: (sql: unknown) => Promise<unknown>) => run(sqlOf(current as PGlite)) };
    if (request === "@/lib/org/agent/externalInvite.server") return { externalEmailHash: hash };
    return originalLoad.call(this, request, parent, isMain);
  };
  exclusion = await import("./exclusion.server");
});
after(() => {
  loader._load = originalLoad;
});

async function factsFor(db: PGlite, person: ReturnType<typeof coldPerson>) {
  current = db;
  return exclusion.exclusionFacts(person as AgentPerson);
}

function reasonOf(facts: Awaited<ReturnType<typeof factsFor>>, person: ReturnType<typeof coldPerson>) {
  return exclusionReason({
    method: "signal_post", email: person.email, signalAt: new Date().toISOString(), isMember: facts.member, isSuppressed: facts.suppressed || facts.opted_out,
    isInternal: false, lastMailedAt: facts.last_mailed ? new Date(facts.last_mailed).toISOString() : null,
    lastEndedAt: facts.last_ended ? new Date(facts.last_ended).toISOString() : null, seenInRun: facts.active_elsewhere,
  }, new Date(), 90);
}

test("a cold person with the address of a job-page request mailed 3 days ago is recent contact", async () => {
  const db = await database();
  const requestId = await addRequestRow(db, { email: "jane@example.com", profileUrl: null, status: "ended", endedAt: ago(1) });
  await db.query(`insert into public.gtm_mails (to_email, created_at, agent_person_id) values ('jane@example.com', $1, $2)`, [ago(3), requestId]);
  const person = coldPerson({ email: "jane@example.com", personKey: "email:jane@example.com" });
  const facts = await factsFor(db, person);
  assert.ok(facts.last_mailed);
  assert.equal(reasonOf(facts, person), "recent_contact");
});

test("a cold person known only by the LinkedIn profile a job-page request gave is recent contact, then quiet after it ends", async () => {
  const db = await database();
  const requestId = await addRequestRow(db, { email: "jane@example.com", profileUrl: "https://www.linkedin.com/in/jane-doe", status: "sent" });
  await db.query(`insert into public.gtm_mails (to_email, created_at, agent_person_id) values ('jane@example.com', $1, $2)`, [ago(3), requestId]);
  // Found by a search with no address: only the profile ties them to the request (its key is the address they typed).
  const person = coldPerson({ profileUrl: "https://kr.linkedin.com/in/Jane-Doe/" });
  const facts = await factsFor(db, person);
  assert.ok(facts.last_mailed, "the request's mail is found by the profile");
  assert.equal(facts.active_elsewhere, true);
  assert.equal(reasonOf(facts, person), "duplicate");
  assert.equal(reasonOf({ ...facts, active_elsewhere: false }, person), "recent_contact");

  // 40 days later the request ended 10 days ago: past the 30 days, within quiet_after_end.
  await db.query(`update public.gtm_mails set created_at = $1`, [ago(40)]);
  await db.query(`update public.gtm_agent_people set status = 'ended', ended_at = $1 where id = $2`, [ago(10), requestId]);
  const later = await factsFor(db, person);
  assert.ok(later.last_ended);
  assert.equal(later.active_elsewhere, false);
  assert.equal(reasonOf(later, person), "quiet_after_end");
});

test("a request still waiting for postings keeps cold mail off the same person; a cold row waiting does not block cold", async () => {
  const db = await database();
  // Held: nothing fit yet, rechecked every 14 days (status found, no mail).
  await addRequestRow(db, { email: "jane@example.com", profileUrl: "https://www.linkedin.com/in/jane-doe", status: "found" });
  const byAddress = coldPerson({ email: "jane@example.com", personKey: "email:jane@example.com" });
  assert.equal(reasonOf(await factsFor(db, byAddress), byAddress), "duplicate");
  const byProfile = coldPerson({ profileUrl: "https://kr.linkedin.com/in/Jane-Doe/" });
  assert.equal(reasonOf(await factsFor(db, byProfile), byProfile), "duplicate");
  // A cold row that is only found (not yet matched) still doesn't count, as before.
  const other = await database();
  await other.query(
    `insert into public.gtm_agent_people (source, method, person_key, email, status) values ('linkedin', 'signal_post', 'email:jane@example.com', 'jane@example.com', 'found')`,
  );
  assert.equal((await factsFor(other, byAddress)).active_elsewhere, false);
});

test("cold rows still match each other only by key or address, not by a profile link", async () => {
  const db = await database();
  await db.query(
    `insert into public.gtm_agent_people (source, method, person_key, profile_url, status, ended_at)
     values ('linkedin', 'signal_post', 'url:linkedin.com/in/someone-else', 'https://www.linkedin.com/in/jane-doe', 'ended', $1)`,
    [ago(10)],
  );
  const facts = await factsFor(db, coldPerson({ profileUrl: "https://www.linkedin.com/in/jane-doe" }));
  assert.equal(facts.last_ended, null);
  assert.equal(facts.last_mailed, null);
});

test("a request's own row and mail are not counted against it", async () => {
  const db = await database();
  const requestId = await addRequestRow(db, { email: "jane@example.com", profileUrl: "https://www.linkedin.com/in/jane-doe", status: "approved" });
  await db.query(`insert into public.gtm_mails (to_email, created_at, agent_person_id, status) values ('jane@example.com', now(), $1, 'sending')`, [requestId]);
  const facts = await factsFor(db, {
    id: requestId, email: "jane@example.com", personKey: "email:jane@example.com", profileUrl: "https://www.linkedin.com/in/jane-doe", contactUrl: null,
  });
  assert.equal(facts.last_mailed, null);
  assert.equal(facts.active_elsewhere, false);
});

// ---------------------------------------------------------------------------------------------------------------
// Writing a request against the rate limits, and the tick's claim

const SEED: RequestSeed = {
  officialJobId: "job-1", slug: "backend-engineer", roleId: null, kind: "role", companyName: "Company A", roleTitle: "Backend Engineer",
  seniority: null, location: "Seoul", description: "Builds the payments backend.",
};

function rowFor(email: string, ipHash: string | null) {
  return newRequestRow({ email, linkedinUrl: "https://www.linkedin.com/in/jane-doe", cvText: null, seed: SEED, locale: "ko", ipHash, lid: null, now: new Date() });
}

async function accept(db: PGlite, email: string, ipHash: string | null = "ip-1") {
  return db.transaction((tx) => acceptRequestQuery(sqlOf(tx) as unknown as GtmWriteSql, rowFor(email, ipHash)));
}

test("a request is written found and leased; a second one from the address within 10 minutes is kept as the marker only", async () => {
  const db = await database();
  const first = await accept(db, "jane@example.com");
  assert.equal(first.status, "accepted");
  const { rows: [row] } = await db.query<{ status: string; method: string; email_source: string; person_key: string; leased: boolean }>(
    `select status, method, email_source, person_key, retry_at > now() as leased from public.gtm_agent_people where id = $1`, [first.personId]);
  assert.deepEqual(row, { status: "found", method: "request", email_source: "self", person_key: "email:jane@example.com", leased: true });

  const second = await accept(db, "jane@example.com");
  assert.deepEqual({ status: second.status, limit: second.status === "rate_limited" ? second.limit : null }, { status: "rate_limited", limit: "email_recent" });
  const { rows: [marker] } = await db.query<{ status: string; skip_reason: string; limited: boolean; profile_text: string | null; retry_at: string | null }>(
    `select status, skip_reason, (request->>'rateLimited')::boolean as limited, profile_text, retry_at from public.gtm_agent_people where id = $1`,
    [second.personId]);
  assert.deepEqual(marker, { status: "skipped", skip_reason: "rate_limit", limited: true, profile_text: null, retry_at: null });

  // 20 minutes on: the refused one does not count toward the address's limits.
  await db.query(`update public.gtm_agent_people set created_at = now() - interval '20 minutes'`);
  assert.equal((await accept(db, "jane@example.com")).status, "accepted");
});

test("three requests from an address a day, twenty from an IP an hour", async () => {
  const db = await database();
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await accept(db, "jane@example.com", `ip-${index}`)).status, "accepted");
    await db.query(`update public.gtm_agent_people set created_at = created_at - interval '15 minutes'`);
  }
  const fourth = await accept(db, "jane@example.com", "ip-9");
  assert.equal(fourth.status === "rate_limited" && fourth.limit, "email_daily");

  const other = await database();
  for (let index = 0; index < 20; index += 1) assert.equal((await accept(other, `person${index}@example.com`, "ip-shared")).status, "accepted");
  const over = await accept(other, "person20@example.com", "ip-shared");
  assert.equal(over.status === "rate_limited" && over.limit, "ip");
  assert.equal((await accept(other, "person21@example.com", "ip-other")).status, "accepted");
});

test("the tick claims a request due now (lease written), never one leased, finished or cold", async () => {
  const db = await database();
  const insert = (method: string, status: string, retryAt: string | null) => db.query<{ id: string }>(
    `insert into public.gtm_agent_people (source, method, person_key, status, retry_at) values ('x', $1, 'k', $2, $3) returning id::text as id`,
    [method, status, retryAt]).then((result) => result.rows[0].id);
  await insert("request", "found", new Date(Date.now() + 60_000).toISOString()); // a run holds it
  await insert("request", "sent", ago(1));
  await insert("signal_post", "found", ago(1));
  const due = await insert("request", "found", ago(14));
  const sql = sqlOf(db) as unknown as GtmWriteSql;
  assert.equal(await claimDueRequestQuery(sql), due);
  const { rows: [row] } = await db.query<{ leased: boolean }>(`select retry_at > now() + interval '5 minutes' as leased from public.gtm_agent_people where id = $1`, [due]);
  assert.equal(row.leased, true);
  assert.equal(await claimDueRequestQuery(sql), null);
});
