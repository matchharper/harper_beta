import assert from "node:assert/strict";
import test from "node:test";
import { runRoleSearchResearchPreview, type RoleSearchResearchArgs, ROLE_SEARCH_RESEARCH_TOOLS, ROLE_SEARCH_RESEARCH_MODEL } from "./roleSearchResearch.server";
import { DEFAULT_ORG_AGENT_MODEL, getOrgAgentReasoningEffort } from "./modelConfig";
import { resolveCompanyCapabilities } from "./capabilities/resolver";
import { createMemoryDocumentCache } from "@/lib/tools/memoryDocumentCache";
import { saveDocumentCache, fetchCachedDocument } from "@/lib/tools/documentCache";
import { getExaClient } from "@/lib/tools/exaClient";

const fixture = (): RoleSearchResearchArgs => ({
  admin: new Proxy({}, { get() { throw Error("No database effects permitted"); } }),
  context: { workspace: { workspaceId: "workspace" }, roles: [{ roleId: "role", name: "Engineer" }],
    companyText: "합성 회사", rolesText: "role Engineer", completeRoleRequestIds: [],
    conversationText: "-", conversationMessages: [], recentContactsText: "-", recentRecommendationsText: "-",
    summariesText: "-", contextNotesText: "-", defaultLongTextObservations: [] },
  conversation: { id: "conversation", company_workspace_id: "workspace", role_id: "role" },
  user: { id: "actor" }, roleId: "role", currentUserMessageId: 1,
} as unknown as RoleSearchResearchArgs);
const response = (calls: any[] = [], content = "조사 초안") => ({ model: ROLE_SEARCH_RESEARCH_MODEL,
  response: { provider: "OpenAI", choices: [{ finish_reason: calls.length ? "tool_calls" : "stop", message: { role: "assistant", content, tool_calls: calls } }] } });
const call = (name: string, input: unknown = {}) => ({ id: name, type: "function", function: { name, arguments: JSON.stringify(input) } });

test("manual research starts with web tools and cannot load or execute mutation tools", async () => {
  let step = 0;
  const executed: string[] = [];
  const result = await runRoleSearchResearchPreview(fixture(), {
    complete: async args => {
      assert.equal(args.model, "gpt-6.1-sol");
      assert.equal(args.reasoningEffort, "medium");
      assert.equal(args.maxTokens, 16_384);
      const names = args.tools?.map(t => t.function.name) ?? [];
      assert.ok(names.includes("web_search") && names.includes("open_url"));
      assert.ok(!names.includes("update_data") && !names.includes("send_company_message") && !names.includes("contact_talent"));
      if (step++ === 0) return response([call("load_capabilities", { capabilityIds: ["company_role_edit", "company_messaging"] }), call("update_data")]);
      if (step === 2) return response([call("web_search", { query: "공개 회사 팀 소개" })]);
      return response();
    },
    executeTool: async args => { executed.push(args.name); return { query: "공개 회사 팀 소개", resultCount: 0, results: [] }; },
  });
  assert.deepEqual(executed, ["web_search"]);
  assert.equal(result.text, "조사 초안");
  assert.equal(result.model, "gpt-6.1-sol");
  assert.equal(DEFAULT_ORG_AGENT_MODEL, "google/gemini-3.8-flash");
  assert.equal(getOrgAgentReasoningEffort(ROLE_SEARCH_RESEARCH_MODEL), "high");
});

test("target mismatch and cancellation never reach the model", async () => {
  const complete = async () => { throw Error("Unexpected model invocation"); };
  await assert.rejects(runRoleSearchResearchPreview({ ...fixture(), roleId: "other" }, { complete }), /target/);
  await assert.rejects(runRoleSearchResearchPreview({ ...fixture(), signal: AbortSignal.abort(new Error("cancelled")) }, { complete }), /cancelled/);
});

test("caller restriction survives full capability mode while ordinary mode stays unchanged", () => {
  const restricted = resolveCompanyCapabilities({ surface: "slack", mode: "full", loaded: new Set(), allowedToolNames: new Set(ROLE_SEARCH_RESEARCH_TOOLS) });
  assert.ok(!restricted.offeredToolNames.has("request_matching_search"));
  assert.ok(!restricted.offeredToolNames.has("report_issue"));
  assert.ok(resolveCompanyCapabilities({ surface: "slack", mode: "full", loaded: new Set() }).offeredToolNames.has("send_company_message"));
});

test("public documents are cached and refreshed only inside their session", async () => {
  const first = createMemoryDocumentCache(), second = createMemoryDocumentCache();
  await saveDocumentCache({ admin: first.admin, document: { url: "https://example.com/team", markdown: "first" } });
  await saveDocumentCache({ admin: first.admin, document: { url: "https://example.com/team", markdown: "updated" } });
  assert.equal((await fetchCachedDocument({ admin: first.admin, urlVariants: ["https://example.com/team"] }))?.markdown, "updated");
  assert.equal(first.snapshot().length, 1);
  assert.equal(await fetchCachedDocument({ admin: second.admin, urlVariants: ["https://example.com/team"] }), null);
});

test("default research executor reads public pages with session cache and no database", async t => {
  const previousKey = process.env.EXA_API_KEY;
  process.env.EXA_API_KEY = "unit-test-public-search";
  const requests: string[] = [];
  const client = getExaClient();
  t.mock.method(client, "search", async (query: string) => {
    requests.push(query);
    return { requestId: "fixture", results: [{ url: "https://example.com/team", title: "Team", text: "Public professional experience", highlights: ["Team profile"] }] };
  });
  t.mock.method(client, "getContents", async () => { throw Error("Search cache should be reused"); });
  let step = 0;
  try {
    const result = await runRoleSearchResearchPreview(fixture(), { complete: async () => {
      if (step++ === 0) return response([call("web_search", { query: "company team" })]);
      if (step === 2) return response([call("open_url", { url: "https://example.com/team" })]);
      return response();
    } });
    assert.equal(requests.length, 1); // The second tool reads this session's search cache.
    assert.equal(result.publicDocuments[0].markdown, "Public professional experience");
    assert.deepEqual(result.toolResults.map(r => r.name), ["web_search", "open_url"]);
  } finally {
    if (previousKey === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = previousKey;
  }
});
