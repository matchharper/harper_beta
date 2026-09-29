import assert from "node:assert/strict";
import test from "node:test";
import { generateCandidateContactDraft, reviseCandidateContactDraft } from "./copy";

test("cancelled contact authoring never calls a provider or a fallback", async () => {
  const controller = new AbortController();
  const reason = new Error("Turn cancelled");
  controller.abort(reason);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("Network forbidden"); };
  try {
    const shared = { currentInstruction: "합성 연락", locale: "ko", profileUrl: null,
      recentConversation: "", requestId: "synthetic", signal: controller.signal };
    await assert.rejects(generateCandidateContactDraft({ ...shared,
      candidateName: "가상 인물", companyName: "가상 회사", roleName: "Backend",
      requestContext: "진행 시점 문의" }), (e) => e === reason);
    await assert.rejects(reviseCandidateContactDraft({ ...shared,
      current: { subject: "제목", body: "본문", requestContext: "시점 문의" },
      editInstruction: "이번 주로 수정" }), (e) => e === reason);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test("in-flight cancellation aborts the provider without starting fallback", async () => {
  const controller = new AbortController();
  const original = globalThis.fetch;
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-only";
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.ok(init?.signal, "Provider must receive the turn cancellation signal");
    controller.abort(new Error("Turn cancelled in flight"));
    init.signal.throwIfAborted();
    throw Error("Cancelled fetch cannot succeed");
  };
  try {
    await assert.rejects(generateCandidateContactDraft({
      currentInstruction: "합성 연락", locale: "ko", profileUrl: null,
      recentConversation: "", requestId: "synthetic", signal: controller.signal,
      candidateName: "가상 인물", companyName: "가상 회사", roleName: "Backend", requestContext: "진행 시점 문의",
    }), /Turn cancelled in flight/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});
