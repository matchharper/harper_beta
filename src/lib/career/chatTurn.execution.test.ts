import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readFileSync } from "node:fs";

// Execute the real turn, substituting external reads/provider/writer boundaries.
// A response hydration failure must not strand an already delivered invocation.
function fixture(reply = "Hello") {
  const events: string[] = [];
  let profileReads = 0;
  const source = { id: 1, user_id: "owner", conversation_id: "conversation", role: "user", content: "hi", message_type: "chat", payload: {} };
  const setting = { is_onboarding_done: true, preferred_locale: "ko" };
  const admin: any = { from: () => {
    const q: any = { update: () => { events.push("conversation-updated"); return q; }, eq: () => q,
      then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve) };
    return q;
  } };
  const identity = (value: unknown) => value;
  const empty = async () => null;
  const dependencies: Record<string, any> = {
    withCareerPromptReadCache: (_admin: unknown, _user: string, work: () => unknown) => work(),
    readCareerPromptValue: (_user: string, _key: string, load: () => unknown) => load(),
    stripPostgresUnsafeChars: identity, sanitizeSingleLineDbText: identity,
    readCareerSourceTextChatModel: () => undefined, resolveCareerTextChatModel: () => ({ model: "fixture" }),
    fetchActiveTalentGmailIntegration: empty, fetchRecentMessagesWithSummary: async () => [source],
    getActiveOpportunityRun: empty, fetchTalentCompanyContactContext: empty, readCareerCapabilityCoaching: empty,
    isCareerCapabilityTurn: () => true,
    fetchTalentStructuredProfile: async () => { profileReads++; return { talentUser: {} }; },
    fetchTalentUserProfile: async () => ({}), fetchTalentContextPromptSnapshot: async () => ({ allBriefs: [], memories: [] }),
    buildTalentMemoryRetrievalQuery: () => "", fetchLatestTalentActivityEvent: empty,
    fetchCareerPostOnboardingContext: empty, fetchPendingOpportunityFeedbackPromptContext: empty,
    fetchRecentTalentActivitySummaries: async () => [], fetchRecentRecommendedOpportunitiesForPrompt: async () => [],
    hasActiveConversationCompletedOpportunityRun: async () => false,
    buildTalentProfileContext: () => "unchanged profile", formatRecentRecommendedOpportunitiesForPrompt: () => "",
    projectBriefsToLegacyInsights: () => ({}), renderTalentContextPrompt: () => "unchanged memory",
    getCareerCapabilityMode: () => "progressive", TALENT_INTERVIEW_FINAL_STEP: 10,
    formatTalentMessageContentForLlmPrompt: (row: any) => row.content,
    formatTalentConversationReferencesForLlm: () => "",
    resolveCareerChatTools: () => ({ tools: [], toolNames: [], stopAfterToolNames: [] }),
    normalizeTalentEngagementTypes: () => [], normalizeTalentPeriodicIntervalDays: () => 7,
    normalizeTalentRecommendationBatchSize: () => 10, serializeOpportunityRun: () => null,
    buildCareerConversationPromptPlan: () => ({ isOnboardingActive: false, promptBlocks: [] }),
    prepareCareerAgentTurn: async () => ({ claimId: "claim", replyId: "message:1",
      runtime: { abortSignal: undefined, options: {}, resolveStep: () => undefined },
      getCompletionPayload: () => ({ replyId: "message:1" }),
      complete: async () => { events.push("completed"); }, release: async () => { events.push("released"); },
    }),
    createCareerAssistantMessageWriter: async () => ({ start: async () => null,
      finish: async (content: string) => { events.push("persisted"); return { id: 2, content }; },
      interrupt: async () => null,
    }),
    runCareerChatAssistantStream: async () => reply, runCareerChatAssistant: async () => reply,
    readCareerDelegatedEvents: async () => [], normalizeNoMessageContent: (text: string) => text,
    resolveTalentOnboardingCompletion: () => ({ completed: false }),
    stripTalentOnboardingCompletionMarker: identity, ensureStandalonePostingLinksInText: identity,
    stripOpportunityRunMarkers: identity, stripCareerReengagementActions: identity,
    toTalentMessageResponse: identity, toTalentContextResponse: identity,
    commitDeliveredProcessClosureNotices: async () => { events.push("notices-committed"); },
    fetchTalentSetting: async () => { events.push("response-setting-read"); return setting; },
    fetchAllTalentContexts: async () => { events.push("response-brief-read"); return []; },
    fetchTalentContextsUpdatedAt: async () => { events.push("response-updated-at-read"); return null; },
    hydrateMockInterviewOffers: async (args: any) => { events.push("response-preview-read"); return args.messages; },
    extractPostingRoleIdsFromText: () => [],
    CareerReplyContinuation: class extends Error {},
  };
  const compiledModule = { exports: {} as typeof import("./chatTurn") };
  vm.runInNewContext(ts.transpileModule(readFileSync("src/lib/career/chatTurn.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: compiledModule, exports: compiledModule.exports, crypto: globalThis.crypto, Date,
    console: { ...console, info() {} }, require: () => new Proxy({}, { get: (_, key) => dependencies[String(key)] }),
  });
  const args: any = { admin, userId: "owner", conversationId: "conversation", existingSourceMessage: source,
    initialConversation: { id: "conversation" }, initialSetting: setting, onLiveMessage() {},
    onArtifactMessage: () => events.push("delivered"), scheduleAfter() {},
  };
  return { ...compiledModule.exports, args, events, profileReads: () => profileReads };
}

test("execution-only turn persists and delivers the original reply without hydrating an unused response", async () => {
  const f = fixture();
  assert.equal(await f.executeCareerChatTurn(f.args), undefined);
  for (const event of ["persisted", "delivered", "notices-committed", "conversation-updated", "completed", "released"])
    assert.ok(f.events.includes(event), event);
  assert.ok(!f.events.some(event => event.startsWith("response-")));
  assert.equal(f.profileReads(), 1);
});

test("HTTP callers still receive the fully hydrated response", async () => {
  const f = fixture();
  const result = await f.runCareerChatTurn(f.args);
  assert.equal(result.assistantMessage?.content, "Hello");
  assert.ok(result.talentProfile);
  assert.ok(f.events.includes("response-setting-read"));
  assert.ok(f.events.includes("response-preview-read"));
  assert.equal(f.profileReads(), 2);
});

test("artifact-only execution completes without a response profile read", async () => {
  const f = fixture("");
  assert.equal(await f.executeCareerChatTurn(f.args), undefined);
  assert.ok(f.events.includes("completed"));
  assert.ok(f.events.includes("released"));
  assert.ok(!f.events.some(event => event.startsWith("response-")));
});

for (const branch of ["no-message", "suppressed-delivery"]) test(`${branch} execution completes without hydrating a response`, async () => {
  const f = fixture(branch === "no-message" ? "" : "Hello");
  if (branch === "no-message") f.args.noMessageMarker = "NO_MESSAGE";
  else f.args.shouldInsertAssistantMessage = async () => false;
  assert.equal(await f.executeCareerChatTurn(f.args), undefined);
  assert.ok(f.events.includes("completed"));
  assert.ok(f.events.includes("released"));
  assert.ok(!f.events.some(event => event.startsWith("response-")));
});
