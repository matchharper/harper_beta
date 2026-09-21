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
const confirmation = readFileSync(
  new URL("./roleCreationConfirmation.ts", import.meta.url),
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
  assert.match(draftBranch, /fetchOrgActiveRoleLimitState/);
  assert.match(draftBranch, /active_role_limit_reached/);
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

test("role creation confirmation checks the active-role limit before claiming the action", () => {
  const limitCheck = confirmation.indexOf("fetchOrgActiveRoleLimitState");
  const claim = confirmation.indexOf("const claimedMetadata");

  assert.ok(limitCheck >= 0);
  assert.ok(claim > limitCheck);
  assert.match(confirmation, /ORG_ACTIVE_ROLE_LIMIT_MESSAGE/);
});

test("new role creation returns a user-safe unchanged result at the active-role limit", () => {
  const startBranch = execution.slice(
    execution.indexOf('if (args.name === "start_role_creation")'),
    execution.indexOf('} else if (args.name === "web_search")')
  );
  const limitResult = startBranch.indexOf('if ("limitReached" in started)');
  const continuationLink = startBranch.indexOf(
    "args.state.requiredSlackContinuationLink"
  );

  assert.ok(limitResult >= 0);
  assert.ok(continuationLink > limitResult);
  assert.match(startBranch, /created: false/);
  assert.match(startBranch, /status: "unchanged"/);
  assert.match(startBranch, /userMessage: ORG_ACTIVE_ROLE_LIMIT_MESSAGE/);
  assert.match(startBranch, /responseGuidance/);
});

test("a new draft is not inserted after the active-role limit is reached", () => {
  const createDraft = state.slice(
    state.indexOf("export async function createOrResumeDraftRole"),
    state.indexOf("export async function fetchRoleCreationState")
  );
  const limitCheck = createDraft.indexOf("fetchOrgActiveRoleLimitState");
  const insert = createDraft.indexOf('.from("company_roles").insert');

  assert.ok(limitCheck >= 0);
  assert.ok(insert > limitCheck);
  assert.match(createDraft, /ORG_ACTIVE_ROLE_LIMIT_MESSAGE/);
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
