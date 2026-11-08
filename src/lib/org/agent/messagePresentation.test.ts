import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOrgChatMessageTime,
  orgAgentReplyAnswersTeamMessage,
} from "@/lib/org/agent/messagePresentation";

const now = new Date(2026, 7, 10, 16, 30);

test("shows only time for messages sent today", () => {
  assert.equal(
    formatOrgChatMessageTime(new Date(2026, 7, 10, 9, 5).toISOString(), now),
    "09:05"
  );
});

test("prefixes yesterday and uses calendar-day distance for older messages", () => {
  assert.equal(
    formatOrgChatMessageTime(new Date(2026, 7, 9, 23, 55).toISOString(), now),
    "어제 23:55"
  );
  assert.equal(
    formatOrgChatMessageTime(new Date(2026, 7, 7, 18, 0).toISOString(), now),
    "3일 전"
  );
});

test("hides invalid message timestamps", () => {
  assert.equal(formatOrgChatMessageTime("not-a-date", now), "");
});

test("thinking time counts only for replies to a team member's message", () => {
  const turn = (trigger: "direct_message" | "web_action" | "candidate_contact") => ({
    agentTurn: { phase: "terminal" as const, runId: "r", sequence: 0, trigger },
  });
  assert.equal(orgAgentReplyAnswersTeamMessage(turn("direct_message")), true);
  assert.equal(orgAgentReplyAnswersTeamMessage(turn("web_action")), false);
  assert.equal(orgAgentReplyAnswersTeamMessage(turn("candidate_contact")), false);
  // A scheduled follow-up carries no turn, only where it came from.
  assert.equal(
    orgAgentReplyAnswersTeamMessage({ source: "agent_contact", scheduleId: "s" } as never),
    false
  );
  assert.equal(
    orgAgentReplyAnswersTeamMessage({ source: "org_agent_web_action", webActionJobId: "j" } as never),
    false
  );
  // Older replies with no such marks keep today's behavior.
  assert.equal(orgAgentReplyAnswersTeamMessage({}), true);
  assert.equal(orgAgentReplyAnswersTeamMessage(undefined), true);
});
