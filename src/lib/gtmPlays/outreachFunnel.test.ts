import assert from "node:assert/strict";
import test from "node:test";
import {
  attributeOptOuts,
  formatClickWait,
  formatKstMinute,
  groupOutreachMails,
  median,
  outreachBounce,
  outreachRate,
  tallyOutreachMails,
  type OutreachFunnelMail,
} from "./outreachFunnel";

const base: OutreachFunnelMail = {
  id: "m0", roleKey: "role-a", roleId: "role-a", roleName: "Role A", source: "scraped", toEmail: "a@example.com",
  sentAt: "2026-11-16T00:00:00.000Z", bounce: null, unsubscribed: false, clickedAt: null, signedUpAt: null,
  stage: null, connected: false,
};
const mail = (patch: Partial<OutreachFunnelMail>): OutreachFunnelMail => ({ ...base, ...patch });

test("each step counts its own mails; the click wait is the median", () => {
  const numbers = tallyOutreachMails([
    mail({ id: "1", bounce: "bounced" }),
    mail({ id: "2", bounce: "complained", unsubscribed: true }),
    mail({ id: "3", clickedAt: "2026-11-16T02:00:00.000Z" }),
    mail({ id: "4", clickedAt: "2026-11-16T06:00:00.000Z", signedUpAt: "2026-11-16T06:10:00.000Z", stage: "hidden" }),
    mail({ id: "5", clickedAt: "2026-11-16T10:00:00.000Z", signedUpAt: "2026-11-16T10:05:00.000Z", stage: "applied", connected: true }),
    mail({ id: "6", stage: "saved" }),
  ]);
  assert.deepEqual(numbers, {
    sent: 6, bounced: 2, unsubscribed: 1, clicked: 3, signedUp: 2, reacted: 2, connected: 1, medianClickMs: 6 * 3_600_000,
  });
  assert.equal(tallyOutreachMails([]).medianClickMs, null);
});

test("rows per Role, newest send first, split by source", () => {
  const rows = groupOutreachMails([
    mail({ id: "1", roleKey: "role-a", source: "member", clickedAt: "2026-11-16T01:00:00.000Z" }),
    mail({ id: "2", roleKey: "role-a", source: "scraped", sentAt: "2026-11-16T03:00:00.000Z" }),
    mail({ id: "3", roleKey: "posting:Sales Lead", roleId: null, roleName: "Sales Lead", source: "external", sentAt: "2026-11-17T00:00:00.000Z" }),
  ]);
  assert.deepEqual(rows.map((row) => [row.key, row.numbers.sent, row.lastSentAt]), [
    ["posting:Sales Lead", 1, "2026-11-17T00:00:00.000Z"],
    ["role-a", 2, "2026-11-16T03:00:00.000Z"],
  ]);
  const roleA = rows[1];
  assert.equal(roleA.bySource.member.sent, 1);
  assert.equal(roleA.bySource.member.clicked, 1);
  assert.equal(roleA.bySource.scraped.sent, 1);
  assert.equal(roleA.bySource.external.sent, 0);
});

test("an opt-out on the list is counted on the latest mail sent before it", () => {
  const mails = [
    { id: "old", toEmail: "a@example.com", sentAt: "2026-11-01T00:00:00.000Z" },
    { id: "new", toEmail: "a@example.com", sentAt: "2026-11-10T00:00:00.000Z" },
    { id: "after", toEmail: "a@example.com", sentAt: "2026-11-20T00:00:00.000Z" },
    { id: "other", toEmail: "b@example.com", sentAt: "2026-11-10T00:00:00.000Z" },
    { id: "earlier-optout", toEmail: "c@example.com", sentAt: "2026-11-10T00:00:00.000Z" },
  ];
  const optOuts = new Map([
    ["a@example.com", "2026-11-12T00:00:00.000Z"],
    ["c@example.com", "2026-11-01T00:00:00.000Z"],
  ]);
  assert.deepEqual([...attributeOptOuts(mails, optOuts)], ["new"]);
});

test("rates, bounce values and waits", () => {
  assert.equal(outreachRate(12, 50), 24);
  assert.equal(outreachRate(1, 3), 33);
  assert.equal(outreachRate(0, 0), null);
  assert.equal(outreachBounce("complained"), "complained");
  assert.equal(outreachBounce("delayed"), null);
  assert.equal(outreachBounce(null), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(formatClickWait(null), "—");
  assert.equal(formatClickWait(10_000), "1분");
  assert.equal(formatClickWait(35 * 60_000), "35분");
  assert.equal(formatClickWait(6 * 3_600_000), "6시간");
  assert.equal(formatClickWait(47 * 3_600_000), "47시간");
  assert.equal(formatClickWait(3 * 86_400_000), "3일");
});

test("times read in Korea time as MM/DD HH:mm", () => {
  assert.equal(formatKstMinute("2026-11-16T01:12:00Z"), "11/16 10:12");
  assert.equal(formatKstMinute("2026-11-16T15:05:00Z"), "11/17 00:05");
  assert.equal(formatKstMinute(null), "—");
  assert.equal(formatKstMinute("not a date"), "—");
});
