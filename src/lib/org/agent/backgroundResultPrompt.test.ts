import assert from "node:assert/strict";
import test from "node:test";
import { buildOrgAgentBackgroundResultMessages } from "@/lib/org/agent/backgroundResultPrompt";

test("background results retain the complete company-side system prompt", () => {
  const systemPrompt = [
    "# MOST IMPORTANT",
    "Speak like a real person.",
    "## Tool Policy",
    "## Pipeline Management",
  ].join("\n");
  const messages = buildOrgAgentBackgroundResultMessages({
    companyName: "Example",
    requestMessage: "지금 기준으로 한번 찾아봐줘.",
    resultText: "- 당장 소개할 사람을 고르지 못했다.",
    roleId: "role-1",
    roleName: "Product Engineer",
    systemPrompt,
  });

  assert.equal(messages[0]?.content, systemPrompt);
  assert.match(messages[0]?.content ?? "", /## Pipeline Management/);
  assert.equal(messages[1]?.role, "user");
});

test("background results preserve the original user turn and arrive as a fresh tool result", () => {
  const messages = buildOrgAgentBackgroundResultMessages({
    companyName: "Example",
    requestMessage: "지금 기준으로 한번 찾아봐줘.",
    resultText:
      "- 바로 소개할 사람은 고르지 못했다.\n- 잘 맞는 사람이 전혀 없다는 뜻은 아니다.",
    roleId: "role-1",
    roleName: "Product Engineer",
    systemPrompt: "full company-side instructions",
  });

  assert.match(messages[1]?.content ?? "", /지금 기준으로 한번 찾아봐줘/);
  assert.match(messages[1]?.content ?? "", /role=Product Engineer/);
  assert.equal(messages[2]?.role, "assistant");
  assert.equal(
    messages[2]?.tool_calls?.[0]?.function.name,
    "request_matching_search"
  );
  assert.equal(messages[3]?.role, "tool");
  assert.match(messages[3]?.content ?? "", /verified facts, not a draft/);
  assert.match(messages[3]?.content ?? "", /잘 맞는 사람이 전혀 없다는 뜻/);
});
