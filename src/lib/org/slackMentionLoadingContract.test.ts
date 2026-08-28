import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const slackEvents = source("./slackHarperEvents.ts");
const eventsRoute = source("../../app/api/internal/slack/events/route.ts");
const turnRoute = source(
  "../../app/api/internal/org-agent/slack-turn/route.ts"
);

test("direct mentions publish a loading status without waiting for worker polling", () => {
  assert.match(
    slackEvents,
    /triggerKind === "mention"[\s\S]*botTokenCiphertext[\s\S]*threadTs/
  );
  assert.match(
    eventsRoute,
    /after\(async \(\) => \{[\s\S]*setHarperSlackThreadStatus/
  );
});

test("the direct respond path primes status before workspace access checks", () => {
  const earlyStatus = turnRoute.indexOf("shouldPrimeDirectMentionStatus");
  const accessCheck = turnRoute.indexOf(
    "const slackAccess = await resolveHarperSlackWorkspaceAccess",
    earlyStatus
  );
  assert.ok(earlyStatus >= 0);
  assert.ok(accessCheck > earlyStatus);
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
