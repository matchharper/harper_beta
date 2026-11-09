import assert from "node:assert/strict";
import test from "node:test";
import { appendCareerExecutionObservation, captureCareerExecution, renderCareerExecutionHistory } from "./executionHistory";
import { formatTalentMessageContentForLlmPrompt } from "./opportunityFeedbackNote";
import type { CareerReplyCheckpoint } from "./capabilities/runtime";

test("completed browser facts stay with their tool call and survive the next user turn", () => {
  for (const transport of ["chat", "anthropic"] as const) {
    const pending = { callId: "browser-call", name: "use_browser", successful: true,
      execution: captureCareerExecution({ action: "run", session_id: "existing-session" }, { modelOutput: "Execution run-1 is pending", internal: "omit raw data" }) };
    const messages = transport === "chat" ? [{ role: "tool", tool_call_id: "browser-call", content: "Execution run-1 is pending" }]
      : [{ role: "user", content: [{ type: "tool_result", tool_use_id: "browser-call", content: "Execution run-1 is pending" }] }];
    const checkpoint = { transport, messages, record: { toolResults: [pending] } } as CareerReplyCheckpoint;
    const updated = appendCareerExecutionObservation(checkpoint, "browser-call", "Required questions: phone, privacy consent. Prepared, not submitted.");
    assert.equal(updated.messages.length, 1, "no synthetic user turn is appended");
    assert.match(JSON.stringify(updated.messages[0]), /Required questions/);
    assert.deepEqual(checkpoint.messages, messages, "the durable prior observation is not mutated");
    const payload = { agentTurn: { record: updated.record } };
    const history = renderCareerExecutionHistory(payload);
    assert.match(history, /existing-session/);
    assert.match(history, /pending/);
    assert.match(history, /Required questions/);
    assert.doesNotMatch(history, /omit raw data/);
    const providerInput = formatTalentMessageContentForLlmPrompt({ role: "assistant", content: "질문을 확인했어요.", payload });
    assert.match(providerInput, /Prepared, not submitted/);
    assert.match(providerInput, /질문을 확인했어요/);
  }
});
