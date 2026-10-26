import assert from "node:assert/strict";
import test from "node:test";

// Synthetic transport only: no credentials or live network in this regression.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://privacy-test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
process.env.OPENAI_API_KEY = "test-only";
process.env.OPENROUTER_API_KEY = "test-only";

const pending = "pending+qa@example.invalid";
const ready = "ready_qa@example.invalid";
const connected = "connected@example.invalid";
const company = "company@example.invalid";
const tables: Record<string, any[]> = {
  talent_users: [{ user_id: "pending", email: pending }, { user_id: "ready", email: ready },
    { user_id: "connected", email: connected }],
  company_roles: [{ role_id: "role", source_type: "internal", company_workspace_id: "workspace" }],
  talent_effective_opportunity_recommendations_v1: [
    { id: "rec-pending", talent_id: "pending", role_id: "role", feedback: "like", saved_stage: "accepted" },
    { id: "rec-connected", talent_id: "connected", role_id: "role", feedback: "like", saved_stage: "accepted" },
  ],
  company_intro_candidates: [{ id: "intro", talent_id: "ready", role_id: "role", status: "ready",
    company_workspace_id: "workspace" }],
  ops_matching_role_stages: [],
  talent_opportunity_tag: [
    { id: "tag-pending", talent_id: "pending", opportunity_id: "role", tag: "내부:연결대기" },
    { id: "tag-connected", talent_id: "connected", opportunity_id: "role", tag: "내부:연결됨" },
  ],
  talent_progress: [],
};

function queryRows(url: URL) {
  const table = url.pathname.split("/").at(-1)!;
  assert.ok(Object.hasOwn(tables, table), `unexpected table ${table}`);
  let rows = tables[table];
  for (const [column, filter] of url.searchParams) {
    if (filter.startsWith("eq.")) rows = rows.filter(row => String(row[column]) === filter.slice(3));
    if (filter.startsWith("ilike.")) {
      const exact = filter.slice(6).replace(/\\([\\%_])/g, "$1").toLowerCase();
      rows = rows.filter(row => row[column]?.toLowerCase() === exact);
    }
    if (filter.startsWith("in.(")) {
      const values = filter.slice(4, -1).split(",").map(value => value.replaceAll('"', ""));
      rows = rows.filter(row => values.includes(String(row[column])));
    }
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  return rows.slice(offset, offset + Number(url.searchParams.get("limit") ?? 1000));
}

test("actual completion transport excludes private addresses from history/contact/error inputs", async t => {
  let modelCalls = 0;
  let failReads = false;
  t.mock.method(globalThis, "fetch", async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === "https://openrouter.ai") {
      modelCalls++;
      const request = JSON.parse(String(init?.body));
      const text = JSON.stringify(request.messages).toLowerCase();
      assert.ok(!text.includes(pending));
      assert.ok(!text.includes(ready));
      assert.ok(text.includes(connected));
      assert.ok(text.includes(company));
      return new Response(JSON.stringify({ id: "synthetic", choices: [{ index: 0, finish_reason: "stop",
        message: { role: "assistant", content: "확인했어요." } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
        { headers: { "content-type": "application/json" } });
    }
    assert.equal(url.origin, "https://privacy-test.invalid", "no live network");
    assert.equal(init?.method ?? "GET", "GET", "privacy lookup cannot write");
    if (failReads) return new Response(JSON.stringify({ message: "privacy read unavailable" }), { status: 400 });
    return new Response(JSON.stringify(queryRows(url)), { status: 200, headers: { "content-type": "application/json" } });
  });
  const { runOrgAgentCompletion } = await import("./chat");
  const messages = [{ role: "user" as const, content: `Past conversation: ${pending.toUpperCase()}; ${company}` },
    { role: "tool" as const, tool_call_id: "contact", content: JSON.stringify({
      candidate: { email: pending }, body: `연락 ${ready}`, error: `Failed ${pending}`, connected,
    }) }];
  await runOrgAgentCompletion({ candidateEmailWorkspaceId: "workspace", messages,
    allowTools: false, maxTokens: 100, model: "google/gemini-3.8-flash", strictModel: true });
  assert.equal(modelCalls, 1);
  assert.ok(JSON.stringify(messages).includes(pending), "original delivery/history is unchanged");
  failReads = true;
  await assert.rejects(runOrgAgentCompletion({ candidateEmailWorkspaceId: "workspace", messages,
    allowTools: false, maxTokens: 100, model: "google/gemini-3.8-flash", strictModel: true }));
  assert.equal(modelCalls, 1, "failed privacy read must not reach any model");
});

test("privacy resolver uses current tags and company scope, including Intro requested", async t => {
  const { getSupabaseAdmin } = await import("@/lib/server/candidateAccess");
  const { resolveOrgAgentPrivateCandidateEmails } = await import("../server");
  t.mock.method(globalThis, "fetch", async (input: any) => new Response(JSON.stringify(queryRows(new URL(String(input)))),
    { status: 200, headers: { "content-type": "application/json" } }));
  const args = { admin: getSupabaseAdmin(), workspaceId: "workspace", emails: [pending, ready, connected, company] };
  assert.deepEqual((await resolveOrgAgentPrivateCandidateEmails(args)).sort(), [pending, ready].sort());
  assert.deepEqual(await resolveOrgAgentPrivateCandidateEmails({ ...args, workspaceId: "other" }), []);
  const original = tables.company_intro_candidates[0].status;
  try {
    tables.company_intro_candidates[0].status = "awaiting_talent";
    assert.ok((await resolveOrgAgentPrivateCandidateEmails(args)).includes(ready));
  } finally { tables.company_intro_candidates[0].status = original; }
});
