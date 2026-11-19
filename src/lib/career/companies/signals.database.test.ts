import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { resourcePgliteTransport } from "../../../../scripts/evaluation/resourcePgliteTransport";
import { createCareerResourceFixture } from "../resources/databaseFixture";
import type { WebSearchResponse, WebSearchResult } from "@/lib/tools/webSearch";
import { checkCompanySignals, formatCompanySignals, readCompanySignals, type SignalExtractor } from "./signals";

type Ref = { kind: string; id: string; revision?: string };
type Signals = { requestedId: string; companyRef: Ref; name: string; checkedAt: string | null; total: number;
  items: { dataRef: Ref; date: string | null; content: string; url: string | null }[] };

async function scalar<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<{ value: T }>(sql, params)).rows[0].value;
}

async function database() {
  const db = await createCareerResourceFixture();
  await db.exec(await readFile("supabase/migrations/20261119230000_career_company_hiring_signals.sql", "utf8"));
  return db;
}

async function capture(db: PGlite, url: string, text: string, publishedAt: string | null) {
  const captured = await scalar<{ documentId: number; observationId: string }>(db,
    "select career_capture_public_source_v1($1,$2,$3,$4,$5,$6::jsonb,$7) value",
    ["public:" + url, url, text, text, "hash:" + text, { scope: "public", provider: "exa_search", contract: "fixture" }, publishedAt]);
  return { kind: "web_resource" as const, id: String(captured.documentId), revision: captured.observationId };
}

const workspace = (db: PGlite, name: string, site: string) => scalar<string>(db,
  "insert into company_workspace(company_name,homepage_url,is_internal) values($1,$2,false) returning company_workspace_id::text value", [name, site]);

test("signals are dated shared records read latest first with the company's last check", async t => {
  const db = await database();
  t.after(() => db.close());
  const orbit = await workspace(db, "Orbit", "https://orbit.example");
  const team = await capture(db, "https://www.linkedin.com/posts/orbit-team", "Orbit is building a Seoul team", "2026-11-03T02:00:00Z");
  const news = await capture(db, "https://news.example/orbit-korea", "Orbit began hiring in Korea", "2026-10-09T00:00:00Z");
  const write = (content: string, source: Ref) => scalar<{ status: string }>(db,
    "select career_write_company_datum_v1($1::jsonb,'hiring signal',$2,$3::jsonb,null,$4) value",
    [{ kind: "company_workspace", id: orbit }, content, JSON.stringify([{ kind: "observation", id: source.revision }]), crypto.randomUUID()]);
  assert.equal((await write("2026-10-09 — Began hiring engineers in Korea.", news)).status, "saved");
  assert.equal((await write("2026-11-03 — Building an applied AI team in Seoul.", team)).status, "saved");
  // Written by the agent without a leading date: its source's publication date stands in.
  assert.equal((await write("Opened a Seoul office and is hiring for it.", news)).status, "saved");
  const read = (ids: string[], limit = 2) => scalar<Signals[]>(db, "select career_company_signals_v1($1::uuid[],$2) value", [ids, limit]);

  const [first] = await read([orbit]);
  assert.equal(first.requestedId, orbit);
  assert.deepEqual(first.companyRef, { kind: "company_workspace", id: orbit });
  assert.equal(first.name, "Orbit");
  assert.equal(first.total, 3);
  assert.equal(first.checkedAt, null);
  assert.deepEqual(first.items.map(item => [item.date, item.content, item.url]), [
    ["2026-11-03", "Building an applied AI team in Seoul.", "https://www.linkedin.com/posts/orbit-team"],
    ["2026-10-09", "Opened a Seoul office and is hiring for it.", "https://news.example/orbit-korea"],
  ]);

  // The check marker is written only by the holder of the company's lease.
  const key = "hiring signal:company_workspace:" + orbit, owner = crypto.randomUUID();
  const finish = (by: string, checked = true) => scalar<boolean>(db,
    "select career_finish_company_signals_v1($1,$2,$3,$4) value", [key, by, orbit, checked]);
  assert.equal(await finish(owner), false);
  assert.equal(await scalar(db, "select career_claim_company_summary_v1($1,$2) value", [key, owner]), true);
  assert.equal(await scalar(db, "select career_claim_company_summary_v1($1,$2) value", [key, crypto.randomUUID()]), false);
  // The overview's own lease is separate, so both can be prepared at once.
  assert.equal(await scalar(db, "select career_claim_company_summary_v1($1,$2) value", ["company_workspace:" + orbit, owner]), true);
  assert.equal(await finish(crypto.randomUUID()), false);
  assert.equal(await finish(owner), true);
  assert.equal(await scalar(db, "select count(*)::int value from career_company_summary_leases where company_key=$1", [key]), 0);
  const [checked] = await read([orbit], 0);
  assert.ok(checked.checkedAt);
  assert.deepEqual([checked.total, checked.items.length], [3, 0]);

  // A sibling workspace of the same directory company reads the company's research.
  const directory = await scalar<string>(db, "insert into company_db(name,website_url) values('Orbit','https://orbit.example') returning id::text value");
  await db.query("update company_workspace set company_db_id=$1 where company_workspace_id=$2", [directory, orbit]);
  const sibling = await scalar<string>(db,
    "insert into company_workspace(company_name,company_db_id,is_internal) values('Orbit Inc.',$1,false) returning company_workspace_id::text value", [directory]);
  const [viaSibling] = await read([sibling]);
  assert.deepEqual([viaSibling.requestedId, viaSibling.companyRef.id, viaSibling.total], [sibling, orbit, 3]);
  assert.ok(viaSibling.checkedAt);

  // A withdrawn source takes its signal with it.
  await db.query("update career_public_observations set deleted_at=now() where id=$1", [team.revision]);
  assert.deepEqual((await read([orbit]))[0].items.map(item => item.date), ["2026-10-09", "2026-10-09"]);

  assert.equal(await scalar(db, "select has_function_privilege('anon','career_company_signals_v1(uuid[],integer)','execute') value"), false);
  assert.equal(await scalar(db, "select has_function_privilege('authenticated','career_finish_company_signals_v1(text,uuid,uuid,boolean)','execute') value"), false);
  assert.equal(await scalar(db, "select has_table_privilege('authenticated','career_company_signal_checks','select') value"), false);
  await db.query("delete from company_workspace where company_workspace_id=$1", [sibling]);
  await db.query("delete from company_datas where company_workspace_id=$1", [orbit]);
  await db.query("delete from company_workspace where company_workspace_id=$1", [orbit]);
  assert.equal(await scalar(db, "select count(*)::int value from career_company_signal_checks"), 0);
});

