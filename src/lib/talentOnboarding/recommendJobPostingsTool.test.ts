import assert from "node:assert/strict";
import test from "node:test";
import { getOpenAIChatTools, executeTalentTool } from "./tools";

test("opportunity discovery uses general search and never restores legacy instant or bulk tools", async () => {
  const names = getOpenAIChatTools("chat").map(tool => tool.function.name);
  assert.ok(names.includes("search_opportunities"));
  assert.ok(!names.includes("recommend_job_postings"));
  await assert.rejects(executeTalentTool({ name: "recommend_job_postings", input: { kind: "instant" }, context: { userId: "owner" }, logging: false }), /Unknown talent tool/);
});
