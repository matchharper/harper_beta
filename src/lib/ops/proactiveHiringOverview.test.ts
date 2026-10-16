import assert from "node:assert/strict";
import test from "node:test";
import { sendProactiveHiringOverview } from "./autoIntroToCompanyNotifications";

function fixture() {
  const posted = new Set<string>();
  const sends: any[] = [];
  let key = "", fail = false, reads = 0;
  const query: any = {
    select() { return query; }, eq() { return query; },
    contains(_column: string, value: any) { key = value.roleSummaryDeliveryKey; return query; },
    not() { return query; },
    async limit() { return { data: posted.has(key) ? [{ id: 1 }] : [], error: null }; },
  };
  const dependencies: any = {
    admin: () => ({ from: () => query }),
    summaries: async () => { reads++; return [{ workspaceId: "workspace", roles: [] }]; },
    locale: async () => "ko",
    send: async (args: any) => {
      sends.push(args);
      if (fail) return { slackSent: false, slackError: "unavailable" };
      posted.add(key);
      return { slackSent: true };
    },
  };
  return { dependencies, sends, reads: () => reads, fail: (value: boolean) => { fail = value; } };
}
const args = { workspaceId: "workspace", channelId: "C1" };

test("overview remains due on Monday, Wednesday, Friday in Korea, independently of any model reply", async () => {
  for (const day of [12, 14, 16]) {
    const f = fixture();
    await sendProactiveHiringOverview({ ...args, now: new Date(`2026-10-${day}T08:00:00Z`) }, f.dependencies);
    assert.equal(f.sends.length, 1);
    assert.equal(f.sends[0].channelId, "C1");
    assert.equal(f.sends[0].dateKey, `2026-10-${day}`);
  }
});
test("other weekdays do not fetch or deliver an overview", async () => {
  const f = fixture();
  for (const day of [13, 15, 17, 18]) {
    await sendProactiveHiringOverview({ ...args, now: new Date(`2026-10-${day}T08:00:00Z`) }, f.dependencies);
  }
  assert.equal(f.reads(), 0);
  assert.equal(f.sends.length, 0);
});
test("uses the Korean date at midnight", async () => {
  const f = fixture();
  await sendProactiveHiringOverview({ ...args, now: new Date("2026-10-15T15:00:00Z") }, f.dependencies);
  assert.equal(f.sends[0].dateKey, "2026-10-16");
});
test("retry skips delivered overview but another channel and next due date remain eligible", async () => {
  const f = fixture();
  const now = new Date("2026-10-16T08:00:00Z");
  await sendProactiveHiringOverview({ ...args, now }, f.dependencies);
  await sendProactiveHiringOverview({ ...args, now }, f.dependencies);
  assert.equal(f.sends.length, 1);
  await sendProactiveHiringOverview({ ...args, channelId: "C2", now }, f.dependencies);
  await sendProactiveHiringOverview({ ...args, now: new Date("2026-10-19T08:00:00Z") }, f.dependencies);
  assert.equal(f.sends.length, 3);
});
test("failure propagates to the existing queue and can be retried", async () => {
  const f = fixture();
  const request = { ...args, now: new Date("2026-10-16T08:00:00Z") };
  f.fail(true);
  await assert.rejects(sendProactiveHiringOverview(request, f.dependencies), /unavailable/);
  f.fail(false);
  await sendProactiveHiringOverview(request, f.dependencies);
  assert.equal(f.sends.length, 2);
});
