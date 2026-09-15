import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const execution = readFileSync(
  new URL("./toolExecution.ts", import.meta.url),
  "utf8"
);
const state = readFileSync(
  new URL("./roleCreationState.ts", import.meta.url),
  "utf8"
);

test("general company-side draft activation reuses the guarded completion path", () => {
  const draftBranch = execution.slice(
    execution.indexOf("if (draftActivation)"),
    execution.indexOf('if (status === "deleted")')
  );
  const notificationSave = draftBranch.indexOf("setRoleCreationNotification");
  const readinessCheck = draftBranch.indexOf("getRoleCreationMissingFields");
  const guardedCompletion = draftBranch.indexOf(
    '"complete_company_role_creation_v1"'
  );
  const completionMetadata = draftBranch.indexOf(
    "updateRoleCreationConversationMetadata"
  );

  assert.ok(notificationSave >= 0);
  assert.ok(readinessCheck > notificationSave);
  assert.ok(guardedCompletion > readinessCheck);
  assert.ok(completionMetadata > guardedCompletion);
  assert.match(draftBranch, /status: "role_creation_incomplete"/);
  assert.match(draftBranch, /phase: "completed"/);
  assert.match(draftBranch, /notifyOrgRoleCreatedSlack/);
  assert.match(draftBranch, /previousAssistantMessage/);
  assert.match(draftBranch, /userMessage: text\(args\.userMessage\)/);
  assert.doesNotMatch(
    draftBranch,
    /\.filter\(\(channel\) => channel\.enabled\)/
  );
  assert.match(draftBranch, /continuationContext/);
  assert.match(draftBranch, /notification_channel_options/);
  assert.match(draftBranch, /assignee_options/);
  assert.match(draftBranch, /currentSlackChannelId/);
});

test("draft notification selection keeps explicit consent and structural validation", () => {
  const helper = state.slice(
    state.indexOf("function resolveRoleCreationNotificationSelection"),
    state.indexOf("export function getRoleCreationMissingFields")
  );

  assert.match(helper, /Unknown Slack channel/);
  assert.match(helper, /Assignee must be an organization member/);
  assert.match(helper, /validateRoleCreationNotificationConsent/);
  assert.match(helper, /updateOrgRoleNotificationSettings/);
  assert.match(helper, /confirmedSlackChannelIds/);
  assert.match(helper, /confirmedAssigneeUserId/);
});
