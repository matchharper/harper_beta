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
const roleCreationLlm = source("./roleCreationChat.ts");
const webAdapter = source("../../../hooks/org/useOrgAgent.ts");

test("web and Slack share company-side LLM execution and persistence paths by mode", () => {
  assert.match(webRoute, /await runOrgRoleCreationChat\(roleCreationArgs\)/);
  assert.match(webRoute, /await runOrgAgentChat\(args\)/);
  assert.match(webRoute, /runOrgAgentChat\(\{ \.\.\.args, emit \}\)/);
  assert.match(
    slackRoute,
    /draftRoleCreation\s*\? await runOrgRoleCreationChat\(\{/
  );
  assert.match(slackRoute, /: await runOrgAgentChat\(\{/);
  assert.match(slackRoute, /messageType: "slack"/);
  assert.match(slackRoute, /slackThreadId: thread\.id/);
  assert.match(
    companySideLlm,
    /readAudience: args\.slackThreadId \? "company_safe" : "caller"/
  );
  assert.match(companySideLlm, /insertOrgAgentMessage\(\{/);
  assert.match(roleCreationLlm, /insertOrgAgentMessage\(\{/);
});

test("progressive rendering remains a web-only presentation adapter", () => {
  assert.match(webAdapter, /splitChatTextDeltaForReveal/);
  assert.match(webAdapter, /waitForChatTextReveal/);
  assert.doesNotMatch(slackRoute, /splitChatTextDeltaForReveal/);
});
