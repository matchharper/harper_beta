import { test } from "node:test";
import assert from "node:assert/strict";
import { planSlackConnectionReminder, type ReminderRecipient, type ReminderReceipt } from "./slackConnectionReminder";
import { companyEmailTopicEnabled } from "./companyPreferencesContract";
import { resolveCompanyCapabilities } from "../org/agent/capabilities/resolver";

const person: ReminderRecipient = { id: "a", name: null, locale: "ko", verifiedEmail: true, suppressed: false,
  workspaces: [{ name: "A", internal: true, membership: "owner", setupUrl: "https://example.invalid/settings",
    roles: [{ name: "Engineer", active: true, testOnly: false, canDeliverToSlack: false, setupNeeded: "Connect channel",
      pendingConnectionCount: 0, readyCandidateCount: 0, previouslyPresentedReadyCount: 0 }] }] };
const receipt = (day: number, id: string, recipientId = "a"): ReminderReceipt => ({ recipientId, eventId: id, sentAt: `2026-10-${day}T01:00:00Z` });
const at = (day: number) => new Date(`2026-10-${day}T01:00:00Z`);

test("empty candidates remain eligible and multiple workspaces share one recipient event", () => {
  const p = { ...person, workspaces: [...person.workspaces, { ...person.workspaces[0]!, name: "B" }] };
  const plan = planSlackConnectionReminder(p, [], at(12))!;
  assert.equal(plan.facts.workspaces.length, 2);
  assert.equal(plan.eventKey, "slack-connection/a/1");
});
test("48h then 72h gaps; Mon/Wed/Fri KST only", () => {
  assert.equal(planSlackConnectionReminder(person, [receipt(12,"1")], at(13)), null);
  assert.equal(planSlackConnectionReminder(person, [receipt(12,"1")], new Date("2026-10-14T00:59:59Z")), null);
  assert.equal(planSlackConnectionReminder(person, [receipt(12,"1")], at(14))?.round, 2);
  assert.equal(planSlackConnectionReminder(person, [receipt(12,"1"),receipt(14,"2")], at(16)), null);
  assert.equal(planSlackConnectionReminder(person, [receipt(12,"1"),receipt(14,"2")], at(19))?.round, 3);
});
test("cap and receipts are person-wide; transport retries do not count twice", () => {
  const history = [receipt(12,"1"),receipt(14,"2"),receipt(19,"3")];
  assert.equal(planSlackConnectionReminder(person, history, at(21)), null);
  assert.equal(planSlackConnectionReminder({ ...person, id: "b" }, history, at(21))?.round, 1);
  assert.equal(planSlackConnectionReminder(person, [receipt(12,"1"),receipt(12,"1")], at(14))?.round, 2);
});
test("suppression, revoked privilege, connected roles and fixtures are excluded", () => {
  assert.equal(planSlackConnectionReminder({ ...person, suppressed: true }, [], at(12)), null);
  assert.equal(planSlackConnectionReminder({ ...person, verifiedEmail: false }, [], at(12)), null);
  for (const change of [{ active:false },{ testOnly:true },{ canDeliverToSlack:true }]) {
    const p = structuredClone(person); Object.assign(p.workspaces[0]!.roles[0]!, change);
    assert.equal(planSlackConnectionReminder(p, [], at(12)), null);
  }
  const p = structuredClone(person); p.workspaces[0]!.membership = "member";
  assert.equal(planSlackConnectionReminder(p, [], at(12)), null);
});
test("all-email suppression overrides one topic resume", () => {
  assert.equal(companyEmailTopicEnabled({ all_proactive:false, slack_connection:true }, "slack_connection"), false);
  assert.equal(companyEmailTopicEnabled({ slack_connection:false }, "slack_connection"), false);
  assert.equal(companyEmailTopicEnabled({}, "slack_connection"), true);
});
test("preference schema and policy load on first email completion but remain lazy in chat", () => {
  const input = { surface: "chat" as const, mode: "progressive" as const, loaded: new Set<never>() };
  const chat = resolveCompanyCapabilities(input);
  assert(!chat.offeredToolNames.has("update_email_preferences"));
  assert(chat.catalogText.includes("email_preferences"));
  const email = resolveCompanyCapabilities({ ...input, emailReply:true });
  assert(email.offeredToolNames.has("update_email_preferences"));
  assert(email.policyIds.includes("email_preferences"));
  const restricted = resolveCompanyCapabilities({ ...input, emailReply:true, allowedToolNames:new Set(["read_role"]) });
  assert(!restricted.offeredToolNames.has("update_email_preferences"));
});
