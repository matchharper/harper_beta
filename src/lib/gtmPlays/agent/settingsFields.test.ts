import assert from "node:assert/strict";
import test from "node:test";
import { cleanCompanyMailMinCandidates, cleanHandoffSlackUserId, replySettingsFromRow } from "./settingsFields";

test("넘길 사람 Slack: a user id, also pasted as a mention; anything else is no one", () => {
  assert.equal(cleanHandoffSlackUserId("U01ABCDEF"), "U01ABCDEF");
  assert.equal(cleanHandoffSlackUserId(" <@u01abcdef> "), "U01ABCDEF");
  assert.equal(cleanHandoffSlackUserId("<@U01ABCDEF|someone>"), "U01ABCDEF");
  assert.equal(cleanHandoffSlackUserId("@W0123XYZ"), "W0123XYZ");
  assert.equal(cleanHandoffSlackUserId("someone"), null);
  assert.equal(cleanHandoffSlackUserId(""), null);
  assert.equal(cleanHandoffSlackUserId(null), null);
});

test("회사 메일 최소 후보 수: a whole number from 1 to 10, 2 when missing", () => {
  assert.equal(cleanCompanyMailMinCandidates(3), 3);
  assert.equal(cleanCompanyMailMinCandidates("4"), 4);
  assert.equal(cleanCompanyMailMinCandidates(2.6), 3);
  assert.equal(cleanCompanyMailMinCandidates(0), 1);
  assert.equal(cleanCompanyMailMinCandidates(99), 10);
  assert.equal(cleanCompanyMailMinCandidates(null), 2);
  assert.equal(cleanCompanyMailMinCandidates(""), 2);
  assert.equal(cleanCompanyMailMinCandidates("x"), 2);
});

test("from the settings row: the stored values, the defaults before the columns are there", () => {
  assert.deepEqual(replySettingsFromRow({}), { replyAgentEnabled: true, handoffSlackUserId: null, companyMailMinCandidates: 2 });
  assert.deepEqual(
    replySettingsFromRow({ reply_agent_enabled: false, handoff_slack_user_id: "U01ABCDEF", company_mail_min_candidates: 3 }),
    { replyAgentEnabled: false, handoffSlackUserId: "U01ABCDEF", companyMailMinCandidates: 3 },
  );
  assert.equal(replySettingsFromRow({ reply_agent_enabled: null }).replyAgentEnabled, true);
});
