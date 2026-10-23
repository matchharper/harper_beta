import assert from "node:assert/strict";
import test from "node:test";
import { leavesRoleWithoutNotificationDestination } from "./roleNotificationDestinations";

const oneChannel = [{ channelId: "C_HIRING", enabled: true }];

test("turning email on is always saved", () => {
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: oneChannel, emailEnabled: false,
    update: { channels: new Map(), emailEnabled: true },
  }), false);
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: [], emailEnabled: false,
    update: { channels: new Map(), emailEnabled: true },
  }), false);
});

test("turning off the last channel while email is off is rejected", () => {
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: oneChannel, emailEnabled: false,
    update: { channels: new Map([["C_HIRING", false]]) },
  }), true);
  // Email off and the last channel off in the same save.
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: oneChannel, emailEnabled: true,
    update: { channels: new Map([["C_HIRING", false]]), emailEnabled: false },
  }), true);
  // Email off on a mail-only role.
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: [{ channelId: "C_HIRING", enabled: false }], emailEnabled: true,
    update: { channels: new Map(), emailEnabled: false },
  }), true);
});

test("the last channel can be turned off once email is on", () => {
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: oneChannel, emailEnabled: true,
    update: { channels: new Map([["C_HIRING", false]]) },
  }), false);
  // Choosing email instead of the channel in one save (the role start's last sentence).
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: oneChannel, emailEnabled: false,
    update: { channels: new Map([["C_HIRING", false]]), emailEnabled: true },
  }), false);
  // Another channel stays on.
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: [...oneChannel, { channelId: "C_OTHER", enabled: true }], emailEnabled: false,
    update: { channels: new Map([["C_HIRING", false]]) },
  }), false);
});

test("a save that turns nothing off passes on a role with no destination", () => {
  // Assignee-only save on a Slack-less company's role.
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: [], emailEnabled: false,
    update: { channels: new Map() },
  }), false);
  // Every channel already off: resending them off with an assignee change turns nothing off.
  assert.equal(leavesRoleWithoutNotificationDestination({
    channels: [{ channelId: "C_HIRING", enabled: false }], emailEnabled: false,
    update: { channels: new Map([["C_HIRING", false]]), emailEnabled: false },
  }), false);
});
