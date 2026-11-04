import assert from "node:assert/strict";
import test from "node:test";
import { createTalentOpportunityFeedbackFollowUpReply } from "./historyActionReply";
import { careerFeedbackReplyId, formatSavedOpportunityDecision, CAREER_FEEDBACK_SILENT } from "./opportunityFeedbackEvent";
import { CareerAgentReplyUnavailable } from "./agentReplyError";
import { CareerReplyContinuation } from "./capabilities/runtime";

const opportunity: any = { id: "recommendation", roleId: "role", title: "Engineer", companyName: "Example", sourceType: "internal", opportunityType: "internal", feedback: "positive", feedbackAt: "2026-10-30T03:00:00Z", feedbackReason: null, isAccepted: true, savedStage: "connected", isExpired: false, recommendationSummary: "Public role", recommendationReasons: [], acceptanceMaterial: { materialId: "material", assignmentRevision: 3 } };
const item = { action: "positive" as const, createdAt: opportunity.feedbackAt, eventId: "event", summary: 'User liked internal opportunity "Engineer" at "Example".' };
function harness(overrides: Record<string, unknown> = {}, record = opportunity) {
  const calls: any[] = [];
  const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "conversation" }, error: null }) };
  const args: any = { admin: { from: () => query }, conversationId: "conversation", userId: "owner", opportunityId: record.id, action: "positive", trigger: "immediate_internal_feedback" };
  const deps: any = { pending: async () => [item], setting: async () => ({ preferred_locale: "ko" }), opportunities: async () => [record], latestUser: async () => 1, userAfter: async () => false, run: async (turn: any) => { calls.push(turn); return { assistantMessage: { content: "Saved" } }; }, dispatch: async () => ({ waiting: false }), defer: async () => false, ...overrides };
  return { args, deps, calls, run: () => createTalentOpportunityFeedbackFollowUpReply(args, deps) };
}

for (const sourceType of ["internal", "external"]) {
  for (const feedback of ["positive", "negative"]) test(`${sourceType} ${feedback} button uses original Career runtime with saved facts and all capabilities`, async () => {
    const h = harness({}, { ...opportunity, sourceType, feedback });
    await h.run(); const turn = h.calls[0];
    assert.equal(turn.assistantModel, sourceType === "external" ? "claude-haiku-5-5" : undefined); assert.equal(turn.allowedToolNames, undefined);
    assert.equal(turn.assistantOpenAIResponsesReasoningEffort, undefined);
    const meaning = feedback === "negative" ? "declined" : sourceType === "internal" ? "introduction accepted" : "interested in external posting";
    assert.ok(turn.proactiveContext.includes(`Saved decision: ${meaning}`));
    assert.ok(turn.proactiveContext.includes("2026-10-30 12:00"));
    assert.equal(turn.noMessageMarker, CAREER_FEEDBACK_SILENT);
    assert.ok(turn.onAgentCheckpoint); assert.equal(await turn.shouldInsertAssistantMessage(), true);
  });
}

test("a forged/stale positive request cannot replace the actual saved rejection", async () => {
  const h = harness({ pending: async () => [] }, { ...opportunity, feedback: "negative", feedbackReason: "여긴 안 갈래" });
  await h.run(); assert.ok(h.calls[0].proactiveContext.includes("Saved decision: declined"));
  assert.ok(h.calls[0].proactiveContext.includes("여긴 안 갈래"));
});

test("an undecided recommendation cannot create an event from a client-supplied acceptance", async () => {
  const h = harness({ pending: async () => [] }, { ...opportunity, feedback: null, feedbackAt: null });
  assert.equal(await h.run(), null); assert.equal(h.calls.length, 0);
});

test("a newer user message suppresses automatic reply; an in-flight reply rechecks its cursor", async () => {
  const h = harness({ userAfter: async () => true }); assert.equal(await h.run(), null); assert.equal(h.calls.length, 0);
  let cursor = 1; const later = harness({ latestUser: async () => cursor }); await later.run(); cursor = 2;
  assert.equal(await later.calls[0].shouldInsertAssistantMessage(), false);
});

test("same button and compatibility retry retain identity; a later decision is a different turn", async () => {
  const original = careerFeedbackReplyId("conversation", opportunity, [item]);
  assert.equal(original, careerFeedbackReplyId("conversation", opportunity, []));
  assert.notEqual(original, careerFeedbackReplyId("conversation", { ...opportunity, feedbackAt: "2026-10-31T03:00:00Z" }, [item]));
  const h = harness({ run: async () => { throw new CareerAgentReplyUnavailable(original, true); } }); assert.equal(await h.run(), null);
});

test("child work and a busy conversation preserve the event rather than launch a second writer", async () => {
  const h = harness({ run: async () => { throw new CareerReplyContinuation({} as any); } }); assert.equal(await h.run(), null);
  let queued: any; const busy = harness({ run: async () => { throw new CareerAgentReplyUnavailable("busy", false); }, defer: async (_e: unknown, job: any) => { queued = job; return true; } });
  assert.equal(await busy.run(), null); assert.ok(queued.proactiveContext.includes("Saved decision: introduction accepted"));
  assert.equal(queued.noMessageMarker, CAREER_FEEDBACK_SILENT);
});

test("button replies and busy retries retain the selected text model", async () => {
  const h = harness();
  h.args.textChatModel = "claude-sonnet-5-5";
  await h.run();
  assert.equal(h.calls[0].textChatModel, "claude-sonnet-5-5");
  let queued: any;
  const busy = harness({ run: async () => { throw new CareerAgentReplyUnavailable("busy", false); }, defer: async (_error: unknown, job: any) => { queued = job; return true; } });
  busy.args.textChatModel = "z-ai/glm-5.3-flash";
  await busy.run();
  assert.equal(queued.textChatModel, "z-ai/glm-5.3-flash");
});

test("saved material and progress are factual projections rather than raw objects", () => {
  const text = formatSavedOpportunityDecision({ ...opportunity, internalProgress: { code: "shared", message: "회사 전달 완료. 답변 없음." } });
  assert.ok(text.includes("material; assignment revision 3")); assert.ok(text.includes("회사 전달 완료. 답변 없음."));
  assert.ok(!text.includes('"feedbackAt"'));
});

test("external feedback keeps its Haiku override through busy retries, including the cleared-list trigger", async () => {
  for (const trigger of ["delayed_external_feedback", "all_recommended_opportunities_cleared"]) {
    let queued: any;
    const h = harness({ defer: async (_error: unknown, job: any) => { queued = job; return true; } }, { ...opportunity, sourceType: "external" });
    h.args.trigger = trigger;
    h.args.textChatModel = "claude-sonnet-5-5";
    await h.run();
    assert.equal(h.calls[0].assistantModel, "claude-haiku-5-5");
    h.deps.run = async () => { throw new CareerAgentReplyUnavailable("busy", false); };
    await h.run();
    assert.equal(queued.assistantModel, "claude-haiku-5-5");
  }
});

test("untargeted external feedback uses Haiku without overriding a known internal opportunity", async () => {
  const h = harness({ opportunities: async () => [] });
  h.args.trigger = "delayed_external_feedback";
  await h.run();
  assert.equal(h.calls[0].assistantModel, "claude-haiku-5-5");
  const internal = harness();
  internal.args.trigger = "delayed_external_feedback";
  await internal.run();
  assert.equal(internal.calls[0].assistantModel, undefined);
});
