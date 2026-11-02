import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/internal/debug/application-suggestions/route";
import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";
import { tracedLlmFetch } from "@/lib/llm/providerTrace";
import { buildApplicationSuggestionsRequest, writeApplicationSuggestions } from "@/lib/career/simulation/suggestionWriter";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentDocumentRow, TalentStructuredProfile } from "@/lib/talentOnboarding/models";
import {
  previewApplicationSuggestionsDebug,
  executePreparedApplicationSuggestionsDebug,
} from "./applicationSuggestionsDebug.server";

const input = { talentId: "owner", documentId: "resume", roleId: "role" };
const document = {
  id: "resume", kind: "resume", file_name: "Original.pdf", talent_id: "owner",
  extracted_text: "Original resume", updated_at: "2026-10-01T00:00:00Z", is_primary: true,
} as TalentDocumentRow;
const profile: TalentStructuredProfile = {
  talentUser: null, talentExperiences: [], talentEducations: [],
  talentExtras: [{ title: "Additional work", description: "Confirmed result", memo: "Supporting detail", date: null }],
};
function fixture() {
  const admin = {
    from(table: string) {
      assert.equal(table, "talent_users");
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        is: (key: string, value: unknown) => { filters[key] = value; return query; },
        maybeSingle: async () => {
          assert.deepEqual(filters, { user_id: "owner", deleted_at: null });
          return { data: { user_id: "owner", name: "Fixture", email: "fixture@example.com" }, error: null };
        },
      };
      return query;
    },
  } as unknown as TalentAdminClient;
  const dependencies = {
    fetchTalentDocument: async (args: { userId: string; documentId: string }) => {
      assert.equal(args.userId, "owner");
      assert.equal(args.documentId, "resume");
      return document as TalentDocumentRow | null;
    },
    fetchTalentStructuredProfile: async () => profile,
    fetchTalentUserProfile: async () => null,
    fetchTalentContextPromptSnapshot: async (args: { userId: string; query?: string | null; memoryTokenBudget?: number }) => {
      assert.equal(args.userId, "owner");
      assert.equal(args.query, "Company · Engineer");
      assert.equal(args.memoryTokenBudget, 4000);
      return { allBriefs: [], briefs: [], memories: [], memorySelection: "all" as const, memoryTruncated: false };
    },
    runGetRoleContext: async (args: { userId: string; roleIds: string[]; includeJd: boolean; externalFactsOnly?: boolean }) => {
      assert.equal(args.userId, "owner");
      assert.deepEqual(args.roleIds, ["role"]);
      assert.equal(args.includeJd, true);
      assert.equal(args.externalFactsOnly, true);
      return { roles: [{ found: true, role: { name: "Engineer", description: "Stored job description", sourceType: "external" }, companyDb: { name: "Company" } }] };
    },
    buildApplicationSuggestionsRequest,
    writeApplicationSuggestions,
  } as unknown as NonNullable<Parameters<typeof previewApplicationSuggestionsDebug>[2]>;
  return { admin, dependencies };
}

test("suggestion debugger rejects unauthenticated requests before loading private data", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("must not access data or providers"); });
  const response = await POST(new NextRequest("http://localhost/api/internal/debug/application-suggestions", {
    method: "POST", body: JSON.stringify({ action: "lookup", email: "fixture@example.com" }),
  }));
  assert.equal(response.status, 401);
});

test("selected resume is scoped to the candidate before assembling a request", async () => {
  const { admin, dependencies } = fixture();
  dependencies.fetchTalentDocument = async (args) => {
    assert.equal(args.userId, "owner");
    assert.equal(args.documentId, "resume");
    return null;
  };
  dependencies.buildApplicationSuggestionsRequest = async () => { throw new Error("must not build a prompt"); };
  await assert.rejects(previewApplicationSuggestionsDebug(input, { admin }, dependencies), /이력서를 찾지 못/);
});

test("prepared sources use the production request and writer with fresh prompts and provider capture", async (t) => {
  const { admin, dependencies } = fixture();
  const preview = await previewApplicationSuggestionsDebug(input, { admin }, dependencies);
  assert.equal(preview.model, CLAUDE_HAIKU_MODEL);
  assert.equal(preview.input.resume, "Original resume");
  assert.match(preview.input.candidate, /Additional work[\s\S]*Confirmed result[\s\S]*Supporting detail/);
  assert.match(preview.input.role, /Stored job description/);
  assert.equal(preview.input.application, undefined);
  const request = await buildApplicationSuggestionsRequest({ ...preview.input, model: preview.model });
  assert.deepEqual(preview.prompt.messages, request.messages);
  assert.deepEqual(preview.prompt.tools, request.tools);
  preview.prompt = { messages: ["stale prompt"], tools: [] };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ model: "fixture", ok: true }), { headers: { "content-type": "application/json" } }));
  dependencies.writeApplicationSuggestions = async (args) => {
    assert.equal(args.admin, admin);
    assert.equal(args.userId, "owner");
    assert.equal(args.readTool, undefined);
    assert.equal(args.model, CLAUDE_HAIKU_MODEL);
    assert.equal(args.candidate, preview.input.candidate);
    return writeApplicationSuggestions(args, async (actual) => {
      assert.deepEqual(actual.messages, request.messages);
      assert.deepEqual(actual.tools?.map((tool) => tool.function.name).sort(), ["finish_application_suggestions", "list_documents", "read_document", "read_talent_context"]);
      await tracedLlmFetch("https://provider.example/messages", {
        method: "POST", body: JSON.stringify({ messages: actual.messages, tools: actual.tools }),
      });
      await actual.executeTool({ name: "finish_application_suggestions", input: { suggestions: [] } });
      return { messages: [], content: "", toolCalls: [] } as never;
    });
  };
  const result = await executePreparedApplicationSuggestionsDebug(preview, { admin }, dependencies);
  assert.equal(result.error, null);
  assert.deepEqual(result.suggestions, []);
  assert.deepEqual(result.prompt.messages, request.messages);
  assert.equal(result.trace.length, 1);
  assert.equal((result.trace[0] as { status: number }).status, 200);
});
