import assert from "node:assert/strict";
import test from "node:test";
import { serializeOrgAgentToolResult } from "./promptFormat";
import { reportOrgAgentIssue } from "./issueReport";
const args = { workspaceId: "workspace", conversationId: "conversation", messageId: 42, actorId: "actor", summary: "이전 안내와 현재 결과가 다릅니다. 확인을 요청합니다." };
test("report uses trusted context, plain text and a stable per-turn delivery key", async () => {
  const sent: any[] = [];
  const send = async (message: any) => { sent.push(message); return { channel: "support", timestamp: "123.456" }; };
  const first = await reportOrgAgentIssue(args, send);
  const repeat = await reportOrgAgentIssue({ ...args, summary: "요약 정리" }, send);
  const next = await reportOrgAgentIssue({ ...args, messageId: 43 }, send);
  assert.equal(first.status, "sent");
  assert.equal(first.slackMessageTs, "123.456");
  assert.equal(first.reportId, repeat.reportId);
  assert.notEqual(first.reportId, next.reportId);
  assert.equal(sent[0].mrkdwn, false);
  assert.ok(sent[0].text.includes(args.summary));
  assert.ok(sent[0].text.includes("Conversation: conversation"));
  assert.equal(sent[0].channel, undefined);
});
test("an unconfirmed delivery stays unknown and is not automatically retried", async () => {
  let calls = 0;
  const result = await reportOrgAgentIssue(args, async () => { calls++; throw Error("private transport diagnostic"); });
  assert.equal(result.status, "unknown"); assert.equal(calls, 1);
  const modelInput = serializeOrgAgentToolResult("report_issue", result);
  assert.ok(modelInput.includes(`response_guidance=${result.responseGuidance}`));
  assert.ok(modelInput.includes("status=unknown"));
  assert.ok(!JSON.stringify(result).includes("private transport diagnostic"));
});
test("invalid summary cannot send", async () => {
  for (const summary of [" ", "x".repeat(2501)]) {
    await assert.rejects(reportOrgAgentIssue({ ...args, summary }, async () => { throw Error("must not call transport"); }), /1-2500/);
  }
});
