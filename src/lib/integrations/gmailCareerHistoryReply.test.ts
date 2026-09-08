import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildGmailCareerHistoryFollowUpInstruction } from "./gmailCareerHistoryReplyCore";

const replySource = readFileSync(
  new URL("./gmailCareerHistoryReply.ts", import.meta.url),
  "utf8"
);

test("builds a concise Gmail completion turn from reliable application records", () => {
  const instruction = buildGmailCareerHistoryFollowUpInstruction([
    {
      appliedAt: "2026-04-02",
      company: "Example Labs",
      endedAt: null,
      role: "Product Engineer",
      summary: "지원 후 인터뷰가 진행되었고 최종 결과는 확인되지 않음.",
    },
    {
      appliedAt: "2025-11-10",
      company: "Sample AI",
      endedAt: "2025-12-01",
      role: null,
      summary: "지원 접수가 확인되었고 이후 불합격 안내를 받음.",
    },
  ]);

  assert.match(instruction, /2 or 3 short, natural sentences/);
  assert.match(instruction, /finished checking/);
  assert.match(instruction, /Example Labs/);
  assert.match(instruction, /Product Engineer/);
  assert.match(instruction, /count="2"/);
  assert.match(instruction, /untrusted data/);
});

test("tells the model how to report an empty but completed review", () => {
  const instruction = buildGmailCareerHistoryFollowUpInstruction([]);

  assert.match(instruction, /did not find enough reliable evidence/);
  assert.match(instruction, /count="0"/);
  assert.match(instruction, /No reliable application history was found/);
});

test("uses the Career chat path without changing conversation state", () => {
  assert.match(
    replySource,
    /assistantModel:\s*CAREER_LLM_CONFIG\.chat\.gmailCareerHistoryFollowUp\.model/
  );
  assert.match(replySource, /allowedToolNames:\s*\[\]/);
  assert.match(replySource, /skipConversationWrites:\s*true/);
  assert.match(replySource, /suppressOnboarding:\s*true/);
});
