import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const slackTurnRoute = source(
  "../../app/api/internal/org-agent/slack-turn/route.ts"
);
const interactivityRoute = source(
  "../../app/api/internal/slack/interactivity/route.ts"
);

test("Slack membership is checked before routing or company-side LLM execution", () => {
  const accessCheck = slackTurnRoute.indexOf(
    "resolveHarperSlackWorkspaceAccess({"
  );
  const routing = slackTurnRoute.indexOf("decideHarperSlackThreadReply(");
  const companySideLlm = slackTurnRoute.indexOf("runOrgAgentChat({");

  assert.ok(accessCheck >= 0);
  assert.ok(routing > accessCheck);
  assert.ok(companySideLlm > accessCheck);
  assert.match(slackTurnRoute, /postHarperSlackAccessDenied\(\{/);
  assert.match(
    slackTurnRoute,
    /lastError: `slack_access_denied:\$\{denialReason\}`/
  );
});

test("Slack choice buttons check membership before enqueueing a new turn", () => {
  const accessCheck = interactivityRoute.indexOf(
    "resolveHarperSlackWorkspaceAccess({"
  );
  const enqueue = interactivityRoute.indexOf(
    '"enqueue_slack_button_choice_v1"'
  );

  assert.ok(accessCheck >= 0);
  assert.ok(enqueue > accessCheck);
  assert.match(interactivityRoute, /status: "access_denied"/);
});

test("role quick actions replace their buttons instead of posting a proxy prompt", () => {
  assert.match(
    interactivityRoute,
    /p_slack_message_ts: sourceMessageTs[\s\S]*p_trigger_kind: "button_choice"/
  );
  assert.match(
    interactivityRoute,
    /actionBlockPrefixes: \[HARPER_ROLE_QUICK_ACTION_BLOCK_ID\]/
  );
  assert.match(interactivityRoute, /messageTs: sourceMessageTs/);
  assert.doesNotMatch(interactivityRoute, /님이 요청했어요/);
});
