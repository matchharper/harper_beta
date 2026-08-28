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

test("direct mentions publish a Queue message and prime status in the consumer", () => {
  assert.match(
    slackEvents,
    /triggerKind === "mention"[\s\S]*botTokenCiphertext[\s\S]*threadTs/
  );
  assert.match(eventsRoute, /await publishHarperSlackEvent\(body\)/);
  assert.doesNotMatch(eventsRoute, /after\(/);
  assert.match(queueConsumer, /setHarperSlackThreadStatus/);
  assert.match(queueConsumer, /await setLoadingStatus\(loadingStatus\)/);
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

test("thread replies are visible while routing, then switch or clear deterministically", () => {
  const checkingStatus = turnRoute.indexOf('status: isRoutingThreadReply ? "메시지 확인 중" : responseStatus');
  const routing = turnRoute.indexOf("routingDecision = await decideHarperSlackThreadReply");
  const clearIgnored = turnRoute.indexOf('"[org-agent/slack-turn:clear-routing-status]"');
  const respondStatus = turnRoute.indexOf('status: responseStatus', clearIgnored);

  assert.ok(checkingStatus >= 0);
  assert.ok(routing > checkingStatus);
  assert.ok(clearIgnored > routing);
  assert.ok(respondStatus > clearIgnored);
  assert.match(
    turnRoute,
    /if \(pendingSlackStatusStage === "checking" && pendingSlackStatus\)[\s\S]*status: responseStatus/
  );
});

test("long tool work updates the Slack thread status with human progress labels", () => {
  assert.match(turnRoute, /event === "tool_status"/);
  assert.match(turnRoute, /id !== "context"/);
  assert.match(turnRoute, /status === "running" \? label : "답변 작성 중"/);
  assert.match(
    turnRoute,
    /await slackStatusUpdateChain;[\s\S]*postHarperSlackMessage/
  );
  assert.doesNotMatch(turnRoute, /\[tool명\]|toolName.*setHarperSlackThreadStatus/);
});
