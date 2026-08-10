import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const webRoute = source("../../../app/api/org/agent/chat/route.ts");
const slackRoute = source(
  "../../../app/api/internal/org-agent/slack-turn/route.ts"
);
const companySideLlm = source("./chat.ts");
const webAdapter = source("../../../hooks/org/useOrgAgent.ts");

test("web and Slack keep one company-side LLM execution and persistence path", () => {
  assert.match(webRoute, /runOrgAgentChat\(\{ \.\.\.args, emit \}\)/);
  assert.match(slackRoute, /const result = await runOrgAgentChat\(\{/);
  assert.match(slackRoute, /messageType: "slack"/);
  assert.match(slackRoute, /slackThreadId: thread\.id/);
  assert.match(
    companySideLlm,
    /readAudience: args\.slackThreadId \? "company_safe" : "caller"/
  );
  assert.match(companySideLlm, /insertOrgAgentMessage\(\{/);
});

test("progressive rendering remains a web-only presentation adapter", () => {
  assert.match(webAdapter, /splitChatTextDeltaForReveal/);
  assert.match(webAdapter, /waitForChatTextReveal/);
  assert.doesNotMatch(slackRoute, /splitChatTextDeltaForReveal/);
});
