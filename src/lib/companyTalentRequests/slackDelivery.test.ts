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
  assert.match(deliveryRoute, /sendHarperWorkspaceSlackMessage\(\{/);
  assert.match(deliveryRoute, /recordConversationMessage: false/);
  assert.match(deliveryRoute, /roleId: request\.role_id/);
});
