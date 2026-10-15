import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCompanyTalentRelaySlackDestination } from "./slackDelivery";

const deliveryRoute = readFileSync(
  new URL(
    "../../app/api/internal/company-talent-requests/deliver/route.ts",
    import.meta.url
  ),
  "utf8"
);

test("uses the exact Slack thread that originated the company request", () => {
  assert.deepEqual(
    getCompanyTalentRelaySlackDestination("source-thread"),
    { kind: "thread", threadId: "source-thread" }
  );
});

test("uses current Role notification channels for web requests", () => {
  assert.deepEqual(
    getCompanyTalentRelaySlackDestination(" "),
    { kind: "workspace" }
  );
});

test("wires web relays to Slack without duplicating the /org message", () => {
  const sharedDelivery = readFileSync(new URL("../org/agent/contactEvent.server.ts", import.meta.url), "utf8");
  assert.match(deliveryRoute, /deliverCompanyTalentRelay/);
  assert.doesNotMatch(deliveryRoute, /sendHarperWorkspaceSlackMessage\(/);
  assert.match(sharedDelivery, /sendHarperWorkspaceSlackMessage\(\{/);
  assert.match(sharedDelivery, /recordConversationMessage: false/);
  assert.match(sharedDelivery, /roleId: args\.roleId/);
});
