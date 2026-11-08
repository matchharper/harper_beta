import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readProactiveHiringOverview } from "./autoIntroToCompanyNotifications";

function fixture(roles: any[] = []) {
  const posted = new Set<string>();
  let key = "", reads = 0;
  const query: any = {
    select() { return query; }, eq() { return query; },
    contains(_column: string, value: any) { key = value.roleSummaryDeliveryKey; return query; },
    not() { return query; },
    async limit() { return { data: posted.has(key) ? [{ id: 1 }] : [], error: null }; },
  };
  const dependencies: any = {
    admin: () => ({ from: () => query }),
    summaries: async () => { reads++; return [{ workspaceId: "workspace", roles }]; },
    locale: async () => "ko",
  };
  return { dependencies, reads: () => reads, post: (k: string) => posted.add(k), key: () => key };
}
const args = { workspaceId: "workspace", channelId: "C1" };
const role = { roleId: "r1", workspaceId: "workspace", roleTitle: "Backend", status: "active", pendingDecisionCount: 3 };

test("the table is offered as material on Monday, Wednesday, Friday in Korea, once per channel and day", async () => {
  const keys = new Set<string>();
  for (const day of [12, 14, 16]) {
    const f = fixture([role]);
    const overview = await readProactiveHiringOverview({ ...args, now: new Date(`2026-10-${day}T08:00:00Z`) }, f.dependencies);
    assert.match(overview!.text, /현재 채용 현황/);
    assert.match(overview!.text, /3명/);
    assert.equal(overview!.complete, true);
    assert.match(f.key(), /:C1$/);
    keys.add(f.key());
  }
  assert.equal(keys.size, 3);
});
test("other weekdays offer no table and read nothing", async () => {
  const f = fixture();
  for (const day of [13, 15, 17, 18])
    assert.equal(await readProactiveHiringOverview({ ...args, now: new Date(`2026-10-${day}T08:00:00Z`) }, f.dependencies), null);
  assert.equal(f.reads(), 0);
});
test("uses the Korean date at midnight", async () => {
  const f = fixture();
  await readProactiveHiringOverview({ ...args, now: new Date("2026-10-15T15:00:00Z") }, f.dependencies);
  const midnight = f.key();
  await readProactiveHiringOverview({ ...args, now: new Date("2026-10-16T08:00:00Z") }, f.dependencies);
  assert.equal(midnight, f.key());
});
test("a table already delivered to this channel today is not offered again", async () => {
  const f = fixture([role]);
  const now = new Date("2026-10-16T08:00:00Z");
  await readProactiveHiringOverview({ ...args, now }, f.dependencies);
  f.post(f.key());
  assert.equal(await readProactiveHiringOverview({ ...args, now }, f.dependencies), null);
  assert.ok(await readProactiveHiringOverview({ ...args, channelId: "C2", now }, f.dependencies));
});
test("a long table is cut and marked incomplete", async () => {
  const roles = Array.from({ length: 200 }, (_, i) => ({ ...role, roleId: `r${i}`, roleTitle: `Role ${i} ${"x".repeat(40)}` }));
  const overview = await readProactiveHiringOverview({ ...args, now: new Date("2026-10-16T08:00:00Z") }, fixture(roles).dependencies);
  assert.equal(overview!.text.length, 4000);
  assert.equal(overview!.complete, false);
});
test("nothing posts the table outside Harper's own message", () => {
  const processor = readFileSync(new URL("../org/agent/webActionProcessor.server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(processor, /HiringOverview/);
  const review = readFileSync(new URL("../org/agent/proactiveReview.server.ts", import.meta.url), "utf8");
  assert.match(review, /readProactiveHiringOverview/);
});
