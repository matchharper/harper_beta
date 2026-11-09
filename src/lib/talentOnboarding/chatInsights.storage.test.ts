import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { buildCareerInsightExtractionOnlyPrompt } from "../career/prompts/cases/insightExtractionPrompts";

test("partial compensation facts persist without marking a question complete", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const original = modules._load;
  const writes: any[] = [];
  const facts = "보상이 중요하지만 희망 액수는 아직 제시하지 않음.";
  const server = {
    fetchTalentContextPromptSnapshot: async () => ({}),
    buildTalentMemoryRetrievalQuery: () => "compensation",
    renderTalentContextPrompt: () => "No saved facts.",
    fetchTalentContextsByRefs: async () => [],
    createTalentContextMutationRequestId: () => "fixture-request",
    mutateTalentContextsFromAgent: async (args: unknown) => { writes.push(args); return { changedIds: [1] }; },
    refreshTalentContextEmbeddings: async () => {},
  };
  modules._load = function (request, ...rest) {
    if (request === "@/lib/talentOnboarding/server") return server;
    if (request === "@/lib/career/llm") return {
      CAREER_LLM_CONFIG: { insightExtraction: { model: "fixture" } },
      runCareerInsightExtraction: async ({ systemPrompt }: { systemPrompt: string }) => {
        assert.ok(!systemPrompt.includes("covered_onboarding_checklist"));
        return JSON.stringify({ changes: [{ op: "add", collection: "brief", key: "compensation", label: "기대 보상", content: facts }], covered_onboarding_checklist: ["compensation"] });
      },
    };
    return original.call(this, request, ...rest);
  };
  try {
    const { extractAndPersistChatInsights } = await import("./chatInsights");
    const count = await extractAndPersistChatInsights({
      admin: {} as never,
      assistantContent: "원하는 보상 수준은 어느 정도인가요?",
      transcript: [{ role: "user", content: "보상이 중요해요." }],
      buildPrompt: () => buildCareerInsightExtractionOnlyPrompt({}),
      conversationId: "fixture-conversation", userId: "fixture-user", logPrefix: "test",
      scheduleAfter: () => {},
    });
    assert.equal(count, 1);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].changes, [{ op: "add", collection: "brief", key: "compensation", label: "기대 보상", content: facts }]);
    // No coverage functions or DB methods exist in this fixture: any attempt to
    // write semantic progress would fail the real extractor invocation above.
  } finally { modules._load = original; }
});
