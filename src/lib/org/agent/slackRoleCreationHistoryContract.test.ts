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
const slackTurnRoute = source(
  "../../../app/api/internal/org-agent/slack-turn/route.ts"
);

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

test("selected source messages and files are durably transferred before the automatic role turn", () => {
  const sourceBoundary = slackRoleCreation.indexOf(
    '.lte("id", args.sourceCurrentMessageId)'
  );
  const selectedCount = slackRoleCreation.indexOf(
    ".limit(args.contextMessageCount)"
  );
  const copiedMessage = slackRoleCreation.indexOf(
    'source: "org_role_creation_slack_bootstrap_context"'
  );
  const enqueue = slackRoleCreation.indexOf('p_trigger_kind: "thread_reply"');

  assert.ok(sourceBoundary >= 0);
  assert.ok(selectedCount > sourceBoundary);
  assert.ok(copiedMessage > selectedCount);
  assert.ok(enqueue > copiedMessage);
  assert.match(slackRoleCreation, /roleCreationAttachments: attachments/);
  assert.match(
    slackRoleCreation,
    /sourceMessageId: Number\(sourceMessage\.id\)/
  );
});

test("the bootstrap job always runs the role-creation LLM and survives a quick follow-up", () => {
  assert.match(
    slackTurnRoute,
    /clean\(job\.slack_event_id\)\.startsWith\([\s\S]*"role_creation_bootstrap:"/
  );
  assert.match(
    slackTurnRoute,
    /isRoleCreationBootstrap[\s\S]*roleCreationAttachments[\s\S]*runOrgRoleCreationChat\(\{/
  );
  assert.match(
    slackTurnRoute,
    /batchedPrompt !== prompt[\s\S]*slackRoleCreationBootstrap: \{ isCurrent: true \}[\s\S]*batchedPrompt\.startsWith/
  );
});
