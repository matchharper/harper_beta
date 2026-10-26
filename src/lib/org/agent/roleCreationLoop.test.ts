import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chat = readFileSync(
  new URL("./roleCreationChat.ts", import.meta.url),
  "utf8"
);

test("role creation preserves Responses reasoning state between sequential tools", () => {
  assert.match(chat, /_responses_output\?: any\[\]/);
  assert.match(
    chat,
    /_responses_output: Array\.isArray\(responseMessage\._responses_output\)/
  );
});

test("role creation reports confirmed pre-execution rejection separately from later HTTP failures", async () => {
  const { roleCreationToolErrorResult } = await import("./roleCreationChat");
  const { OrgHttpError } = await import("@/lib/org/server");
  const rejected = roleCreationToolErrorResult({ error: new Error("Invalid arguments"), name: "update_role_draft", executed: false });
  assert.match(rejected, /effect Status: not_executed/);
  const partial = roleCreationToolErrorResult({ error: new OrgHttpError(400, "A later field failed"), name: "update_role_draft", executed: true });
  assert.match(partial, /effect Status: unknown/);
  assert.match(partial, /A later field failed/);
});

test("notification errors give the model verified saved settings instead of optimistic requested settings", async () => {
  const { roleCreationToolErrorResult } = await import("./roleCreationChat");
  const { summarizeRoleCreationNotificationSettings } = await import("./roleCreationState");
  const saved = summarizeRoleCreationNotificationSettings({
    channels: [
      { channelId: "enabled", channelName: "recruiting", enabled: true },
      { channelId: "disabled", channelName: "other", enabled: false },
    ],
    assigneeUserIds: ["current-owner"],
    members: [{ userId: "current-owner", name: "Current teammate", email: null }],
  });
  const result = roleCreationToolErrorResult({
    error: new Error("Invalid assignee"), name: "set_role_notification",
    executed: true, savedNotificationSettings: saved,
  });
  assert.match(result, /recruiting/);
  assert.match(result, /Current teammate/);
  assert.doesNotMatch(result, /other/);
  assert.match(result, /effect Status: unknown/);
  assert.match(result, /Compare the requested change/);
  assert.match(result, /without repeating an already clear approval/);
  const unknown = roleCreationToolErrorResult({ error: new Error("Read-back unavailable"), name: "set_role_notification", executed: true });
  assert.doesNotMatch(unknown, /current Notification Settings:/);
});

test("notification executor validates exact targets without reclassifying the user's approval wording", async () => {
  const { resolveRoleCreationNotificationSelection } = await import("./roleCreationState");
  const state = {
    channels: [{ channelId: "available-channel", channelName: "recruiting", enabled: true }],
    members: [{ userId: "available-assignee", name: "Teammate", email: null }],
  } as never;
  const input = { roleId: "role", workspaceId: "workspace", user: { id: "actor" } as never };
  assert.deepEqual(resolveRoleCreationNotificationSelection({
    state, input: { ...input, assigneeUserId: "available-assignee", channelIds: ["available-channel"] },
  }), { assigneeUserId: "available-assignee", channelIds: ["available-channel"], hasAssignee: true, hasChannels: true });
  const assigneeOnly = resolveRoleCreationNotificationSelection({ state, input: { ...input, assigneeUserId: "available-assignee" } });
  assert.equal(assigneeOnly.hasChannels, false);
  assert.throws(() => resolveRoleCreationNotificationSelection({ state, input: { ...input, assigneeUserId: "foreign-assignee" } }), /access to this Role/);
  assert.throws(() => resolveRoleCreationNotificationSelection({ state, input: { ...input, channelIds: ["foreign-channel"] } }), /Unknown Slack channel/);
});

test("role creation does not blindly retry an uncertain calibration write", () => {
  assert.match(
    chat,
    /The saved Hiring Brief may have changed\. Do not immediately repeat calibration/
  );
});
