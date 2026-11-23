import assert from "node:assert/strict";
import test from "node:test";
import { cleanHandoffSlackUserId, replySettingsFromRow } from "./settingsFields";

test("넘길 사람 Slack: a user id, also pasted as a mention; anything else is no one", () => {
  assert.equal(cleanHandoffSlackUserId("U01ABCDEF"), "U01ABCDEF");
  assert.equal(cleanHandoffSlackUserId(" <@u01abcdef> "), "U01ABCDEF");
  assert.equal(cleanHandoffSlackUserId("<@U01ABCDEF|someone>"), "U01ABCDEF");
  assert.equal(cleanHandoffSlackUserId("@W0123XYZ"), "W0123XYZ");
  assert.equal(cleanHandoffSlackUserId("someone"), null);
  assert.equal(cleanHandoffSlackUserId(""), null);
  assert.equal(cleanHandoffSlackUserId(null), null);
});

test("from the settings row: the stored values, the defaults before the columns are there", () => {
  assert.deepEqual(replySettingsFromRow({}), { replyAgentEnabled: false, handoffSlackUserId: null });
  assert.deepEqual(
    replySettingsFromRow({ reply_agent_enabled: false, handoff_slack_user_id: "U01ABCDEF" }),
    { replyAgentEnabled: false, handoffSlackUserId: "U01ABCDEF" },
  );
  assert.equal(replySettingsFromRow({ reply_agent_enabled: null }).replyAgentEnabled, false);
});
