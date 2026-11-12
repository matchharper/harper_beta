import assert from "node:assert/strict";
import test from "node:test";
import { admitDeclineNoteAction, declineNote } from "./introductionAction";

test("a decline note is the candidate's own text from the decline form", () => {
  // The picked reason options stay out: only the candidate's own words.
  assert.deepEqual(declineNote(JSON.stringify({ customReason: "  다음에 다시 연락 주세요 ", selectedOptions: ["a", "b"] })),
    { note: "다음에 다시 연락 주세요" });
  assert.deepEqual(declineNote(JSON.stringify({ customReason: null, selectedOptions: ["a"] })), { note: "" });
  assert.deepEqual(declineNote("plain words"), { note: "plain words" });
  assert.deepEqual(declineNote(null), { note: "" });
});

test("a decline note is admitted once as a durable Career request", async () => {
  const calls: any[] = [];
  const admin = { rpc: async (name: string, args: any) => { calls.push([name, args]); return { data: { id: 7 }, error: null }; } };
  const opportunity = { id: "rec-1", roleId: "role-1", feedbackAt: "2026-11-11T01:00:00Z" };
  const message = await admitDeclineNoteAction({ admin, talentId: "talent", conversationId: "conversation", opportunity,
    content: "(Internal) Engineer at Example 제외됨", note: "회사에 감사 인사 전해 주세요" });
  assert.deepEqual(message, { id: 7 });
  const [[name, args]] = calls;
  assert.equal(name, "admit_career_request");
  assert.equal(args.p_message_type, "opportunity_feedback_note");
  assert.equal(args.p_payload.clientRequestId, "decline-note:rec-1:2026-11-11T01:00:00Z");
  assert.deepEqual(args.p_payload.opportunityDecision, { decision: "decline", recommendationId: "rec-1", roleId: "role-1",
    decisionAt: "2026-11-11T01:00:00Z", note: "회사에 감사 인사 전해 주세요" });
});
