import assert from "node:assert/strict";
import test from "node:test";
import { resolveCareerRequestTextChatModel } from "./requestTextChatModel";
import { CAREER_TEXT_CHAT_MODEL_HEADER, DEFAULT_CAREER_TEXT_CHAT_MODEL } from "./textChatModelConfig";

test("the shared request header and legacy chat field preserve the model authorization boundary", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousEnvironment = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    const feedbackRequest = new Request("http://localhost/api/talent/opportunities/feedback-followup", {
      headers: { [CAREER_TEXT_CHAT_MODEL_HEADER]: "claude-sonnet-5-5" },
    });
    assert.equal(resolveCareerRequestTextChatModel(feedbackRequest, { email: "dev@matchharper.com" }).model, "claude-sonnet-5-5");
    assert.equal(resolveCareerRequestTextChatModel(feedbackRequest, { email: "user@example.com" }).model, DEFAULT_CAREER_TEXT_CHAT_MODEL);
    const request = new Request("http://localhost/api/talent/chat");
    assert.equal(resolveCareerRequestTextChatModel(request, { email: "dev@matchharper.com" }, "claude-haiku-5-5").model, "claude-haiku-5-5");
    assert.equal(resolveCareerRequestTextChatModel(request, { email: "dev@matchharper.com" }, "invalid").model, DEFAULT_CAREER_TEXT_CHAT_MODEL);
  } finally {
    if (previousEnvironment === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousEnvironment;
  }
});
