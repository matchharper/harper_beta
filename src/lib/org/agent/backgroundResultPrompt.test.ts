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

test("only the first delivered company-first result receives onboarding writing guidance", () => {
  const first = buildOrgAgentBackgroundResultMessages({
    companyName: "Example",
    firstCompanyFirstResultDelivery: true,
    requestMessage: "후보를 찾아줘",
    resultText: "- 확인된 결과",
    roleId: "role-1",
    roleName: "Engineer",
    systemPrompt: "base instructions",
  });
  const later = buildOrgAgentBackgroundResultMessages({
    companyName: "Example",
    requestMessage: "후보를 찾아줘",
    resultText: "- 확인된 결과",
    roleId: "role-1",
    roleName: "Engineer",
    systemPrompt: "base instructions",
  });
  assert.match(first[0]?.content ?? "", /Prioritize compensation/);
  assert.equal(later[0]?.content, "base instructions");
});

test("scheduled capacity update does not impersonate a company search request", () => {
  const messages = buildOrgAgentBackgroundResultMessages({
    companyName: "Example", requestedByCompany: false,
    requestMessage: "unrelated old company message",
    resultText: "- 이번 검색은 후보자 선추천만 중단. 연결 대기 14명, 상한 10명.",
    roleId: "role-1", roleName: "Engineer", systemPrompt: "full company-side instructions",
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0]!.content, /scheduled matching update/);
  assert.match(messages[1]!.content, /연결 대기 14명/);
  assert.ok(messages.every(message => !message.tool_calls));
  assert.ok(messages.every(message => !message.content.includes("unrelated old company message")));
});
