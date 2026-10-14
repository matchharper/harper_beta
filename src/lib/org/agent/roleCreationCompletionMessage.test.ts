import assert from "node:assert/strict";
import test from "node:test";
import { splitRoleCreationCompletionSentences } from "./roleCreationCompletionMessage";
import { buildRoleCreationOutcomeSystemPrompt, buildRoleCreationOutcomePrompt } from "./roleCreationPrompt";

test("display chunks preserve every character of model-authored completion", () => {
  const text = "네~ 등록됐어요.\n\nSlack 알림은 보내지 못했어요! 다음 내용을 확인해 주세요.";
  assert.equal(splitRoleCreationCompletionSentences(text).join(""), text);
});

test("outcome prompt is compact verified facts, not authoring or an obligatory CTA", () => {
  const system = buildRoleCreationOutcomeSystemPrompt("slack");
  assert.match(system, /<ux_writing_contract>/);
  assert.doesNotMatch(system, /research_role_description_sources|calibrate_role_hiring_brief/);
  const state = { members: [], assigneeUserIds: [], workspace: { companyName: "Fixture" }, channels: [], metadata: { confirmedSlackChannelIds: [] }, role: { name: "Engineer", status: "active", request: "PRIVATE_CRITERIA" } } as any;
  const prompt = buildRoleCreationOutcomePrompt({ missingFields: [], outcome: "completed", state, slackNotificationDelivered: false });
  assert.match(prompt, /"slackNotificationDelivered": false/);
  assert.doesNotMatch(prompt, /PRIVATE_CRITERIA/);
  assert.match(prompt, /not that a matching worker ran/);
  assert.match(prompt, /"firstCandidateSearch": null/);

  const scheduled = buildRoleCreationOutcomePrompt({
    firstCandidateSearch: { startsAt: "2026-10-16T00:00:00Z", start: "scheduled", startMayBeDelayed: false },
    missingFields: [], outcome: "completed", state, slackNotificationDelivered: true,
  });
  assert.match(scheduled, /"start": "2026년 10월 16일 09:00 KST \(Friday\)"/);
  assert.match(scheduled, /"result": "Candidates are shared only when the search finds someone worth showing/);
});
