import assert from "node:assert/strict";
import test from "node:test";
import { guardOrgAgentCandidatePrivacyReply } from "@/lib/org/agent/responseGuard";

test("compensation questions cannot receive model-authored stored amounts", () => {
  const reply = guardOrgAgentCandidatePrivacyReply({
    reply: "후보자의 현재 연봉은 1억 2천만 원입니다.",
    toolResults: [],
    userMessage: "이 사람 현재 연봉이 얼마예요?",
  });

  assert.equal(reply.includes("1억"), false);
  assert.equal(reply.includes("후보자분께 확인"), true);
});

test("a scoped contact tool result keeps the server-authored terminal reply", () => {
  const reply = guardOrgAgentCandidatePrivacyReply({
    reply: "후보자분께 확인 요청을 보냈습니다.",
    toolResults: [{ name: "contact_talent", status: "success" }],
    userMessage: "희망 연봉을 물어봐줘.",
  });

  assert.equal(reply, "후보자분께 확인 요청을 보냈습니다.");
});

test("open-only evidence cannot be strengthened into active preference", () => {
  const reply = guardOrgAgentCandidatePrivacyReply({
    preferenceDisclosure: {
      attempted: true,
      evidence: ["초기 스타트업에도 열려 있습니다."],
    },
    reply: "후보자분은 초기 스타트업을 적극적으로 찾고 있습니다.",
    toolResults: [],
    userMessage: "작은 스타트업인 걸 알고 오케이한 거야?",
  });

  assert.equal(reply.includes("적극적으로 찾고 있습니다"), false);
  assert.equal(reply.includes("확답하기 어려워요"), true);
});

test("negative preference evidence is never relayed directly", () => {
  const reply = guardOrgAgentCandidatePrivacyReply({
    preferenceDisclosure: {
      attempted: true,
      evidence: ["작은 회사는 원하지 않습니다."],
    },
    reply: "후보자분은 작은 회사를 원하지 않는다고 했습니다.",
    toolResults: [],
    userMessage: "작은 회사도 괜찮대?",
  });

  assert.equal(reply.includes("원하지 않는다고"), false);
  assert.equal(reply.includes("확답하기 어려워요"), true);
});
