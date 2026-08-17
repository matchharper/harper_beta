import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const store = source("./store.ts");
const slack = source("../slackHarper.ts");
const slackEvents = source("../slackHarperEvents.ts");
const slackRoleCreation = source("./slackRoleCreation.ts");

test("role creation history returns web and Slack messages from one conversation", () => {
  assert.match(
    store,
    /args\.mode === "role_creation"[\s\S]*query\.in\("message_type", \["chat", "slack"\]\)/
  );
  assert.match(
    slack,
    /ensureSlackConversation\(\{[\s\S]*roleId: args\.roleId,[\s\S]*workspaceId: args\.workspaceId/
  );
  assert.match(
    slackEvents,
    /storeHarperSlackThreadEvent\(\{[\s\S]*roleId: draftRoleCreation\?\.roleId/
  );
});

test("the initial Harper Slack messages are persisted before the first user reply", () => {
  assert.match(slackRoleCreation, /source: "org_role_creation_slack_start"/);
  assert.match(slackRoleCreation, /source: "org_role_creation_slack_intro"/);
});