test("a check searches once per company, saves each dated source once, and records checks that find nothing", { timeout: 60_000 }, async t => {
  const db = await database();
  t.after(() => db.close());
  const admin = resourcePgliteTransport(db);
  const context = { admin, userId: "00000000-0000-4000-a000-000000000001" };
  const orbit = await workspace(db, "Orbit", "https://orbit.example");
  const quiet = await workspace(db, "Quiet Labs", "https://quiet.example");
  const sources = {
    team: await capture(db, "https://www.linkedin.com/posts/orbit-team", "We are hiring in Seoul", "2026-11-03T02:00:00Z"),
    news: await capture(db, "https://news.example/orbit-korea", "Orbit enters Korea", null),
    other: await capture(db, "https://news.example/another-company", "Another company raised", "2026-11-01T00:00:00Z"),
    later: await capture(db, "https://news.example/orbit-layoffs", "Orbit cut staff", "2026-11-17T00:00:00Z"),
  };
  const hit = (url: string, title: string, ref: WebSearchResult["resourceRef"], publishedDate?: string): WebSearchResult =>
    ({ url, title, highlights: [title], resourceRef: ref, ...(publishedDate ? { publishedDate } : {}) });
  let results: WebSearchResult[] = [
    hit("https://www.linkedin.com/posts/orbit-team", "We are hiring in Seoul", sources.team, "2026-11-03T02:00:00.000Z"),
    hit("https://news.example/orbit-korea", "Orbit enters Korea", sources.news),
    hit("https://news.example/another-company", "Another company raised", sources.other, "2026-11-01T00:00:00.000Z"),
    // A page that was not captured as a public source cannot support a shared record.
    { url: "https://uncaptured.example/orbit", title: "Orbit", highlights: [] },
  ];
  const queries: { query: string; options: unknown }[] = [];
  const search = async (args: { query: string; options?: unknown }): Promise<WebSearchResponse> => {
    queries.push({ query: args.query, options: args.options });
    await new Promise(resolve => setTimeout(resolve, 40));
    return { query: args.query, coverage: "fixture", results };
  };
  const seen: string[][] = [];
  let answer: Awaited<ReturnType<SignalExtractor>> = [];
  const extract: SignalExtractor = async ({ sources: given }) => { seen.push(given.map(source => source.url)); return answer; };
  // Result numbers follow the deduplicated captured results: team, news, other.
  answer = [
    { result: 1, date: "2026-11-03", content: "Orbit is hiring engineers for its new Seoul team." },
    { result: 2, date: "2026-10-20", content: "Orbit entered Korea and plans to hire locally." },
  ];
  const [one, two] = await Promise.all([orbit, orbit].map(() => checkCompanySignals(context, orbit, { search: search as never, extract })));
  assert.deepEqual([one.status, two.status].sort(), ["checked", "waited"]);
  assert.equal(queries.length, 2, "one check runs the news and LinkedIn searches once");
  assert.ok(queries.every(q => q.query.startsWith("Orbit orbit.example")));
  assert.deepEqual(queries.map(q => Object.keys(q.options as object).sort()), [["category", "startPublishedDate"], ["includeDomains", "startPublishedDate"]]);
  assert.deepEqual(seen, [["https://www.linkedin.com/posts/orbit-team", "https://news.example/orbit-korea", "https://news.example/another-company"]]);
  const stored = (await readCompanySignals(admin, [orbit])).get(orbit)!;
  assert.equal(stored.total, 2);
  assert.deepEqual(stored.items.map(item => item.date), ["2026-11-03", "2026-10-20"]);
  assert.ok(stored.checkedAt);

  // Checked within the recheck period: nothing is searched.
  assert.equal((await checkCompanySignals(context, orbit, { search: search as never, extract })).status, "current");
  assert.equal(queries.length, 2);

  // Fifteen days later the same pages are already on record; only the new one is read.
  await db.query("update career_company_signal_checks set checked_at=now()-interval '15 days'");
  results = [...results, hit("https://news.example/orbit-layoffs", "Orbit cut staff", sources.later, "2026-11-17T00:00:00.000Z")];
  answer = [{ result: 2, date: "2026-11-17", content: "Orbit laid off part of its sales team." }];
  const recheck = await checkCompanySignals(context, orbit, { search: search as never, extract });
  assert.deepEqual(recheck, { status: "checked", saved: 1 });
  assert.deepEqual(seen.at(-1), ["https://news.example/another-company", "https://news.example/orbit-layoffs"]);
  const after = (await readCompanySignals(admin, [orbit])).get(orbit)!;
  assert.equal(after.total, 3);
  assert.match(formatCompanySignals(after), /^hiring signals as of \d{4}-\d{2}-\d{2}: 2026-11-17 Orbit laid off part of its sales team\. \(news\.example\); 2026-11-03 Orbit is hiring engineers for its new Seoul team\. \(linkedin\.com\); 2026-10-20 Orbit entered Korea and plans to hire locally\. \(news\.example\)$/);

  // A check that finds nothing is a fact too; a failed one is not.
  answer = [];
  assert.deepEqual(await checkCompanySignals(context, quiet, { search: search as never, extract }), { status: "checked", saved: 0 });
  assert.match(formatCompanySignals((await readCompanySignals(admin, [quiet])).get(quiet)), /^no public hiring signal found as of \d{4}-\d{2}-\d{2}$/);
  const offline = await workspace(db, "Offline", "https://offline.example");
  const failing = async () => { throw new Error("provider down"); };
  assert.deepEqual(await checkCompanySignals(context, offline, { search: failing as never, extract }), { status: "failed", saved: 0 });
  assert.equal((await readCompanySignals(admin, [offline])).get(offline)?.checkedAt, null);
  assert.equal(formatCompanySignals((await readCompanySignals(admin, [offline])).get(offline)), "");
  assert.equal(await scalar(db, "select count(*)::int value from career_company_summary_leases"), 0);
});
