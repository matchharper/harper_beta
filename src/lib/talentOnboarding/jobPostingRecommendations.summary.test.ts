import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { RawRoleRow } from "./jobPostingRecommendations";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const version = "v2-neutral-source-hash";
let db: PGlite;
let api: typeof import("./jobPostingRecommendations");

before(async () => {
  process.env.OPENAI_API_KEY ??= "test-openai-key";
  api = await import("./jobPostingRecommendations");
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.company_roles (
      role_id uuid primary key, company_workspace_id uuid,
      name text, description text, summary jsonb
    );
  `);
  await db.exec(await readFile(new URL(
    "../../../supabase/migrations/20261029021156_refresh_stale_external_role_summaries.sql",
    import.meta.url
  ), "utf8"));
});
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("truncate public.company_roles"); });

function role(n = 1): RawRoleRow {
  return {
    role_id: uuid(n), company_workspace_id: uuid(100),
    role_name: "Engineer", description: "Developer tooling",
  };
}
async function seed(row: RawRoleRow, summary: unknown = null) {
  await db.query(
    "insert into company_roles(role_id,company_workspace_id,name,description,summary) values($1,$2,$3,$4,$5::jsonb)",
    [row.role_id, row.company_workspace_id, row.role_name, row.description, summary === null ? null : JSON.stringify(summary)]
  );
}
async function stored(roleId = uuid(1)) {
  const result = await db.query<{ summary: Record<string, any> }>(
    "select summary from company_roles where role_id=$1", [roleId]
  );
  return result.rows[0].summary;
}
function harness(failSummary = false) {
  const batches: number[] = [];
  const recommendations: Array<{ fit_summary: string }> = [];
  const admin = {
    rpc: async (name: string, args: { p_locale: string; p_rows: unknown[] }) => {
      assert.equal(name, "save_external_role_summaries_v2");
      batches.push(args.p_rows.length);
      if (failSummary) return { data: null, error: { message: "Synthetic write failure" } };
      const result = await db.query(
        "select * from public.save_external_role_summaries_v2($1,$2::jsonb)",
        [args.p_locale, JSON.stringify(args.p_rows)]
      );
      return { data: result.rows, error: null };
    },
    from: (table: string) => {
      assert.equal(table, "talent_opportunity_recommendation");
      return { insert: (rows: Array<{ fit_summary: string; role_id: string }>) => {
        recommendations.push(...rows);
        return { select: async () => ({
          data: rows.map((row) => ({ id: `recommendation-${row.role_id}`, role_id: row.role_id })), error: null,
        }) };
      } };
    },
  };
  return {
    admin: admin as unknown as Parameters<typeof api.persistRecommendations>[0]["admin"],
    batches, recommendations,
  };
}
function recommend(row: RawRoleRow, content: string) {
  return {
    concerns: [], goodPoints: [], isSupplemental: false, recommendationId: null,
    recommendationText: content, roleId: row.role_id!, score: 8, role: row,
    detail: { fitReasons: [], roleOverviewText: content, tradeoffs: [] },
  };
}
function batch(row: RawRoleRow, content: string, admin: ReturnType<typeof harness>["admin"]) {
  return api.saveFullJdRoleSummariesBatch({
    admin, outputLanguage: "English", cards: [api.roleCard(row)],
    evaluations: [{ roleId: row.role_id!, fitSummary: content, fitReasons: [], modelScore100: 80, tradeoff: "" }],
  });
}

test("short and mixed-language summaries are persisted with their requested locale", async () => {
  const row = role();
  await seed(row);
  for (const [outputLanguage, locale, content] of [
    ["English", "en", "Build O'Reilly's developer tools."],
    ["Korean", "ko", "TypeScript, PostgreSQL, Kubernetes 기반 API 개발"],
  ]) {
    const h = harness();
    const result = await api.persistRecommendations({
      admin: h.admin, outputLanguage, userId: "fixture-user",
      recommendations: [recommend(row, content)],
    });
    assert.deepEqual(h.batches, [1]);
    const summary = await stored();
    assert.equal(summary[locale].content, content);
    assert.equal(summary[locale].version, version);
    assert.equal(summary[locale].sourceHash, api.fullJdRoleSourceHash(api.roleCard(row)));
    assert.equal(h.recommendations[0].fit_summary, content);
    assert.equal(result[0].recommendationId, `recommendation-${row.role_id}`);
  }
  assert.equal((await stored()).en.content, "Build O'Reilly's developer tools.");
});

test("obsolete summary versions and source hashes are refreshed without replacing another locale", async () => {
  for (const [n, stale] of [
    [1, { version: "v1", sourceHash: api.fullJdRoleSourceHash(api.roleCard(role(1))) }],
    [2, { version, sourceHash: "previous-source" }],
  ] as const) {
    const row = role(n);
    const korean = { content: "기존 한국어 요약", version, sourceHash: "ko-source" };
    await seed(row, { ko: korean, en: { content: "Outdated summary", ...stale } });
    const h = harness();
    await api.persistRecommendations({
      admin: h.admin, outputLanguage: "English", userId: "fixture-user",
      recommendations: [recommend(row, "Current summary")],
    });
    const summary = await stored(row.role_id!);
    assert.equal(summary.en.content, "Current summary");
    assert.equal(summary.en.version, version);
    assert.equal(summary.en.sourceHash, api.fullJdRoleSourceHash(api.roleCard(row)));
    assert.deepEqual(summary.ko, korean);
  }
});

test("full JD batches use the mutation RPC in groups accepted by its ten-row contract", async () => {
  const rows = Array.from({ length: 23 }, (_, i) => role(i + 1));
  for (const row of rows) await seed(row);
  const h = harness();
  const result = await api.saveFullJdRoleSummariesBatch({
    admin: h.admin, outputLanguage: "English", cards: rows.map(api.roleCard),
    evaluations: rows.map((row) => ({
      roleId: row.role_id!, fitSummary: `Summary ${row.role_id}`, fitReasons: [], modelScore100: 80, tradeoff: "",
    })),
  });
  assert.deepEqual(h.batches, [10, 10, 3]);
  assert.equal(result.stored, 23);
  assert.equal((await stored(uuid(23))).en.content, `Summary ${uuid(23)}`);
});

test("another writer's current summary wins, and already-current input does not write again", async () => {
  const row = role();
  const summary = { en: {
    content: "First writer", version,
    sourceHash: api.fullJdRoleSourceHash(api.roleCard(row)),
  } };
  await seed(row, summary);
  const h = harness();
  await batch(row, "Second writer", h.admin);
  assert.deepEqual(await stored(), summary);
  const result = await batch({ ...row, summary }, "Already current", h.admin);
  assert.equal(result.stored, 0);
  assert.deepEqual(h.batches, [1]);
});

test("changed role source cannot receive a summary generated from the old source", async () => {
  const row = role();
  await seed({ ...row, description: "Changed after reading" }, { en: { content: "Retained" } });
  const h = harness();
  const result = await batch(row, "Stale output", h.admin);
  assert.equal(result.stored, 0);
  assert.equal((await stored()).en.content, "Retained");
});

test("a summary write failure still allows the recommendation to be saved", async () => {
  const row = role();
  const h = harness(true);
  const result = await api.persistRecommendations({
    admin: h.admin, outputLanguage: "English", userId: "fixture-user",
    recommendations: [recommend(row, "Recommendation summary")],
  });
  assert.equal(h.recommendations[0].fit_summary, "Recommendation summary");
  assert.equal(result[0].recommendationId, `recommendation-${row.role_id}`);
});

test("summary mutation remains server-only and uses caller permissions", async () => {
  const result = await db.query(`select
    has_function_privilege('anon','public.save_external_role_summaries_v2(text,jsonb)','execute') as anonymous,
    has_function_privilege('authenticated','public.save_external_role_summaries_v2(text,jsonb)','execute') as authenticated,
    has_function_privilege('service_role','public.save_external_role_summaries_v2(text,jsonb)','execute') as service,
    prosecdef from pg_proc where oid='public.save_external_role_summaries_v2(text,jsonb)'::regprocedure`);
  assert.deepEqual(result.rows[0], { anonymous: false, authenticated: false, service: true, prosecdef: false });
});
