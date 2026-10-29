import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInternalOpportunityCallWrapupInstruction,
  buildInternalOpportunityRealtimeInstruction,
} from "./lifecyclePrompts";
import { buildLiveFrontendInstructions } from "../../voiceSessionInstructions";
import { buildLiveSessionUpdateEvents } from "../../liveSessionUpdates";

const callRequest = {
  companyLogoUrl: null,
  companyName: "Fixture Robotics",
  createdAt: "2026-10-28T00:00:00.000Z",
  id: "call-1",
  opportunityId: "opportunity-1",
  preferredLocale: "ko",
  questions: ["고객 현장 배포 경험을 알려주세요.", "협업 경험을 알려주세요."],
  questionAnswers: { "1": "답하고 싶지 않아요." },
  reason: null,
  resumePromptNeeded: false,
  roleId: "role-1",
  roleTitle: "Engineer",
  status: "active",
  updatedAt: "2026-10-28T00:01:00.000Z",
};

test("the speaking model receives the actual company, role, full questions and saved responses", () => {
  const context = buildInternalOpportunityRealtimeInstruction(callRequest);
  const instructions = buildLiveFrontendInstructions({
    initialResponseInstruction: "Begin the call.",
    responseLocale: "ko",
    internalCallContext: context,
  });
  assert.ok(instructions.includes(context));
  for (const fact of [
    callRequest.companyName,
    callRequest.roleTitle,
    ...callRequest.questions,
    callRequest.questionAnswers["1"],
  ])
    assert.ok(instructions.includes(fact));
  assert.ok(instructions.includes("record_call_answers"));
  assert.ok(instructions.includes("end_call"));
});

test("saved answers update both models; a delayed transcript cannot roll progress back", () => {
  const previous = {
    callId: callRequest.id,
    revision: callRequest.updatedAt,
    text: buildInternalOpportunityRealtimeInstruction(callRequest),
  };
  const next = {
    ...previous,
    revision: "2026-10-28T00:02:00.000Z",
    text: buildInternalOpportunityRealtimeInstruction({
      ...callRequest,
      questionAnswers: { "1": "답하고 싶지 않아요.", "2": "잘 모르겠어요." },
    }),
  };
  const update = {
    instructions: "Updated backend instructions",
    onboardingContext: null,
    internalCallContext: next,
  };
  const events = buildLiveSessionUpdateEvents(update, null, "update", previous);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "session.update");
  assert.equal(events[1].type, "session.thinking.append");
  assert.ok(
    String(events[1].content).includes("Recorded response: 잘 모르겠어요.")
  );
  assert.deepEqual(
    buildLiveSessionUpdateEvents(
      { ...update, internalCallContext: previous },
      null,
      "late",
      next
    ),
    []
  );
  assert.equal(
    buildLiveSessionUpdateEvents(update, null, "duplicate", next).length,
    1
  );
});

test("an interrupted call preserves responses without claiming unrecorded questions were answered", () => {
  const prompt = buildInternalOpportunityCallWrapupInstruction({
    callRequest,
    questionsComplete: false,
    callNoteCreated: true,
    durationLabel: "1분",
    transcript: [],
    preferredLocale: "ko",
  });
  assert.ok(prompt.includes("optional request stays open"));
  assert.ok(prompt.includes("Recorded response: 답하고 싶지 않아요."));
  assert.ok(prompt.includes("successfully saved"));
});
