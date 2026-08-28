import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const slackEvents = source("./slackHarperEvents.ts");
const eventsRoute = source("../../app/api/internal/slack/events/route.ts");
const queueConsumer = source(
  "../../app/api/queues/process-slack-turn/route.ts"
);
const turnRoute = source(
  "../../app/api/internal/org-agent/slack-turn/route.ts"
);

test("direct mentions publish a Queue message and leave status ownership to the turn processor", () => {
  assert.match(
    slackEvents,
    /triggerKind = "mention"[\s\S]*queued: true/
  );
  assert.match(eventsRoute, /await publishHarperSlackEvent\(body\)/);
  assert.doesNotMatch(eventsRoute, /after\(/);
  assert.doesNotMatch(queueConsumer, /setHarperSlackThreadStatus/);
  assert.doesNotMatch(queueConsumer, /setLoadingStatus\(loadingStatus\)/);
  assert.match(turnRoute, /status: responseStatus/);
});

test("each unresolved Slack turn primes status before workspace access checks", () => {
  const earlyStatus = turnRoute.indexOf("shouldPrimeSlackStatus");
  const accessCheck = turnRoute.indexOf(
    "const slackAccess = await resolveHarperSlackWorkspaceAccess",
    earlyStatus
  );
  assert.ok(earlyStatus >= 0);
  assert.ok(accessCheck > earlyStatus);
});

test("thread replies keep one status through routing and generation", () => {
  const initialStatus = turnRoute.indexOf("status: responseStatus");
  const routing = turnRoute.indexOf(
    "routingDecision = await decideHarperSlackThreadReply"
  );
  const clearIgnored = turnRoute.indexOf(
    '"[org-agent/slack-turn:clear-routing-status]"'
  );

  assert.ok(initialStatus >= 0);
  assert.ok(routing > initialStatus);
  assert.ok(clearIgnored > routing);
  assert.doesNotMatch(turnRoute, /메시지 확인 중/);
  assert.doesNotMatch(turnRoute, /pendingSlackStatusStage/);
});

test("tool progress does not replace the stable Slack thread status", () => {
  assert.doesNotMatch(turnRoute, /event === "tool_status"/);
  assert.doesNotMatch(turnRoute, /slackStatusUpdateChain/);
  assert.doesNotMatch(
    turnRoute,
    /\[tool명\]|toolName.*setHarperSlackThreadStatus/
  );
});
